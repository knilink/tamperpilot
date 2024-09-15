var cp = require('node:child_process');
var rpc = require('vscode-jsonrpc/node');
var { LogMessageNotification } = require('vscode-languageserver/node.js');

var childProcess = cp.spawn('node', [...process.argv.slice(2)]);

var connection = rpc.createMessageConnection(
  new rpc.StreamMessageReader(childProcess.stdout),
  new rpc.StreamMessageWriter(childProcess.stdin)
);

connection.listen();

connection.onNotification(LogMessageNotification.type, (params) => {
  console.log('[LogMessageNotification]', params);
});

connection.onRequest('window/showMessageRequest', (params) => {
  console.log(`[window/showMessageRequest] ${JSON.stringify(params)}`);
});

var dummyDoc = {
  uri: 'file:///home/tamperpilot/utils.py',
  content: `import datetime
def calculate_age(birth_year):
    """Calculates a person's age based on their birth year."""
    current_year = datetime.date.today().year

    return age`,
};

async function run() {
  const initialize = await connection.sendRequest('initialize', {
    prodessId: process.pid,
    initializationOptions: {},
    // workspaceFolders: [{ name: 'node-ollama-copilot', uri: 'file:///home/link/workspace/node-ollama-copilot/' }],
    capabilities: { workspace: false && { workspaceFolders: { supported: true } } },
  });
  await connection.sendNotification('initialized', {});

  console.log('initialize', JSON.stringify(initialize));

  const didOpen = await connection.sendNotification('textDocument/didOpen', {
    textDocument: {
      uri: dummyDoc.uri,
      languageId: 'python',
      version: 1,
      text: dummyDoc.content,
    },
  });

  await connection.sendRequest('setEditorInfo', {
    editorInfo: {
      name: 'dummy',
      version: 'dummy',
    },
    editorPluginInfo: { name: 'dummy', version: 'dummy' },
    // editorConfiguration: Type.Optional(Type.Object({})),
    // networkProxy: Type.Optional(NetworkProxy),
    // authProvider: { url: 'http://localhost:8001' },
    // redirectTelemetry: Type.Optional(Type.Boolean()),
    // options: Type.Optional(Type.Object({})),
  });

  const completion = await connection.sendRequest('getCompletions', {
    doc: {
      version: 1,
      source: '\n',
      path: '',
      uri: dummyDoc.uri,
      relativePath: '',
      languageId: 'python',
      position: { line: 4, character: 0 },
    },
  });
  console.log('completion', JSON.stringify(completion));
  process.exit(0);
}

run();
