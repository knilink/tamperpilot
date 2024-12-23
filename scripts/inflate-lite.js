var fs = require('fs');
var { SourceMapConsumer } = require('source-map');
var prettier = require('prettier');

var j = require('jscodeshift');

function encoder(orignal_name, generated_name) {
  if (orignal_name.includes('_$_') || generated_name.includes('_$_')) {
    throw new Error(`could not encode name ${orignal_name}, ${generated_name}`);
  }
  return `${orignal_name}_$_${generated_name}`;
}

function collect_globals(root, consumer) {
  const g = new Map();
  function handle_id(node) {
    const { name } = consumer.originalPositionFor(node.loc.start);
    if (name) {
      g.set(node.name, name);
    }
  }
  for (const node of root.paths()[0].node.program.body) {
    if (node.type === 'VariableDeclaration') {
      for (const { id } of node.declarations) {
        handle_id(id);
      }
    } else if (node.type === 'FunctionDeclaration') {
      handle_id(node.id);
    }
  }
  return g;
}

function collect_imports(root, consumer) {
  const i = new Map();
  root.find(j.Identifier).forEach((path) => {
    if (!path.node.loc) return;
    let { name } = consumer.originalPositionFor(path.node.loc.start);
    if (name?.startsWith('import_')) {
      i.set(path.node.name, name);
    }
  });
  return i;
}

async function run() {
  const bundle_file = process.argv[process.argv.length - 1];
  const code = fs.readFileSync(bundle_file).toString();
  var consumer = await new SourceMapConsumer(JSON.parse(fs.readFileSync(`${bundle_file}.map`)));
  var root = j(code);
  let imports = collect_imports(root, consumer);
  let globalVars = collect_globals(root, consumer);

  root.find(j.Identifier).forEach((path) => {
    if (!path.node.loc) return;
    const { line, column } = path.node.loc.start;
    let { name } = consumer.originalPositionFor(path.node.loc.start);

    name ??= globalVars.get(path.node.name);
    name ??= imports.get(path.node.name);

    if (name) {
      const encoded_name = encoder(name, path.node.name);
      path.node.name = encoded_name;
      console.log(name);
    }
  });

  root.find(j.Program).forEach((path) => {
    const programBody = path.node.body;

    let lastSource;
    path.node.body = path.node.body.flatMap((node) => {
      if (!node.loc) return [node];
      const { source } = consumer.originalPositionFor(node.loc.start);
      if (!source || source === lastSource) return [node];
      lastSource = source;
      const commentText = ` SOURCE_PATH: ${source} `;
      console.log(source);
      // if (!commentText) return; // Skip nodes without comments

      // Create a comment node
      const emptyNode = j.emptyStatement();
      emptyNode.comments = [j.commentLine(commentText)];

      // Insert the comment before the current node in the body
      return [emptyNode, node];
    });
  });
  fs.writeFileSync(
    bundle_file.replace(/\.js$/, '-inflated.js'),
    await prettier.format(root.toSource(), {
      parser: 'babel',
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      useTabs: false,
    })
  );
}
run();
