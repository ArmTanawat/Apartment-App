// server.js — starts the server and connects the route files.
// No route logic lives here; each topic has its own file in routes/.

const express = require('express');
const fs = require('fs');
const path = require('path');

// Runs before anything opens the database, so the copy is of yesterday's
// finished state rather than a file being written to.
const { runBackup } = require('./backup.js');
const backupFile = runBackup();
if (backupFile) {
  console.log(`Backed up to ${backupFile}`);
}

const tenantsRouter = require('./routes/tenants.js');
const unitsRouter = require('./routes/units.js');
const leasesRouter = require('./routes/leases.js');
const readingsRouter = require('./routes/readings.js');
const feesRouter = require('./routes/fees.js');
const billsRouter = require('./routes/bills.js');
const settingsRouter = require('./routes/settings.js');
const backupsRouter = require('./routes/backups.js');

const app = express();

app.use(express.json());

// Mounting. Every route inside tenants.js is prefixed with /tenants here,
// which is why that file declares '/' and '/:id' rather than the full path.
// The prefix lives in exactly one place, so changing it is a one-line edit.
app.use('/tenants', tenantsRouter);
app.use('/units', unitsRouter);
app.use('/leases', leasesRouter);
app.use('/readings', readingsRouter);
app.use('/fees', feesRouter);
app.use('/bills', billsRouter);
app.use('/settings', settingsRouter);
app.use('/backups', backupsRouter);

// A quick way to confirm the server is alive without touching the database.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// The built frontend, served from this same server.
//
// One origin for the pages and the API means there is no CORS to configure,
// the frontend's base URL is empty and every request is a relative path, and
// the window has one address to open. `cors` is gone for that reason rather
// than by oversight.
//
// Absent in development, where Vite serves the pages on 5173 and proxies these
// paths back here — so this is skipped rather than failing when dist has not
// been built.
const webRoot = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(webRoot)) {
  app.use(express.static(webRoot));
}

// Any error thrown inside a route lands here instead of crashing the process.
// Four arguments is what marks this as an error handler in Express.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
});

// Port 0 asks the operating system for a free one. The packaged app uses that,
// because 3001 may already be taken — by something else, or by a copy of this
// app that did not shut down, which would otherwise look like a random failure
// on launch. `node server.js` keeps 3001, which is what the Vite proxy expects.
//
// 127.0.0.1 rather than every interface: this is one person's program on one
// machine and it has no login, so it has no business answering the local
// network.
const PORT = Number(process.env.PORT ?? 3001);

const server = app.listen(PORT, '127.0.0.1', () => {
  const actual = server.address().port;
  console.log(`Apartment server running at http://localhost:${actual}`);
  // Read by the Electron main process, which cannot know the port it asked the
  // OS to pick. On its own line so it can be matched exactly.
  console.log(`APARTMENT_SERVER_PORT=${actual}`);
});
