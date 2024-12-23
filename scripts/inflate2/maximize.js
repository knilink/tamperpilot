var path = require('node:path');
var fs = require('node:fs');
var sqlite3 = require('sqlite3').verbose();
var j = require('jscodeshift');
var { SourceMapConsumer } = require('source-map');

function process_package_json(filename, body) {
  'use strict';
  if (body.length > 1) {
    throw new Error('process_package_json body.length>1');
  }
  const package_json = Function(
    '"use strict";return ' + j(j(body[0]).find(j.AssignmentExpression).paths()[0].node.right).toSource()
  )();
  return JSON.stringify(package_json, null, 2);
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

function process_file(filename, body, locmap, consumer, imported_vars, deps, global_vars, name_generated_name = 's') {
  const import_statements = [];
  const to_rename = new Map();
  const to_replace = [];
  const to_skip_renaming = new Set();
  const imported = new Set();
  for (const [name, value] of imported_vars.entries()) {
    if (value.source !== filename) continue;
    let module_name = value.deps;
    if (module_name.startsWith('../')) {
      module_name = path.relative(path.dirname(filename), module_name);
      if (module_name[0] !== '.') module_name = './' + module_name;
    }

    if (!value.name.startsWith('import_')) {
      import_statements.push([`import * as ${value.name} from "${module_name}"`, module_name, 0]);
      imported.add(value.deps);
      for (const [exported_name, alias] of Object.entries(value.imports ?? {})) {
        if (alias) {
          throw new Error(`unexpected alias: ${alias}`);
        }
        // specifiers.add(alias ? `${exported_name} as ${alias}` : `${exported_name}`);
        to_replace.push([
          { type: 'MemberExpression', computed: false, object: { name }, property: { name: exported_name } },
          j.memberExpression(j.identifier(value.name), j.identifier(exported_name)),
        ]);
        to_skip_renaming.add(name);
        to_skip_renaming.add(exported_name);
      }
    } else {
      const specifiers = new Set();
      for (const [exported_name, alias] of Object.entries(value.imports ?? {})) {
        specifiers.add(alias ? `${exported_name} as ${alias}` : `${exported_name}`);
        to_replace.push([
          { type: 'MemberExpression', computed: false, object: { name }, property: { name: exported_name } },
          j.identifier(alias ?? exported_name),
        ]);
        to_skip_renaming.add(name);
        to_skip_renaming.add(exported_name);
      }

      import_statements.push([`import { ${[...specifiers].sort().join(', ')} } from "${module_name}"`, module_name, 0]);
      imported.add(value.deps);
    }
  }
  for (const [file, value] of Object.entries(deps.imports[filename] ?? {})) {
    const specifiers = new Set();
    for (const [generated_name, name] of Object.entries(value)) {
      // console.log({ name, generated_name, filename });
      // null when '../lib/src/telemetry/appInsightsReporter.ts' imports '../node_modules/@microsoft/applicationinsights-common/dist-es5/applicationinsights-common.js'
      if (name?.endsWith('_default')) {
        const new_name = name.replace(/_default$/, '');
        specifiers.add(`default as ${name.replace(/_default$/, '')}`);
        to_rename.set(generated_name, new_name);
      } else if (name) {
        specifiers.add(name);
        to_rename.set(generated_name, name);
      }
    }
    let relative_file_path = file;
    if (relative_file_path.startsWith('../')) {
      relative_file_path = path.relative(path.dirname(filename), relative_file_path);
      if (relative_file_path[0] !== '.') relative_file_path = './' + relative_file_path;
    }
    import_statements.push([
      `import { ${[...specifiers].sort().join(', ')} } from '${relative_file_path}'`,
      relative_file_path,
      1,
    ]);
    imported.add(file);
  }
  const exports_statement = deps.exports[filename]
    ? `export { ${Object.values(deps.exports[filename]).sort().join(', ')} };`
    : '';
  const new_root = j(
    j.program(
      // unwrap init function
      body.flatMap((node) => {
        if (node.type === 'VariableDeclaration') {
          const declaration = node.declarations[node.declarations.length - 1];
          for (const declaration of node.declarations) {
            if (['cjs_init', 'esm_init'].includes(global_vars.get(declaration.id.name)?.type)) {
              const inner_body = declaration.init.arguments[0].body.body;
              const selected = [];
              for (const _inner_node of inner_body) {
                if (_inner_node.type === 'ExpressionStatement') {
                  for (const inner_node of _inner_node.expression.type === 'SequenceExpression'
                    ? _inner_node.expression.expressions
                    : [_inner_node.expression]) {
                    if (inner_node.type === 'AssignmentExpression') {
                      if (imported_vars.has(inner_node.left.name)) continue;
                      if (inner_node.left.type === 'Identifier' && inner_node.right.type === 'Identifier') {
                        const left_name = consumer.originalPositionFor(locmap.get(inner_node.left).start).name;
                        const right_name = consumer.originalPositionFor(locmap.get(inner_node.right).start).name;
                        if (`_${left_name}` === `${right_name}`) {
                          continue;
                        }
                      }
                    }
                    if (
                      inner_node.type === 'CallExpression' &&
                      (inner_node.callee.name === name_generated_name ||
                        ['cjs_init', 'esm_init'].includes(global_vars.get(inner_node.callee.name)?.type))
                    ) {
                      const source = global_vars.get(inner_node.callee.name)?.source;
                      if (source && !imported.has(source)) {
                        import_statements.push([`import '${source}';`, source, 2]);
                      }
                      continue;
                    }
                    if (inner_node.type === 'Literal' && inner_node.value === 'use strict') continue;
                    selected.push(
                      inner_node.type === 'ExpressionStatement' ? inner_node : j.expressionStatement(inner_node)
                    );
                  }
                }
              }

              return selected;
            }
          }
        }
        return [node];
      })
    )
  );

  new_root.find(j.Identifier).forEach((path) => {
    if (skip_name_mapping(path)) return;
    if (to_skip_renaming.has(path.node.name)) return;
    if (to_rename.has(path.node.name)) {
      path.node.name = to_rename.get(path.node.name);
    } else if (locmap.get(path.node)) {
      const { name } = consumer.originalPositionFor(locmap.get(path.node).start);
      if (name) {
        if (name === '__name' && path.node.name === name_generated_name) {
          // labeling for post_cleanup
          // path.node.name = `__name_$_${name_generated_name}`;
          path.node.name = `__name_$_eman__`;
        } else path.node.name = name;
      }
    } else if (!locmap.get(path.node)) {
      console.log(`unknown loc ${path.node.name}`);
    }
  });
  for (const [pattern, node] of to_replace) {
    new_root.find(j.MemberExpression, pattern).replaceWith((path) => (skip_name_mapping(path) ? path.node : node));
  }

  // trasform init_function body
  new_root
    .find(j.ExpressionStatement, { expression: { type: 'AssignmentExpression', right: { type: 'ClassExpression' } } })
    .replaceWith((path) => {
      const class_name = path.node.expression.right.id.name;
      if (class_name.startsWith('_')) {
        path.node.expression.right.id.name = class_name.slice(1);
      }
      return j.classDeclaration(
        path.node.expression.right.id,
        path.node.expression.right.body,
        path.node.expression.right.superClass
      );
    });

  // trasform init_function body
  let new_body = new_root.paths()[0].node.body;
  const declared_var = new Set();
  for (let i = 0; i < new_body.length; i++) {
    const node = new_root.paths()[0].node.body[i];
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'AssignmentExpression' &&
      node.expression.left.type === 'Identifier' &&
      !declared_var.has(node.expression.left.name)
    ) {
      new_body[i] = j.variableDeclaration('let', [j.variableDeclarator(node.expression.left, node.expression.right)]);
      declared_var.add(node.expression.left.name);
    }
  }

  // ((a) => (
  //   (a.b = 'b'),
  //   (a.c = c)
  // ))(a || (a = {}));
  new_root.paths()[0].node.body = new_body.flatMap((node) => {
    if (node.type !== 'ExpressionStatement') return [node];
    const expr = node.expression;
    if (
      expr.type !== 'CallExpression' ||
      expr.callee.type !== 'ArrowFunctionExpression' ||
      expr.arguments.length !== 1 ||
      expr.arguments[0].type !== 'LogicalExpression'
    )
      return [node];

    const logical_expr = expr.arguments[0];
    if (
      logical_expr.operator !== '||' ||
      logical_expr.right.type !== 'AssignmentExpression' ||
      logical_expr.left.name !== logical_expr.right.left.name
    ) {
      return [node];
    }

    return [
      j.variableDeclaration('const', [j.variableDeclarator(logical_expr.right.left, logical_expr.right.right)]),
      ...expr.callee.body.expressions.map(j.expressionStatement),
    ];
  });

  // post_cleanup(new_root, `__name_$_${name_generated_name}`);

  return `${import_statements
    .sort(([statement1, source1, stage1], [statement2, source2, stage2]) => {
      source1 = source1.replaceAll('.', '~'); // lower the priority of '../'
      source2 = source2.replaceAll('.', '~');
      if (stage1 === stage2) {
        return source1 > source2 ? 1 : source1 < source2 ? -1 : 0;
      }
      return stage1 - stage2;
    })
    .map(([s]) => s)
    .join('\n')}

${new_root.toSource()}

${exports_statement}
`;
}

function deserialize(source, locs) {
  const root = j(source);
  const locmap = new Map();
  root.find(j.Node).forEach((path, index) => {
    const loc = locs[index];
    if (!loc) return;
    locmap.set(path.node, {
      start: { line: loc[0], column: loc[1], token: loc[2] },
      end: { line: loc[3], column: loc[4], token: loc[5] },
    });
  });
  return [root.nodes()[0].program.body, locmap];
}

async function load_meta(workdir) {
  const data = JSON.parse(await fs.promises.readFile(path.join(workdir, 'bundle_analysis.json')));
  data.global_vars = new Map(data.global_vars);
  data.imported_vars = new Map(data.imported_vars);
  return data;
}

async function* query(db_path, q) {
  const db = new sqlite3.Database(db_path);
  try {
    let done = false;
    let done_error = null;
    let resolve = null;
    const buffer = [];
    db.each(
      q,
      (err, row) => {
        buffer.push([err, row]);
        resolve?.();
        resolve = null;
      },
      (err, count) => {
        done = true;
        done_error = err;
        resolve?.();
        resolve = null;
      }
    );

    while (true) {
      if (!buffer.length) {
        if (done) break;
        await new Promise((_resolve) => (resolve = _resolve));
        if (done_error) throw done_error;
      }
      const [err, row] = buffer.shift();
      if (err) throw err;
      yield row;
    }
  } finally {
    await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
  }
}

async function run(workdir) {
  const consumer = await new SourceMapConsumer(
    JSON.parse(await fs.promises.readFile(path.join(workdir, 'language-server.js') + '.map'))
  );
  const { utils, name_generated_name, cjs_generated_name, global_vars, imported_vars, deps } = await load_meta(workdir);

  const out_dir = path.join(workdir, 'inflated', 'dist');

  for await (const { filename, source: raw, locs } of query(
    path.join(workdir, 'raw.sqlite3'),
    'SELECT * FROM raw_content'
  )) {
    console.log(filename);
    const [body, locmap] = deserialize(raw, JSON.parse(locs));
    let source;
    if (filename.endsWith('.json')) {
      source = process_package_json(filename, body, locmap, consumer, imported_vars, deps, name_generated_name);
    } else {
      source = process_file(filename, body, locmap, consumer, imported_vars, deps, global_vars, name_generated_name);
    }

    const out_file = path.join(out_dir, filename);
    await fs.promises.mkdir(path.dirname(out_file), { recursive: true });
    await fs.promises.writeFile(out_file.replace(/\.ts$/, '.js'), source);
  }
}

exports.run = run;
