// scripts/run-tests.js — everything, in one command.
//
// The suites talk to a running server on port 3001 and re-seed the database
// they find there, so the order matters and getting it wrong looks like a
// failure. This does the order.
//
//   npm test

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');

// Always its own server, on its own database, on a port nothing else is using.
//
// Not the development one, even when it is running: seed.mjs clears the
// database before each suite, and once a receipt has been issued its bill
// cannot be deleted — so a database that has been receipted cannot be cleared
// at all. That rule is right, and it means the tests must never borrow a
// database somebody is using.
const PORT = 3100 + Math.floor(Math.random() * 800);

const ping = () => new Promise(resolve => {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 800 },
    res => { res.resume(); resolve(res.statusCode === 200); });
  req.on('error', () => resolve(false));
  req.on('timeout', () => { req.destroy(); resolve(false); });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apartment-test-'));
  console.log(`เปิดเซิร์ฟเวอร์สำหรับทดสอบบนพอร์ต ${PORT}`);
  console.log(`ข้อมูลชั่วคราวอยู่ที่ ${dataDir}`);
  console.log('ฐานข้อมูลที่กำลังใช้งานอยู่จะไม่ถูกแตะ\n');

  const server = spawn(process.execPath, [path.join(root, 'backend', 'server.js')], {
    env: { ...process.env, APARTMENT_DATA_DIR: dataDir, PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60 && !await ping(); i++) await sleep(200);
  if (!await ping()) {
    console.error('เปิดเซิร์ฟเวอร์ไม่สำเร็จ');
    server.kill();
    process.exit(1);
  }

  const suites = [
    ['smoke',         'เดินตามเส้นทางการใช้งานหลัก'],
    ['smoke:share',   'ค่าธรรมเนียมที่คิดเป็นเปอร์เซ็นต์'],
    ['smoke:screens', 'ตัวเลขบนหน้าจอ ตัวเลือกเดือน การพิมพ์'],
    ['smoke:stale',   'เมื่อข้อมูลถูกเปลี่ยนจากที่อื่น'],
    ['smoke:offline', 'เมื่อเซิร์ฟเวอร์ไม่ทำงาน'],
    ['smoke:rules',   'กฎการคิดเงินทุกข้อ'],
    ['smoke:receipts','ใบเสร็จและรายงาน'],
    ['check-text',    'จำนวนเงินเป็นตัวหนังสือ และเลขมิเตอร์'],
  ];

  const failed = [];
  for (const [name, what] of suites) {
    process.stdout.write(`${name.padEnd(14)} ${what.padEnd(38)} `);
    const r = spawnSync('npm', ['--prefix', 'frontend', 'run', name],
      { cwd: root, encoding: 'utf8', shell: process.platform === 'win32',
        env: { ...process.env, APARTMENT_TEST_PORT: String(PORT) } });
    const out = (r.stdout || '') + (r.stderr || '');
    const good = /all passed|0 failed/.test(out);
    console.log(good ? 'ผ่าน' : 'ไม่ผ่าน');
    if (!good) {
      failed.push(name);
      out.split('\n').filter(l => /FAIL/.test(l)).forEach(l => console.log('   ' + l.trim()));
    }
  }

  // The two that need no server: the desktop shell's own checks.
  for (const [name, what] of [['check-runtime', 'ตัวขับฐานข้อมูลใช้กับ Electron ได้'],
                              ['check-error-page', 'หน้าจอแจ้งปัญหาตอนเปิดไม่ติด']]) {
    process.stdout.write(`${name.padEnd(14)} ${what.padEnd(38)} `);
    const r = spawnSync('npm', ['run', name], { cwd: root, encoding: 'utf8',
      shell: process.platform === 'win32' });
    const good = r.status === 0;
    console.log(good ? 'ผ่าน' : 'ไม่ผ่าน');
    if (!good) failed.push(name);
  }

  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });

  console.log(failed.length
    ? `\nไม่ผ่าน ${failed.length} ชุด: ${failed.join(', ')}`
    : '\nผ่านทั้งหมด');
  process.exit(failed.length ? 1 : 0);
}

main();
