import { createConnection, TextDocuments, ProposedFeatures, ServerCapabilities, TextDocumentChangeEvent, DidChangeConfigurationNotification, Files, DidChangeConfigurationParams } from "vscode-languageserver";
import { VsCodeFileAccessor } from "./fileAccessor";
import { HomeAssistantLanguageService } from "./haLanguageService";
import { YamlIncludeDiscoveryService } from "./yamlIncludeDiscoveryService";
import { HaConnection } from "./haConnection";
import { YamlLanguageServiceWrapper } from "./yamlLanguageServerWrapper";
import { EntityIdCompletionContribution } from "./entityIdCompletion";
import { ConfigurationService } from "./ConfigurationService";

let connection = createConnection(ProposedFeatures.all);
let documents = new TextDocuments();
documents.listen(connection);

var settings: any = {};

connection.onInitialize(async params => {

  connection.console.log(`[Server(${process.pid})] Started and initialize received`);

  var configurationService = new ConfigurationService();
  var haConnection = new HaConnection(configurationService, connection.console.log);
  var vsCodeFileAccessor = new VsCodeFileAccessor(params.rootUri, connection);
  var yamlLanguageServiceWrapper = new YamlLanguageServiceWrapper([ 
    new EntityIdCompletionContribution(haConnection) 
  ]);
  var yamlIncludeDiscoveryService = new YamlIncludeDiscoveryService(vsCodeFileAccessor);
  var homeAsisstantLanguageService = new HomeAssistantLanguageService(
    documents,
    params.rootUri,
    yamlLanguageServiceWrapper,
    yamlIncludeDiscoveryService    
  ); 
  await homeAsisstantLanguageService.triggerSchemaLoad();

  var triggerValidation = async (e: TextDocumentChangeEvent) => {
    var diagnostics = await homeAsisstantLanguageService.getDiagnostics(e);
    if (diagnostics) {
      connection.sendDiagnostics({
        uri: e.document.uri,
        diagnostics: diagnostics
      });
    }
  };

  documents.onDidChangeContent(triggerValidation);
  documents.onDidOpen(triggerValidation);

  connection.client.register(DidChangeConfigurationNotification.type, undefined);
  connection.onDidChangeConfiguration(async (config) => {
    configurationService.updateConfiguration(config);
    await haConnection.notifyConfigUpdate(config);
  });

  connection.onDocumentSymbol(homeAsisstantLanguageService.onDocumentSymbol);
  connection.onDocumentFormatting(homeAsisstantLanguageService.onDocumentFormatting);
  connection.onCompletion(homeAsisstantLanguageService.onCompletion);
  connection.onCompletionResolve(homeAsisstantLanguageService.onCompletionResolve);
  connection.onHover(homeAsisstantLanguageService.onHover);
  connection.onDidChangeWatchedFiles(homeAsisstantLanguageService.onDidChangeWatchedFiles);


  return {
    capabilities: <ServerCapabilities>{
      textDocumentSync: documents.syncKind,
      completionProvider: { triggerCharacters: [" ", ":", "-"], resolveProvider: true },
      hoverProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true
    }
  };
});

connection.listen();
