// Fails the build if Electron cannot load the database driver.
//
// better-sqlite3 is a Node-API module, so it does not need rebuilding for
// Electron — one prebuilt binary works on every runtime that offers the
// Node-API level it was built against. What it does need is that level:
// v13 declares NAPI_VERSION=10, and an Electron whose bundled Node offers
// only 9 does not fail to load it with a message. It segfaults.
//
// That crash happens inside the server child process, so the app shows its
// "server stopped unexpectedly" page and says nothing useful to anyone trying
// to fix it. Better to refuse to build.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const gyp = path.join(root, 'node_modules', 'better-sqlite3', 'binding.gyp');

const needed = Number((fs.readFileSync(gyp, 'utf8').match(/NAPI_VERSION=(\d+)/) || [])[1]);
const offered = Number(execFileSync(electron,
  ['-e', 'process.stdout.write(String(process.versions.napi))'],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).toString());

if (!needed || !offered) {
  console.error('check-runtime: could not read the Node-API versions to compare');
  process.exit(1);
}

if (offered < needed) {
  console.error(
    `\ncheck-runtime: better-sqlite3 needs Node-API ${needed}, this Electron offers ${offered}.\n` +
    `Loading it would crash the server process with no message.\n` +
    `Use a newer Electron, or a better-sqlite3 built against Node-API ${offered} or lower.\n`);
  process.exit(1);
}

// Not just the version numbers — actually load it.
execFileSync(electron,
  ['-e', "const D = require('better-sqlite3'); const db = new D(':memory:'); db.exec('create table t(a)');"],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, cwd: root });

console.log(`check-runtime: better-sqlite3 needs Node-API ${needed}, Electron offers ${offered}, and it loads.`);
