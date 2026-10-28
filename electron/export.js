// electron/export.js — Export เป็นรูปภาพ: every bill and receipt of a month as
// one PNG per room, for sending to tenants.
//
// The pictures are the printed page. A hidden window opens the app's capture
// view (frontend/src/pages/CapturePage.jsx — the same BillPaper the print
// pages use), is switched to print media so the print stylesheet applies, and
// each sheet is photographed on its own as one A4 page. Every picture is the
// same size; a bill too long for the page is shrunk to fit by the page itself.
//
// Through the DevTools protocol rather than webContents.capturePage(), which
// takes only what is inside the window — and a window cannot be made as tall
// as an A4 page on many screens, so the foot of the bill would be cut off.
// Page.captureScreenshot takes the page whatever the screen, at twice the
// pixel density, so the text is sharp on a phone and the QR still scans.
//
// PNG, never JPEG: JPEG's smearing at the edges of the QR's squares is what
// stops a code scanning.
//
// Read-only. It GETs bills and receipts and writes image files; nothing in
// the building's database changes.

const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

// A4 is 210mm, which at the 96 CSS pixels to the inch the page is laid out in
// is 793.7px. The capture sheet is exactly that wide.
const SHEET_WIDTH = 794;
// 297mm is 1122.5px; every picture is this tall, 2246px at twice the density.
const SHEET_HEIGHT = 1123;
const SCALE = 2;
const READY_TIMEOUT_MS = 30000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// billoctober2026 and receiptoctober2026 for the folders, and 102-oct2026.png
// for a picture: the month in lowercase English, then the Gregorian year. The
// month is in the file name too, so a picture sent on LINE and saved on a
// tenant's phone still says which month it is once it is out of its folder.
function folderNames(period) {
  const [y, m] = period.split('-');
  const month = MONTHS[Number(m) - 1];
  return {
    bills: `bill${month}${y}`,
    receipts: `receipt${month}${y}`,
    suffix: `${month.slice(0, 3)}${y}`,
  };
}

async function getJson(port, p) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.error) || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`);
  return body;
}

// Photographs every sheet of one capture view into `dir`, calling `each`
// after every file. Returns the names written.
async function captureInto(port, kind, period, dir, each) {
  const { suffix } = folderNames(period);
  const win = new BrowserWindow({
    show: false,
    width: SHEET_WIDTH,
    height: SHEET_HEIGHT,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // A hidden window is otherwise throttled, and the page waits on fonts
      // and image decoding that would then take as long as it liked.
      backgroundThrottling: false,
    },
  });
  const dbg = win.webContents.debugger;
  try {
    dbg.attach('1.3');
    await win.loadURL(`http://127.0.0.1:${port}/?capture=${kind}&period=${period}`);
    // Before anything is measured: print media changes the paper's padding
    // and takes the screen-only chrome away.
    await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });

    let state = null;
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (!state && Date.now() < deadline) {
      state = await win.webContents.executeJavaScript(
        'window.__capture ? { files: window.__capture.files || null, error: window.__capture.error || null } : null');
      if (!state) await sleep(100);
    }
    if (!state) throw new Error('เปิดหน้าบิลสำหรับ export ไม่ทันเวลา ลองใหม่อีกครั้ง');
    if (state.error) throw new Error(state.error);

    const written = [];
    for (let i = 0; i < state.files.length; i++) {
      await win.webContents.executeJavaScript(`window.__capture.show(${i}, ${SHEET_HEIGHT})`);
      await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: SHEET_WIDTH, height: SHEET_HEIGHT, deviceScaleFactor: SCALE, mobile: false,
      });
      const shot = await dbg.sendCommand('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: SHEET_WIDTH, height: SHEET_HEIGHT, scale: 1 },
      });
      // The page names the room (102, or 102-2 for the second lease in a
      // handover month); the month goes on here.
      const file = `${state.files[i]}-${suffix}.png`;
      fs.writeFileSync(path.join(dir, file), Buffer.from(shot.data, 'base64'));
      written.push(file);
      each();
    }
    return written;
  } finally {
    try { dbg.detach(); } catch { /* already gone with the window */ }
    win.destroy();
  }
}

// Only the pictures a previous export left. Anything else somebody put in the
// folder is theirs and stays.
function clearPngs(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (/\.png$/i.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  }
}

/* One month, into two folders under `folder`.
 *
 * If either folder is already there and `overwrite` is not set, nothing is
 * written and { conflict: [names] } comes back, for the screen to ask about.
 * Old and new pictures in one folder would be indistinguishable — a receipt
 * cancelled since the last export would still be sitting there — so with
 * `overwrite` the old pictures are removed first.
 *
 * No receipts this month means no receipt folder; a stale one from an earlier
 * export of the same month is part of the conflict, and is emptied and removed
 * on overwrite. */
async function exportMonth({ port, period, folder, overwrite = false, onProgress = () => {} }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) throw new Error('งวดไม่ถูกต้อง');
  if (typeof folder !== 'string' || !path.isAbsolute(folder)
      || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error('ไม่พบโฟลเดอร์ที่เลือก เลือกโฟลเดอร์ใหม่อีกครั้ง');
  }

  const names = folderNames(period);
  const [bills, receipts] = await Promise.all([
    getJson(port, `/bills?period=${period}`),
    getJson(port, `/receipts?period=${period}`),
  ]);
  if (!bills.length) throw new Error(`งวด ${period} ยังไม่มีบิล ไม่มีอะไรให้ export`);

  const billDir = path.join(folder, names.bills);
  const receiptDir = path.join(folder, names.receipts);
  const there = [billDir, receiptDir].filter(d => fs.existsSync(d));
  if (there.length && !overwrite) return { conflict: there.map(d => path.basename(d)) };

  const total = bills.length + receipts.length;
  let done = 0;
  const tick = () => { done++; onProgress({ done, total }); };
  onProgress({ done, total });

  for (const d of there) clearPngs(d);
  if (!receipts.length && fs.existsSync(receiptDir)) {
    try { fs.rmdirSync(receiptDir); } catch { /* something else is in it; leave it */ }
  }

  fs.mkdirSync(billDir, { recursive: true });
  const billFiles = await captureInto(port, 'bills', period, billDir, tick);

  let receiptFiles = [];
  if (receipts.length) {
    fs.mkdirSync(receiptDir, { recursive: true });
    receiptFiles = await captureInto(port, 'receipts', period, receiptDir, tick);
  }

  return {
    folder,
    bills: { dir: billDir, name: names.bills, count: billFiles.length },
    receipts: receipts.length ? { dir: receiptDir, name: names.receipts, count: receiptFiles.length } : null,
  };
}

module.exports = { exportMonth, folderNames };
