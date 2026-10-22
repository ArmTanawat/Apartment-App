// server.js — starts the server and connects the route files.
// No route logic lives here; each topic has its own file in routes/.

const express = require('express');
const fs = require('fs');
const path = require('path');

// No building is open yet: the screen asks which one. start() makes the
// folders, moves an old single-building apartment.db in as the first building,
// and reopens a building only when the desktop shell is reviving a crashed
// server. A building is backed up each time it is opened (see buildings.js).
const buildings = require('./buildings.js');
buildings.start();
const { requireBuilding } = buildings;

const tenantsRouter = require('./routes/tenants.js');
const unitsRouter = require('./routes/units.js');
const leasesRouter = require('./routes/leases.js');
const readingsRouter = require('./routes/readings.js');
const feesRouter = require('./routes/fees.js');
const billsRouter = require('./routes/bills.js');
const settingsRouter = require('./routes/settings.js');
const receiptsRouter = require('./routes/receipts.js');
const backupsRouter = require('./routes/backups.js');
const buildingsRouter = require('./routes/buildings.js');

const app = express();

app.use(express.json());

// Mounting. Every route inside tenants.js is prefixed with /tenants here,
// which is why that file declares '/' and '/:id' rather than the full path.
// The prefix lives in exactly one place, so changing it is a one-line edit.
//
// /buildings is the chooser and works with nothing open. Everything else reads
// or writes the open building, so it is refused until one is chosen.
app.use('/buildings', buildingsRouter);
app.use('/tenants', requireBuilding, tenantsRouter);
app.use('/units', requireBuilding, unitsRouter);
app.use('/leases', requireBuilding, leasesRouter);
app.use('/readings', requireBuilding, readingsRouter);
app.use('/fees', requireBuilding, feesRouter);
app.use('/bills', requireBuilding, billsRouter);
app.use('/settings', requireBuilding, settingsRouter);
app.use('/receipts', requireBuilding, receiptsRouter);
app.use('/backups', requireBuilding, backupsRouter);

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
