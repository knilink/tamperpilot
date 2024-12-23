var path = require('node:path');
var fs = require('node:fs');
var { createHash } = require('node:crypto');
var unbundle = require('./unbundle.js');
var maximize = require('./maximize.js');
var { setTimeout } = require('timers/promises');

async function getFileHash(filePath) {
  return await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const hash = createHash('md5');
    let isFirstChunk = true;

    stream.on('data', function (data) {
      if (isFirstChunk) {
        // If this is the first chunk, we need to set the encoding to 'utf8'
        hash.update(data);
        isFirstChunk = false;
      } else {
        hash.update(data);
      }
    });

    stream.on('end', function () {
      const md5Hash = hash.digest('hex');
      resolve(md5Hash);
    });

    stream.on('error', function (err) {
      reject(err);
    });
  });
}

async function prepare(bundle_file, _workdir) {
  let workdir = _workdir;
  if (!workdir) {
    const { default: findCacheDir } = await import('find-cache-dir');
    const filename = path.basename(bundle_file);
    const hash = await getFileHash(bundle_file);
    const cacheDir = findCacheDir({ name: 'tamperpilot', create: true });
    workdir = path.join(cacheDir, hash);
  }

  if (!fs.existsSync(workdir)) {
    fs.mkdirSync(workdir);
  }

  await Promise.all([
    fs.promises.copyFile(bundle_file, path.join(workdir, 'language-server.js')),
    fs.promises.copyFile(`${bundle_file}.map`, path.join(workdir, 'language-server.js.map')),
  ]);

  return workdir;
}

async function run() {
  const bundle_file = process.argv[process.argv.length - 1];
  const workdir = await prepare(bundle_file);
  await unbundle.run(workdir);
  // TODO: tmp workaround for waiting sqlite to finish insertion
  await setTimeout(5000);
  await maximize.run(workdir);
}

run();
