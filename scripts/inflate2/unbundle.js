var path = require('node:path');
var fs = require('node:fs');
var sqlite3 = require('sqlite3').verbose();

var { createHash } = require('node:crypto');
var { SourceMapConsumer } = require('source-map');
var j = require('jscodeshift');

function get_ast_signature(root, _hash = true, _original = false) {
  const variableNames = [];
  const signature = [];
  root.find(j.Node).forEach((path) => {
    const node = path.node;
    if (node.type === 'Identifier') {
      if (
        (path.parent.node.type === 'MemberExpression' &&
          !path.parent.node.computed &&
          path.parent.node.property === node) ||
        (path.parent.node.type === 'Property' && !path.parent.node.computed && path.parent.node.key === node)
      ) {
        signature.push([node.type, node.name]);
      } else {
        let index = variableNames.indexOf(node.name);
        if (index === -1) {
          index = signature.length;
          variableNames.push(node.name);
        }
        signature.push(_original ? [node.type, index, node.name] : [node.type, index]);
      }
    } else if (path.node.type === 'Literal') {
      signature.push([node.type, node.value]);
    } else {
      signature.push([node.type]);
    }
  });
  return _hash
    ? createHash('md5')
        .update(JSON.stringify(signature, null, 2))
        .digest('base64')
    : signature;
}

function generate_utility_signatures() {
  const root = j(fs.readFileSync(path.join(__dirname, './util-signatures.js.txt')).toString());
  const results = {};
  for (const node of root.nodes()[0].program.body) {
    if (node.type === 'VariableDeclaration') {
      for (const { id, init } of node.declarations) {
        const signature = get_ast_signature(j(init));
        const name = id;
        results[signature] = id.name;
      }
    }
  }

  return results;
}

function collect_utilities(root) {
  const utility_signatures = generate_utility_signatures();

  const optionals = new Set(['__throw', '__privateIn']);

  const results = {};
  let cc = 20;
  const remains = new Set(Object.values(utility_signatures));
  outer: for (const node of root.paths()[0].node.program.body) {
    if (cc-- == 0) break;
    if (node.type === 'VariableDeclaration') {
      for (const { id, init } of node.declarations) {
        const signature = get_ast_signature(j(init));
        const name = utility_signatures[signature];

        if (name) {
          results[id.name] = name;
          remains.delete(name);
          continue;
        }

        if (remains.size === 0) return results;
      }
    }
  }

  console.log({ remains });
  if (Object.values(remains).filter((a) => optionals.has(a)).length > 1)
    throw new Error('failt to resolve utility function');
  return results;
}

function collect_modules(root, consumer, utils) {
  const body = root.paths()[0].node.program.body;
  const n = root.paths()[0].node.program.body.length;
  const cant_resolve = [];
  let i = 0;

  for (; i < n; i++) {
    if (body[i].type === 'VariableDeclaration') break;
  }

  const util_names = new Set(Object.keys(utils));
  for (; i < n && util_names.size > 0; i++) {
    if (body[i].type !== 'VariableDeclaration')
      throw new Error(`[collect_modules] ast node type error ${body[i].type}`);
    for (const decl of body[i].declarations) {
      if (!util_names.has(decl.id.name))
        throw new Error(`[collect_modules] util name error ${decl.id.name}, remaining ${[...util_names]}`);
      util_names.delete(decl.id.name);
    }
  }

  const node_by_source = {};
  const global_vars = new Map();
  const esm_init_functions = {};
  const cjs_init_functions = {};
  const moduel_export = {};
  const module_infos = [];
  for (; i < n; i++) {
    try {
      if (body[i].type === 'VariableDeclaration') {
        const init_nodes = body[i].declarations.filter((node) => node.init);
        if (init_nodes.length > 1) throw new Error('[collect_modules] can not handle');
        const init_node = init_nodes[0];
        if (init_node.init.type === 'CallExpression') {
          const callee_name = utils[init_node.init.callee.name];
          if (callee_name === '__esmMin') {
            const { source } = consumer.originalPositionFor(init_node.init.callee.loc.start);
            node_by_source[source] ??= [];
            node_by_source[source].push(body[i]);
            module_infos.push({
              type: '__esmMin',
              init_function_generated_name: init_node.id.name,
              source,
            });
            global_vars.set(init_node.id.name, {
              type: 'esm_init',
              source,
            });
            for (const decl_node of body[i].declarations) {
              if (decl_node !== init_node) {
                global_vars.set(decl_node.id.name, {
                  type: 'esm_var',
                  source,
                });
              }
            }
          } else if (callee_name === '__commonJSMin') {
            if (body[i].declarations.length !== 1) throw new Error('[collect_modules] unkonwn __commonJSMin');

            const { source: source_start } = consumer.originalPositionFor(init_node.init.loc.start);
            const { source: source_end } = consumer.originalPositionFor(init_node.init.loc.end);
            if (source_start !== source_end) console.log([source_start, source_end]);
            const source = source_end || source_start;

            node_by_source[source] ??= [];
            node_by_source[source].push(body[i]);
            module_infos.push({
              type: '__commonJSMin',
              init_function_generated_name: init_node.id.name,
              source,
            });
            global_vars.set(init_node.id.name, { type: 'cjs_init', source });
          } else throw new Error('[collect_modules] neither __esmMin, __commonJSMin');
        } else if (init_node.init.type === 'ObjectExpression' && init_node.init.properties.length === 0) {
          i++;
          const next_node = body[i];
          if (
            next_node.type === 'ExpressionStatement' &&
            next_node.expression.type === 'CallExpression' &&
            utils[next_node.expression.callee.name] === '__export' &&
            next_node.expression.arguments[0].name === init_node.id.name
          ) {
            const { source } = consumer.originalPositionFor(next_node.expression.callee.loc.start);

            module_infos.push({
              type: '__export',
              exports_generated_name: next_node.expression.callee.name,
              source: consumer.originalPositionFor(next_node.expression.callee.loc.start).source,
            });
            node_by_source[source] ??= [];
            node_by_source[source].push(body[i - 1]);
            node_by_source[source].push(body[i]);
            global_vars.set(body[i - 1].declarations[0].id.name, { type: 'export', source });
          } else throw new Error('[collect_modules] can not handle');
        }
        // else if (init_node.init.type === 'ClassExpression') {
        //   const { source } = consumer.originalPositionFor(init_node.init.loc.start);
        //   node_by_source[source].push(body[i]);
        //   global_vars.set(init_node.id.name, { type: 'other', source });
        // }
        else throw new Error('[collect_modules] can not handle');
      } else if (body[i].type === 'FunctionDeclaration') {
        const { source } = consumer.originalPositionFor(body[i].id.loc.start);
        global_vars.set(body[i].id.name, { type: 'function', source });
        node_by_source[source] ??= [];
        node_by_source[source].push(body[i]);
      } else if (body[i].expression?.type === 'CallExpression') {
        if (
          utils[body[i].expression.callee?.name] === '__name' &&
          body[i - 1].type === 'FunctionDeclaration' &&
          body[i - 1].id.name === body[i].expression.arguments[0].name
        ) {
          const { source } = consumer.originalPositionFor(body[i - 1].id.loc.start);
          node_by_source[source] ??= [];
          node_by_source[source].push(body[i]);
        } else throw new Error('[collect_modules] can not handle');
      } else throw new Error('[collect_modules] can not handle');
      continue;
    } catch (e) {
      // console.log(e);
    }

    const { source: source_start } = consumer.originalPositionFor(body[i].loc.start);
    const { source: source_end } = consumer.originalPositionFor(body[i].loc.start);
    if (source_start !== source_end) {
      console.log('unresolve', [source_start, source_end]);
    }
    const source = source_end || source_start;
    node_by_source[source] ??= [];
    node_by_source[source].push(body[i]);
    cant_resolve.push(body[i]);
    if (body[i].type === 'VariableDeclaration') {
      for (const decl of body[i].declarations) {
        global_vars.set(decl.id.name, {
          type: 'unknown',
          source,
        });
      }
    }
  }

  // const entry_point = consumer.originalPositionFor(
  //   root.paths()[0].node.program.body[root.paths()[0].node.program.body.length - 1].loc.end
  // ).source;
  //
  // if (entry_point && consumer.originalPositionFor(body[i].loc.start).source === entry_point) {
  //   node_by_source['../agent/src/main.ts'] ??= [];
  //   for (; i < n; i++) {
  //     node_by_source['../agent/src/main.ts'].push(body[i]);
  //   }
  // } else throw new Error('[collect_modules] can not handle, not reaching entry point');
  return { module_infos, node_by_source, global_vars, cant_resolve };
}

function collect_imports(node_by_source, consumer, global_vars, cjs_generated_name) {
  const results = new Map();
  if (!cjs_generated_name) {
    throw new Error('cjs_generated_name: ${cjs_generated_name}');
  }

  for (const [source, root_nodes] of Object.entries(node_by_source)) {
    if (source.includes('/node_modules/')) continue;
    for (const root_node of root_nodes) {
      // if (root_node.type === 'FunctionDeclaration') continue;
      // TODO: didn't cover dynamic import
      // require_register_$_yV() // ../../node_modules/source-map-support/register.js
      // certs=require_windows_ca_certs_$_XLe().all(); // ../../../node_modules/windows-ca-certs/index.js
      j(root_node)
        .find(j.AssignmentExpression, (node) => {
          if (
            global_vars.has(node.left.name) &&
            node.right.type === 'CallExpression' &&
            // may not have callee when it's iife
            ['require', cjs_generated_name].includes(node.right.callee?.name) &&
            consumer.originalPositionFor(node.loc.start).source?.includes('/node_modules/') === false
          )
            return true;
          return false;
        })
        .forEach((path) => {
          const pos = consumer.originalPositionFor(path.node.left.loc.start);
          const res = { name: pos.name, source: pos.source };
          let node = path.node.right;
          if (node.arguments.length > 1) {
            console.log('[>1]', j(path.node).toSource());
            // throw new Error('args > 1');
          }
          if (node.callee.name === cjs_generated_name) {
            node = node.arguments[0];
          }
          if (node.callee.name === 'require') {
            res.deps = node.arguments[0].value;
          } else {
            const global_var_info = global_vars.get(node.callee.name);
            if (global_var_info?.type === 'esm_init') {
              res.deps = global_vars.get(node.callee.name).source;
              res.import_type = 'esm';
            } else if (global_var_info?.type === 'cjs_init') {
              res.deps = global_vars.get(node.callee.name).source;
              res.import_type = 'cjs';
            } else {
              console.log({ global_var_info });
              throw new Error('unknown import type ');
            }
          }
          results.set(path.node.left.name, res);
        });
    }
  }

  for (const [source, root_nodes] of Object.entries(node_by_source)) {
    if (source.includes('/node_modules/')) continue;
    console.log('[collect member]', source);
    for (const root_node of root_nodes) {
      // if (root_node.type === 'FunctionDeclaration') continue; // though global function would depends on import but it's not the case when import nodejs built in modules
      j(root_node)
        .find(j.MemberExpression, (node) => {
          return results.has(node.object.name);
        })
        .forEach((path) => {
          const info = results.get(path.node.object.name);
          if (results.has(path.node.object.name)) {
            // results[path.node.object.name].imports ??= new Set();
            info.imports ??= {};
            info.imports[path.node.property.name] = consumer.originalPositionFor(path.node.property.loc.start).name;
          }
        });
    }
  }

  return results;
}

function collect_dependencies(node_by_source, consumer, global_vars, imported_vars) {
  const to_skip = new Set(
    [...imported_vars.entries()].flatMap(([k, { init_function_generated_name: n }]) => (n ? [k, n] : [k]))
  );
  const imports = {};
  const exports = {};

  for (const [source, global_node] of Object.entries(node_by_source)) {
    if (source.includes('/node_modules/') || global_node.type === 'FunctionDeclaration') continue;
    j(global_node)
      .find(j.Identifier)
      .forEach((path) => {
        const var_info = global_vars.get(path.node.name);
        if (
          to_skip.has(path.node.name) ||
          skip_name_mapping(path) ||
          !var_info ||
          var_info.type === 'esm_init' ||
          var_info.type === 'cjs_init'
        )
          return;
        if (source !== var_info.source) {
          const { name } = consumer.originalPositionFor(path.node.loc.start);
          imports[source] ??= {};
          imports[source][var_info.source] ??= {};
          imports[source][var_info.source][path.node.name] ??= name;
          if (source.includes('/node_modules/') === false) {
            exports[var_info.source] ??= {};
            exports[var_info.source][path.node.name] ??= name;
          }
        }
      });
  }
  return { imports, exports };
}

function skip_name_mapping(path) {
  const parentNode = path.parent.node;
  let res = null;
  if (parentNode.type === 'MemberExpression' && parentNode.property === path.node && !parentNode.computed) {
    res = path.node.name;
  }
  // Handle object property definitions (e.g., { member: value })
  if (parentNode.type === 'Property' || parentNode.type === 'MethodDefinition')
    if (parentNode.key === path.node && !parentNode.computed) {
      res = path.node.name;
    }

  // Handle object destructuring (e.g., const { member } = obj)
  // if (parentNode.type === 'ObjectPattern' && parentNode.properties.some(prop => prop.key === path.node && !prop.computed)) {
  //   return true;
  // }

  return !!res;
}

async function run(workdir) {
  var bundle_file = path.join(workdir, 'language-server.js');
  var code = fs.readFileSync(bundle_file).toString();
  var consumer = await new SourceMapConsumer(JSON.parse(fs.readFileSync(bundle_file + '.map')));

  console.log('start parsing');
  var root = j(code);
  console.log('parsed');

  var utils = collect_utilities(root);
  var name_generated_name = Object.entries(utils).find(([a, b]) => b === '__name')[0];
  var cjs_generated_name = Object.entries(utils).find(([a, b]) => b === 'cjsImport')[0];
  console.log({ utils, name_generated_name, cjs_generated_name });
  var { node_by_source, global_vars } = collect_modules(root, consumer, utils);
  console.log('global_vars');
  var imported_vars = collect_imports(node_by_source, consumer, global_vars, cjs_generated_name);
  console.log('imported_vars');
  var deps = collect_dependencies(node_by_source, consumer, global_vars, imported_vars);
  console.log('deps');
  await fs.promises.writeFile(
    path.join(workdir, 'bundle_analysis.json'),
    JSON.stringify(
      {
        utils,
        name_generated_name,
        cjs_generated_name,
        global_vars: [...global_vars.entries()],
        imported_vars: [...imported_vars.entries()],
        deps,
      },
      null,
      2
    )
  );

  const db = new sqlite3.Database(path.join(workdir, 'raw.sqlite3'));

  let resolve;

  db.serialize(() => {
    // Create a table if it doesn't exist
    const createTableSQL = `
    CREATE TABLE IF NOT EXISTS raw_content (
      filename TEXT PRIMARY KEY,
      source TEXT,
      locs TEXT
    )`;
    db.run(createTableSQL);
    const stmt = db.prepare(`INSERT OR REPLACE INTO raw_content (filename, source, locs) VALUES ($1, $2, $3)`);

    for (const filename of Object.keys(node_by_source)) {
      console.log(filename);
      if (filename.includes('/node_modules/')) continue;
      const [source, locs] = serialize(node_by_source[filename]);
      stmt.run(filename, source, JSON.stringify(locs));
    }
    stmt.finalize();
  });
  db.close();
}

function serialize(nodes) {
  const locs = [];
  const root = j(j.file(j.program(nodes)));
  root.find(j.Node).forEach((path) => {
    if (!path.node.loc) {
      locs.push(null);
      return;
    }
    const { start, end } = path.node.loc;
    locs.push([start.line, start.column, start.token, end.line, end.column, end.token]);
  });
  return [root.toSource(), locs];
}

exports.run = run;
