// electron/main.js — how the program starts.
//
// It starts the Express server the app has always talked to, waits until that
// server answers, and then shows a window pointed at it. Nothing about what
// the app does lives here: every rule, every screen and every calculation is
// still in backend/ and frontend/.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// The database, its backups and the server log all live here. Inside the
// packaged app the code is read-only, so nothing may be written beside it.
const DATA_DIR = app.getPath('userData');
const LOG_PATH = path.join(DATA_DIR, 'server.log');
const SERVER_PATH = path.join(__dirname, '..', 'backend', 'server.js');
const HEALTH_TIMEOUT_MS = 10000;

const RESTART_LIMIT = 3;
const RESTART_WINDOW_MS = 60000;

let win = null;
let server = null;
// Whether a server is in the middle of being started. Held only for that, and
// released before the window is told to load a page: loading takes a moment,
// and a server that dies during it still has to be noticed.
let starting = false;
// The port the OS gave the server. Kept because a restart tries to take the
// same one back — the window is loaded at that address, and a server that
// comes back somewhere else leaves the page talking to nothing.
let serverPort = null;
// Whether the server has answered /health and is being relied on. An exit only
// counts as a crash worth recovering from if it does.
let live = false;
// Whether we asked it to stop. Quitting is not a crash.
let stopping = false;
// When it last died on its own, so a server that will not stay up is not
// restarted for ever.
let deaths = [];
// Kept in memory as well as on disk, because it is what tells one kind of
// failure from another when the server never got far enough to say so.
let log = '';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function note(text) {
  log = (log + text).slice(-200000);
  try { fs.appendFileSync(LOG_PATH, text); } catch { /* a log that cannot be written is not worth failing over */ }
}

function stopServer() {
  stopping = true;
  live = false;
  if (server) {
    try { server.kill(); } catch { /* already gone */ }
    server = null;
  }
}

// Starts the server and resolves with the port the OS gave it.
//
// The port is read from a line the server prints, because asking for port 0
// means nobody knows it in advance — not even the server, until it is
// listening.
function startServer(wantPort = 0) {
  stopping = false;
  return new Promise((resolve, reject) => {
    note(`\n[${new Date().toISOString()}] starting ${SERVER_PATH} on port ${wantPort || 'any free one'}\n`);
    server = fork(SERVER_PATH, [], {
      silent: true,
      env: {
        ...process.env,
        // The forked process is this same Electron binary; this is what makes
        // it behave as Node. better-sqlite3 is built against Electron's ABI,
        // which is the ABI this child then has.
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(wantPort),
        APARTMENT_DATA_DIR: DATA_DIR,
        // Only when running from source. See the note in backend/db.js: the
        // packaged app ships one build of better-sqlite3 and it is the right
        // one, but from source backend/node_modules shadows it with a build
        // for plain Node, which this child is not.
        ...(app.isPackaged ? {} : { APARTMENT_SQLITE: require.resolve('better-sqlite3') }),
      },
    });

    let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

    server.stdout.on('data', d => {
      const text = d.toString();
      note(text);
      const found = text.match(/APARTMENT_SERVER_PORT=(\d+)/);
      if (found) done(resolve, Number(found[1]));
    });
    server.stderr.on('data', d => note(d.toString()));
    server.on('error', e => { note(`[could not start: ${e.message}]\n`); done(reject, e); });
    server.on('exit', (code, signal) => {
      note(`[server exited code=${code} signal=${signal}]\n`);
      server = null;
      // Never got as far as saying which port it was on: whoever asked for it
      // is still waiting and will deal with the failure.
      if (!settled) { done(reject, new Error('server exited')); return; }
      // We killed it, or it had never been answering in the first place.
      if (stopping || !live) return;
      // It was working and then it was not. That is the case this app had no
      // answer for: the window stays open, every request fails, and the
      // banner's ลองใหม่ only re-reads — it cannot raise the dead.
      live = false;
      revive();
    });
  });
}

function ping(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 1000 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await ping(port)) return true;
    if (!server) return false;          // it died while we were waiting
    await new Promise(r => setTimeout(r, 120));
  }
  return false;
}

// Which of the three things went wrong, read off what the server managed to
// say before it stopped. The error page needs to name one of them; "something
// went wrong" is no use to the person who has to act on it.
function diagnose() {
  // `listen EACCES`, not bare EACCES: a permission error on a file is a
  // database problem and telling the user to close another copy of the app
  // would send them the wrong way entirely.
  if (/EADDRINUSE|listen EACCES/.test(log)) return 'port';
  if (/SQLITE|SqliteError|database is locked|unable to open database|not a database|malformed|apartment\.db/i
      .test(log)) return 'database';
  return 'crashed';
}

// Never a blank white window: whoever is looking at it has to be told
// something they can act on.
async function showError(reason) {
  // In the log too, because the person reading the log is the one the error
  // page tells the user to call, and they need to know what it decided.
  note(`[showing the error page: ${reason}]\n`);
  await win.loadFile(path.join(__dirname, 'error.html'), { query: { reason } });
  if (!win.isVisible()) win.show();
}

async function boot() {
  if (starting) return;
  starting = true;
  stopServer();
  deaths = [];
  let port = null;
  try {
    port = await startServer();
    if (!await waitForHealth(port)) throw new Error('no answer from the server');
    serverPort = port;
    live = true;
  } catch {
    stopServer();
    port = null;
  } finally {
    starting = false;
  }

  if (port !== null) await win.loadURL(`http://127.0.0.1:${port}/`);
  else await showError(diagnose());
  if (!win.isVisible()) win.show();
}

/* The server died while the app was open and being used.
 *
 * It is started again on the SAME port. The window is loaded at that address
 * and the page asks for relative paths, so a server that comes back somewhere
 * else leaves it talking to nothing — and reloading the window to fix that
 * would throw away whatever was half-typed into a form, which is the one thing
 * worth protecting here.
 *
 * A fresh port and a reload is the fallback, for the unlikely case that
 * something else took the old one in the seconds it was free.
 *
 * Restarts are counted. A server that will not stay up is a problem for
 * somebody to look at, not one to paper over for ever — after a few tries in
 * a minute this stops and says so.
 */
async function revive() {
  if (starting) return;
  starting = true;
  let moved = null;
  let recovered = false;
  try {
    const now = Date.now();
    deaths = deaths.filter(t => now - t < RESTART_WINDOW_MS).concat(now);
    if (deaths.length > RESTART_LIMIT) {
      note(`[died ${deaths.length} times in a minute — not restarting again]\n`);
    } else {
      // Longer each time, so a server failing instantly does not spin.
      await sleep(Math.min(250 * 2 ** (deaths.length - 1), 3000));

      for (const want of [serverPort, 0]) {
        try {
          const got = await startServer(want);
          if (!await waitForHealth(got)) throw new Error('no answer');
          live = true;
          recovered = true;
          if (got === serverPort) {
            // The page never knew. Its own banner is showing, and its ลองใหม่
            // now works, because there is something there to answer it.
            note(`[server back on ${got}, the window did not have to move]\n`);
          } else {
            serverPort = got;
            moved = got;
            note(`[server back on ${got}, reloading the window]\n`);
          }
          break;
        } catch {
          stopServer();
        }
      }
    }
  } finally {
    starting = false;
  }

  // Outside the guard, so a server that dies while the window is loading is
  // still noticed rather than silently ignored.
  if (moved !== null) await win.loadURL(`http://127.0.0.1:${moved}/`);
  else if (!recovered) await showError(diagnose());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    // Deliberately no splash screen and no "connecting…". The server is up in
    // a few hundred milliseconds, and something that flashes and vanishes
    // reads as slower than a window that simply appears ready.
    show: false,
    backgroundColor: '#FCFCFC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('closed', () => { win = null; });
}

// A second launch focuses the window that is already open rather than starting
// a second server on a second port against the same database file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    ipcMain.handle('startup:retry', () => boot());
    ipcMain.handle('startup:open-log', () => shell.openPath(LOG_PATH));
    createWindow();
    boot();
  });

  // A server left running after the window closes collides with the next
  // launch, which then looks like a random failure.
  app.on('window-all-closed', () => { stopServer(); app.quit(); });
  app.on('before-quit', stopServer);
}
