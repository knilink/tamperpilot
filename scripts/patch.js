const os = require('node:os');
const readline = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');
const { promisify } = require('node:util');

const unzipper = require('unzipper');
const yargs = require('yargs');
const j = require('jscodeshift');
const { SourceMapConsumer } = require('source-map');
const vlq = require('vlq');
const rollup = require('rollup');
const typescript = require('@rollup/plugin-typescript');
const archiver = require('archiver');
const { parseString, Builder } = require('xml2js');

function find_position(sourcemap, original_file_path = '../lib/src/common/productContext.ts') {
  const context_index = sourcemap.sources.indexOf(original_file_path);
  if (context_index < 0) return;
  let source = 0;
  let original_line = 0;
  let original_column = 0;
  let name = 0;
  let shouldend = false;
  let start;
  let s = 0;
  for (const [generated_line, line] of sourcemap.mappings.split(';').entries()) {
    let generated_column = 0;
    if (!line) continue;
    for (const encoded of line.split(',')) {
      const decoded = vlq.decode(encoded);

      generated_column += decoded[0];
      source += decoded[1];
      original_line += decoded[2];
      original_column += decoded[3];
      if (decoded[4]) {
        name += decoded[4];
      }
      if (context_index === source) {
        if (!start) {
          start = { line: generated_line + 1, column: generated_column };
        }
      } else if (start) {
        return {
          start,
          end: { line: generated_line + 1, column: generated_column },
        };
      }
    }
  }
}

function map_to_generated(loc, generated_start) {
  return {
    line: loc.line + generated_start.line - 1,
    column: loc.line === 1 ? generated_start.column + loc.column : loc.column,
  };
}

const IIFE_NAME = 'tmp1CX';
const INJECT_SOURCE = '../lib/src/common/productContext.ts';

function setup_hook(generated_code, generated_start, consumer) {
  const root = j(generated_code);

  root
    .find(j.NewExpression, (node) => {
      if (!node.loc) return false;
      let { name } = consumer.originalPositionFor(map_to_generated(node.callee.loc.start, generated_start));

      return name === 'Context';
    })
    .replaceWith((path) => {
      return j.identifier.from({ name: IIFE_NAME });
    });
  return root.toSource();
}

async function build(entry_name) {
  const inputOptions = {
    input: path.join(__dirname, `../src/${entry_name}.ts`),
    plugins: [typescript()],
  };

  const outputOptions = {
    format: 'iife',
    name: IIFE_NAME,
  };

  const bundle = await rollup.rollup(inputOptions);

  const { output } = await bundle.generate(outputOptions);

  return output;
}

async function patch(input_file_path, entry_name, is_agent) {
  const sourcemap_path = `${input_file_path}.map`;
  const output_file_path = input_file_path.replace(/\.js$/, '-tampered.js');

  const build_output = await build(entry_name);

  const sourcemap = JSON.parse(await fs.promises.readFile(sourcemap_path));
  const range = find_position(sourcemap, INJECT_SOURCE);
  if (!range) {
    throw new Error(`source "${INJECT_SOURCE}" not found in sourcemap`);
  }
  const { start, end } = range;
  let current_line = 0;
  let content = [];
  const consumer = await new SourceMapConsumer(sourcemap);

  const rl = readline.createInterface({
    input: fs.createReadStream(input_file_path),
    crlfDelay: Infinity,
    terminal: false,
  });

  const w = fs.createWriteStream(output_file_path);
  let line_shift = 1;

  for await (const line of rl) {
    current_line++;

    if (current_line === 1) {
      let insert_before = line.startsWith('#');
      if (insert_before) {
        w.write(line + '\n');
      }
      for (const chunk of build_output) {
        line_shift += chunk.code.split('\n') - 1;
        w.write(chunk.code);
      }
      if (!insert_before) {
        w.write(line + '\n');
      }
    }

    if (line.startsWith('//# sourceMappingURL=') && is_agent) {
      w.write(line.replace(/\.js\.map$/, '-tampered.js.map'));
      continue;
    }

    if (start.line === current_line) {
      w.write(line.slice(0, start.column));
    }

    if (start.line <= current_line && current_line <= end.line) {
      if (start.line === end.line) {
        content.push(line.slice(start.column, end.column));
      } else if (current_line === start.line) {
        content.push(line.slice(start.column));
      } else if (current_line === end.line) {
        content.push(line.slice(0, end.column));
      } else {
        content.push(line);
      }
    } else if (current_line !== 1) {
      w.write(line + '\n');
    }
    if (end.line === current_line) {
      w.write(setup_hook(content.join('\n'), start, consumer));
      w.write(line.slice(end.column));
    }
  }
  w.end();
  sourcemap.mappings = ';'.repeat(line_shift) + sourcemap.mappings;
  await fs.promises.writeFile(
    is_agent ? `${output_file_path}.map` : `${input_file_path}.map`,
    JSON.stringify(sourcemap)
  );
  if (!is_agent) {
    await fs.promises.rename(output_file_path, input_file_path);
  }
}

function zip_folder(source, output) {
  const archive = archiver('zip', {
    zlib: { level: 0 },
  });

  const stream = fs.createWriteStream(output);

  return new Promise((resolve, reject) => {
    stream.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(stream);
    archive.directory(source, false);
    archive.finalize();
  });
}

async function update_manifest(tmpdir) {
  const file = path.join(tmpdir, 'extension.vsixmanifest');
  const xmlFileContent = await fs.promises.readFile(file, 'utf8');

  const result = await promisify(parseString)(xmlFileContent);

  const packageManifest = result['PackageManifest'];
  packageManifest.Metadata[0].DisplayName[0] = 'Tamper Copilot';
  packageManifest.Metadata[0].Identity[0].$.Id = 'tamperpilot';
  delete packageManifest.Metadata[0].Identity[0].$.Publisher;

  const builder = new Builder();
  const xmlContent = builder.buildObject(result);

  await fs.promises.writeFile(file, xmlContent, 'utf8');
}

async function update_package_json(tmpdir) {
  const file = path.join(tmpdir, 'extension', 'package.json');
  const package = JSON.parse(await fs.promises.readFile(file));
  // package.name = 'tamperpilot';
  package.displayName = 'Tamperpilot';
  package.description = 'Your local AI pair programmer';
  // package.publisher = 'Tamperpilot';
  // package.activationEvents = [];
  package.extensionPack = [];

  await fs.promises.writeFile(file, JSON.stringify(package, null, 2), 'utf8');
}

async function main() {
  const entries = (await fs.promises.readdir(path.join(__dirname, '../src'))).flatMap((name) =>
    name.endsWith('.ts') ? [name.replace(/.ts$/, '')] : []
  );
  const argv = yargs
    .scriptName('patch')
    .usage('$0 <entry> <file>', 'Description of your script', (yargs) => {
      yargs
        .positional('entry', {
          describe: 'Entry name to build injection script',
          type: 'string',
          choices: entries,
        })
        .positional('file', {
          describe: 'The file to be injected',
          type: 'string',
        });
    })
    .help().argv;

  const ext = path.extname(argv.file);
  if (!['.js', '.vsix'].includes(ext)) {
    throw new Error(`Unknown ext ${ext}, should be either .js or .vsix`);
  }
  const is_agent = ext === '.js';

  if (is_agent) {
    await patch(argv.file, argv.entry, true);
    return;
  }

  const tmpdir = path.join(os.tmpdir(), 'tamperpilot', Date.now().toString());

  await new Promise((resolve, reject) => {
    fs.createReadStream(argv.file)
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        const filePath = path.join(tmpdir, entry.path);
        if (entry.type === 'File') {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          entry.pipe(fs.createWriteStream(filePath));
        } else {
          entry.autodrain();
        }
      })
      .on('error', reject)
      .on('close', resolve);
  });

  const extension_path = path.join(tmpdir, 'extension', 'dist', 'extension.js');

  await Promise.all([patch(extension_path, argv.entry, false), update_manifest(tmpdir), update_package_json(tmpdir)]);

  await zip_folder(tmpdir, argv.file.replace(/\.vsix$/, '-tampered.vsix'));

  await fs.promises.rm(tmpdir, { recursive: true });
}

main();
