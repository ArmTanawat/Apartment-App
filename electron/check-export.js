// Export เป็นรูปภาพ, end to end, in real Electron: a server on a throwaway
// building, the payment QR uploaded through ตั้งค่า's own file box, a month
// exported, and the QR read back out of the picture.
//
//   npm run check-export
//
// Builds the frontend first, and needs a screen session, like check-revive.
// Nothing it touches is the database being worked on.
// APARTMENT_KEEP_EXPORT=1 keeps the pictures it made, to look at.

const electron = require('electron');
const { fork, spawnSync } = require('child_process');

// Started by npm under Node, `electron` is the path to the binary: run this
// same file inside it. ELECTRON_RUN_AS_NODE is taken out of the environment
// for the reason check-revive gives — an editor's terminal often has it set,
// and it would make Electron plain Node again.
if (typeof electron === 'string') {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [__filename], { stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}
const { app, BrowserWindow, nativeImage } = electron;
const fs = require('fs');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { exportMonth, folderNames } = require('./export.js');

const root = path.join(__dirname, '..');
let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failed++;
};
const section = t => console.log(`\n${t}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const QR_TEXT = 'https://example.invalid/pay/apartment-check-export';

function startServer(dataDir) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(root, 'backend', 'server.js'), [], {
      silent: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: '0', APARTMENT_DATA_DIR: dataDir,
        APARTMENT_SQLITE: require.resolve('better-sqlite3') },
    });
    child.stdout.on('data', d => {
      const m = d.toString().match(/APARTMENT_SERVER_PORT=(\d+)/);
      if (m) resolve({ child, port: Number(m[1]) });
    });
    child.on('exit', code => reject(new Error(`server exited ${code}`)));
  });
}

// A PNG's pixels, and whether a QR can be found in them.
function readQr(file) {
  const img = nativeImage.createFromPath(file);
  const { width, height } = img.getSize();
  const bgra = img.toBitmap();
  const rgba = new Uint8ClampedArray(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i] = bgra[i + 2]; rgba[i + 1] = bgra[i + 1]; rgba[i + 2] = bgra[i]; rgba[i + 3] = bgra[i + 3];
  }
  const found = jsQR(rgba, width, height);
  return found ? found.data : null;
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'apartment-export-'));
  const out = path.join(work, 'out');
  fs.mkdirSync(out);

  const built = spawnSync('npm', ['--prefix', 'frontend', 'run', 'build'],
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  if (built.status !== 0) throw new Error('frontend build failed\n' + built.stdout + built.stderr);

  const { child, port } = await startServer(path.join(work, 'data'));
  const base = `http://127.0.0.1:${port}`;
  const api = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return r.status === 204 ? null : r.json();
  };

  try {
    const b = await api('POST', '/buildings', { name: 'ตึกทดสอบ export' });
    await api('POST', `/buildings/${b.id}/open`);
    const seeded = spawnSync(process.execPath, [path.join(root, 'frontend', 'smoke', 'seed.mjs')], {
      encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', APARTMENT_TEST_PORT: String(port) } });
    if (seeded.status !== 0) throw new Error('seed failed\n' + seeded.stdout + seeded.stderr);
    const period = seeded.stdout.match(/and (\d{4}-\d{2}) \(working\)/)[1];

    section('the payment QR, uploaded through ตั้งค่า in a real window');
    const qrPath = path.join(work, 'qr-from-phone.png');
    await QRCode.toFile(qrPath, QR_TEXT, { width: 1400, margin: 4 });
    ok('the picture going in is big, like a phone photo', fs.statSync(qrPath).size > 0
       && nativeImage.createFromPath(qrPath).getSize().width === 1400);

    const win = new BrowserWindow({ show: false, width: 1280, height: 860,
      webPreferences: { backgroundThrottling: false } });
    await win.loadURL(base + '/');
    for (let i = 0; i < 50 && !await win.webContents.executeJavaScript('!!document.querySelector(".rail .nav")'); i++) await sleep(100);
    await win.webContents.executeJavaScript(
      '[...document.querySelectorAll(".nav a")].find(a => a.textContent.includes("ตั้งค่า")).click()');
    await sleep(400);
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    const { root: doc } = await dbg.sendCommand('DOM.getDocument', {});
    const { nodeId } = await dbg.sendCommand('DOM.querySelector',
      { nodeId: doc.nodeId, selector: 'input[type=file][accept^="image"]' });
    ok('ตั้งค่า has the QR file box', nodeId > 0);
    await dbg.sendCommand('DOM.setFileInputFiles', { nodeId, files: [qrPath] });
    let stored = null;
    for (let i = 0; i < 50 && !stored; i++) { await sleep(100); stored = (await api('GET', '/settings/payment-qr')).image; }
    ok('choosing the file saves it', !!stored);
    const size = stored ? nativeImage.createFromDataURL(stored).getSize() : {};
    const bytes = stored ? Math.floor((stored.length - stored.indexOf(',') - 1) * 3 / 4) : Infinity;
    ok('shrunk to 600px on its long side', size.width === 600 && size.height === 600, JSON.stringify(size));
    ok('under 300 KB', bytes < 300 * 1024, `${bytes}`);
    ok('kept as PNG, which a QR wants', /^data:image\/png;/.test(stored || ''), (stored || '').slice(0, 30));
    const previewShown = await win.webContents.executeJavaScript('!!document.querySelector(".setcard img.payqr")');
    ok('and the preview shows it', previewShown);
    dbg.detach();
    win.destroy();

    section('a month with every room billed, one bill long, one receipt');
    const units = await api('GET', '/units');
    const leases = await api('GET', '/leases');
    const billed = new Set((await api('GET', `/bills?period=${period}`)).map(x => x.lease_id));
    const longLease = leases.find(l => !l.end_date && !billed.has(l.id));
    for (let i = 1; i <= 45; i++) {
      await api('POST', '/fees/onetime', { lease_id: longLease.id, period,
        description: `รายการทดสอบความยาว ${i} Long bill line ${i}`, amount: 10 });
    }
    const unread = units.filter(u => u.lease_id);
    for (const u of unread) {
      const prev = await api('GET', `/readings/previous/${u.id}/${period}`);
      const existing = (await api('GET', `/readings?period=${period}`)).find(r => r.unit_id === u.id);
      if (!existing || !existing.is_entered) {
        await api('POST', '/readings/import', { period, rows: [{ unit_id: u.id,
          water: prev.water_prev + 5, electric: prev.elec_prev + 50 }] });
      }
    }
    await api('POST', '/bills/batch', { period, unit_ids: units.map(u => u.id) });
    const bills = await api('GET', `/bills?period=${period}`);
    const longBill = bills.find(x => x.lease_id === longLease.id);
    ok('the long bill exists', !!longBill);
    const receipt = await api('POST', '/receipts', { bill_id: bills[0].id });
    ok('one receipt issued', !!(receipt && receipt.id), JSON.stringify(receipt));
    const before = JSON.stringify([await api('GET', `/bills?period=${period}`), await api('GET', `/receipts?period=${period}`)]);

    section('export');
    const names = folderNames(period);
    ok('folder names are billing<YYYY><mon> and receipt<YYYY><mon>',
       /^billing\d{4}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.test(names.bills)
       && names.receipts === names.bills.replace('billing', 'receipt'), JSON.stringify(names));
    ok('2026-10 is billing2026oct', folderNames('2026-10').bills === 'billing2026oct');

    const ticks = [];
    const started = Date.now();
    const r = await exportMonth({ port, period, folder: out, onProgress: p => ticks.push(p) });
    console.log(`  (${bills.length + 1} files in ${((Date.now() - started) / 1000).toFixed(1)}s)`);
    const billDir = path.join(out, names.bills), receiptDir = path.join(out, names.receipts);
    const billFiles = fs.readdirSync(billDir).sort();
    ok('one bill picture per bill', r.bills.count === bills.length && billFiles.length === bills.length,
       `${billFiles.length} of ${bills.length}`);
    ok('named by room number', bills.every(x => billFiles.includes(`${x.unit_number}.png`)), billFiles.join(','));
    const twice = bills.map(x => x.unit_number).filter((n, i, all) => all.indexOf(n) !== i);
    if (twice.length) {
      ok(`a room billed twice in a handover month is ${twice[0]}.png and ${twice[0]}-2.png`,
         billFiles.includes(`${twice[0]}.png`) && billFiles.includes(`${twice[0]}-2.png`), billFiles.join(','));
    } else {
      console.log('  (no handover month in the seed — the -2 name is not exercised)');
    }
    ok('one receipt picture, for the one receipt', r.receipts && fs.readdirSync(receiptDir).length === 1
       && fs.existsSync(path.join(receiptDir, `${bills[0].unit_number}.png`)));
    ok('progress counted up to the total', ticks.length > 2 && ticks[ticks.length - 1].done === bills.length + 1
       && ticks[ticks.length - 1].total === bills.length + 1, JSON.stringify(ticks.slice(-2)));

    const sizeOf = f => nativeImage.createFromPath(f).getSize();
    const normal = sizeOf(path.join(billDir, billFiles.find(f => f !== `${longBill.unit_number}.png`)));
    const long = sizeOf(path.join(billDir, `${longBill.unit_number}.png`));
    ok('twice the A4 width in pixels', normal.width === 1588 && long.width === 1588, `${normal.width}`);
    ok('the long bill is captured to its full height, past one A4 page',
       long.height > 2246 && long.height > normal.height + 1500, `${normal.height} vs ${long.height}`);
    const longTail = await win2Text(port, period, longBill.unit_number);
    ok('and its total is in the picture area, not cut off', longTail, 'total row below the captured height');

    ok('the QR scans out of an exported bill', readQr(path.join(billDir, billFiles[0])) === QR_TEXT,
       String(readQr(path.join(billDir, billFiles[0]))));
    ok('and out of the long one', readQr(path.join(billDir, `${longBill.unit_number}.png`)) === QR_TEXT);
    ok('a receipt has no QR', readQr(path.join(receiptDir, fs.readdirSync(receiptDir)[0])) === null);

    const after = JSON.stringify([await api('GET', `/bills?period=${period}`), await api('GET', `/receipts?period=${period}`)]);
    ok('nothing about the bills or receipts changed', before === after);

    section('the folder is already there');
    fs.writeFileSync(path.join(billDir, 'old-room.png'), 'x');
    fs.writeFileSync(path.join(billDir, 'notes.txt'), 'mine');
    const again = await exportMonth({ port, period, folder: out });
    ok('without overwrite nothing is written, and both folders are named',
       again.conflict && again.conflict.includes(names.bills) && again.conflict.includes(names.receipts)
       && fs.existsSync(path.join(billDir, 'old-room.png')), JSON.stringify(again));
    const over = await exportMonth({ port, period, folder: out, overwrite: true });
    ok('overwrite takes the old pictures out', !fs.existsSync(path.join(billDir, 'old-room.png'))
       && fs.readdirSync(billDir).filter(f => f.endsWith('.png')).length === bills.length);
    ok('and leaves a file that is not a picture', fs.existsSync(path.join(billDir, 'notes.txt')));
    ok('the counts are right again', over.bills.count === bills.length && over.receipts.count === 1);

    section('a month with no receipts');
    await api('DELETE', `/receipts/${receipt.id}`);
    const none = await exportMonth({ port, period, folder: out, overwrite: true });
    ok('says there are none', none.receipts === null);
    ok('and leaves no receipt folder behind, not even the old one', !fs.existsSync(receiptDir));
    const fresh = path.join(work, 'fresh'); fs.mkdirSync(fresh);
    await exportMonth({ port, period, folder: fresh });
    ok('a first export with no receipts makes no receipt folder', fs.readdirSync(fresh).join() === names.bills,
       fs.readdirSync(fresh).join());

    section('refusals');
    let msg = null;
    try { await exportMonth({ port, period: '2019-03', folder: out }); } catch (e) { msg = e.message; }
    ok('a month with no bills is refused by name', /2019-03/.test(msg || ''), msg);
    msg = null;
    try { await exportMonth({ port, period, folder: path.join(work, 'nope') }); } catch (e) { msg = e.message; }
    ok('a folder that does not exist is refused', !!msg);

    // APARTMENT_KEEP_EXPORT=1 keeps the pictures, to look at by eye.
    if (process.env.APARTMENT_KEEP_EXPORT) {
      fs.copyFileSync(path.join(billDir, `${longBill.unit_number}.png`), path.join(work, 'long.png'));
      fs.copyFileSync(path.join(billDir, billFiles[0]), path.join(work, 'normal.png'));
      console.log(`\n  pictures kept for a look: ${work}`);
    }
  } finally {
    child.kill();
    if (!process.env.APARTMENT_KEEP_EXPORT) fs.rmSync(work, { recursive: true, force: true });
  }
}

// The long bill's total row, measured in the capture view under print media:
// it must sit inside the sheet the picture was taken of.
async function win2Text(port, period, room) {
  const w = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { backgroundThrottling: false } });
  try {
    const dbg = w.webContents.debugger;
    dbg.attach('1.3');
    await w.loadURL(`http://127.0.0.1:${port}/?capture=bills&period=${period}`);
    await dbg.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
    for (let i = 0; i < 100 && !await w.webContents.executeJavaScript('!!(window.__capture && window.__capture.files)'); i++) await sleep(100);
    return await w.webContents.executeJavaScript(`(() => {
      const i = window.__capture.files.indexOf(${JSON.stringify(String(room))});
      const size = window.__capture.show(i);
      const sheet = document.querySelectorAll('.capsheet')[i];
      const total = sheet.querySelector('tr.total').getBoundingClientRect();
      return total.bottom <= size.height && total.bottom > 1123;
    })()`);
  } finally { w.destroy(); }
}

app.whenReady().then(main).then(
  () => { console.log(failed ? `\n${failed} failed` : '\nall passed'); app.exit(failed ? 1 : 0); },
  e => { console.error(e); app.exit(1); });
app.on('window-all-closed', () => {});
