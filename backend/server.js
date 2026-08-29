// server.js — starts the server and connects the route files.
// No route logic lives here; each topic has its own file in routes/.

const express = require('express');
const cors = require('cors');

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

app.use(cors());
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

// Any error thrown inside a route lands here instead of crashing the process.
// Four arguments is what marks this as an error handler in Express.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Apartment server running at http://localhost:${PORT}`);
});
