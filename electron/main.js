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

let win = null;
let server = null;
let booting = false;
// Kept in memory as well as on disk, because it is what tells one kind of
// failure from another when the server never got far enough to say so.
let log = '';

function note(text) {
  log = (log + text).slice(-200000);
  try { fs.appendFileSync(LOG_PATH, text); } catch { /* a log that cannot be written is not worth failing over */ }
}

function stopServer() {
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
function startServer() {
  return new Promise((resolve, reject) => {
    note(`\n[${new Date().toISOString()}] starting ${SERVER_PATH}\n`);
    server = fork(SERVER_PATH, [], {
      silent: true,
      env: {
        ...process.env,
        // The forked process is this same Electron binary; this is what makes
        // it behave as Node. better-sqlite3 is built against Electron's ABI,
        // which is the ABI this child then has.
        ELECTRON_RUN_AS_NODE: '1',
        PORT: '0',
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
      done(reject, new Error('server exited'));
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

async function boot() {
  if (booting) return;
  booting = true;
  stopServer();
  try {
    const port = await startServer();
    if (!await waitForHealth(port)) throw new Error('no answer from the server');
    await win.loadURL(`http://127.0.0.1:${port}/`);
  } catch {
    stopServer();
    // Never a blank white window: whoever is looking at it has to be told
    // something they can act on.
    const reason = diagnose();
    // In the log too, because the person reading the log is the one the error
    // page tells the user to call, and they need to know what it decided.
    note(`[showing the error page: ${reason}]\n`);
    await win.loadFile(path.join(__dirname, 'error.html'), { query: { reason } });
  } finally {
    booting = false;
    if (!win.isVisible()) win.show();
  }
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
