// Checks that the app survives its server dying while someone is using it.
//
// Slow — it launches the real app and kills the server under it several times
// — so it is not part of `npm test`. Run it after touching electron/main.js.
//
//   npm run check-revive
//
// The four things it is checking are the four that took thought:
//   the server comes back on the SAME port, so the open window never moves
//   a server that will not stay up is given up on rather than restarted for ever
//   ลองใหม่ still works after that
//   if something took the old port meanwhile, it moves and reloads the window

const { execSync, spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));
const DEBUG_PORT = 9223;
const DATA_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'apartment-revive-'));
const LOG = path.join(DATA_DIR, 'server.log');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = () => { try { return fs.readFileSync(LOG, 'utf8'); } catch { return ''; } };
const lastPort = () => {
  const found = [...log().matchAll(/APARTMENT_SERVER_PORT=(\d+)/g)];
  return found.length ? Number(found.at(-1)[1]) : null;
};
const healthy = async p => { try { return (await fetch(`http://127.0.0.1:${p}/health`)).ok; } catch { return false; } };
// Killed by the port it is listening on, not by matching its command line.
// `pkill -f backend/server.js` also hits the development server, and any other
// copy of the app that happens to be open — which made this check fail at
// random depending on what else was running.
const killServer = () => {
  const p = lastPort();
  if (p === null) return;
  try {
    if (process.platform === 'win32') {
      const line = execSync(`netstat -ano -p tcp | findstr :${p}`, { encoding: 'utf8' })
        .split('\n').find(l => l.includes('LISTENING'));
      if (line) execSync(`taskkill /PID ${line.trim().split(/\s+/).pop()} /F`);
    } else {
      execSync(`lsof -ti tcp:${p} -sTCP:LISTEN | xargs kill`);
    }
  } catch { /* already gone */ }
};

// Wait for a state rather than guess at a duration. Restarting takes a
// backoff plus however long the machine needs, and a fixed sleep that is long
// enough here is not long enough on a slower one.
async function until(what, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await what()) return true;
    await sleep(300);
  }
  return false;
}
const serving = () => until(async () => { const p = lastPort(); return p !== null && await healthy(p); });

const page = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
  return targets.find(t => t.type === 'page');
};
const evaluate = async (target, expression) => {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  const result = await new Promise(res => {
    const on = e => { const m = JSON.parse(e.data); if (m.id === 1) { ws.removeEventListener('message', on); res(m.result); } };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
      params: { expression, returnByValue: true } }));
  });
  ws.close();
  return result.result && result.result.value;
};

let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failed++;
};

(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;   // it would run the app as plain Node and exit in silence
  // --user-data-dir is Electron's own switch, so the app puts its database,
  // its backups and its log somewhere disposable. APARTMENT_DATA_DIR would not
  // do: that is what the main process passes DOWN to the server, not what the
  // main process itself uses.
  const app = spawn(electron, [root, `--user-data-dir=${DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`], { env, stdio: 'ignore' });
  const stop = () => { try { app.kill(); } catch {} killServer(); };
  process.on('exit', stop);

  ok('the app started', await serving(60000), String(lastPort()));
  const first = lastPort();

  console.log('\nthe server dies while the app is open');
  killServer();
  ok('it came back', await serving());
  ok('on the same port, so the window never had to move', lastPort() === first,
     `${first} then ${lastPort()}`);
  ok('and the window is still on the app', (await page()).url.startsWith('http://127.0.0.1:'));

  console.log('\na server that will not stay up');
  // Killed only once it is up again, because a death while it was already
  // down is not the app failing to keep it alive. Bounded, and it asserts
  // that it stops rather than after exactly how many.
  for (let i = 0; i < 8 && !log().includes('not restarting again'); i++) {
    await serving();
    killServer();
    await sleep(2000);
  }
  ok('it stops trying', await until(() => log().includes('not restarting again'), 15000));
  const errored = await until(async () => (await page()).url.includes('error.html'), 15000)
    ? await page() : await page();
  ok('and says so on the error page', errored.url.includes('error.html'), errored.url);
  ok('in Thai', await evaluate(errored, "document.getElementById('what').textContent")
     === 'ตัวโปรแกรมส่วนหลังหยุดทำงานกะทันหัน');

  console.log('\nลองใหม่ after that');
  await evaluate(errored, "document.getElementById('retry').click()");
  ok('brings the app back',
     await until(async () => (await page()).url.startsWith('http://127.0.0.1:'), 30000));
  ok('and the server answers', await serving());

  console.log('\nsomething else takes the old port in the moment it is free');
  const was = lastPort();
  killServer();
  const squatter = net.createServer(() => {});
  await new Promise(r => squatter.listen(was, '127.0.0.1', r));
  ok('it moved rather than giving up', await until(() => lastPort() !== was, 30000),
     `still ${lastPort()}`);
  const now = lastPort();
  ok('the new port answers', await until(() => healthy(now)));
  ok('and the window was reloaded onto it',
     await until(async () => (await page()).url.includes(String(now)), 15000),
     (await page()).url);
  squatter.close();

  stop();
  await sleep(1000);
  if (failed) {
    console.log(`\n--- what the app's log said (${LOG}) ---`);
    console.log(log().split('\n').slice(-25).join('\n'));
  } else {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
