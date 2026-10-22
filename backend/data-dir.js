// data-dir.js — where the database and its copies actually live.
//
// `node server.js` has always written beside the code, and still does. In the
// packaged app that directory is inside app.asar and is read-only, so the
// Electron main process passes the user's own data directory in through
// APARTMENT_DATA_DIR.
//
// This is the failure that passes every test on the machine it was built on
// and stops the app dead on anyone else's, so the two paths that matter are
// worked out once, here, rather than in each file that needs one.

const fs = require('fs');
const path = require('path');

const dataDir = process.env.APARTMENT_DATA_DIR || __dirname;

// The packaged app's userData directory already exists; a path given by hand
// might not.
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// One file per building, named by id (b1.db, b2.db) rather than by the
// building's name, so renaming a building in ตั้งค่า touches no file.
//
// apartment.db is where the single building lived before there could be
// more than one. buildings.js moves it in as the first building and never
// reads it again; the path is kept only so it can be found.
//
// A deleted building's file is moved to deletedDir, not erased. Each
// building's copies live in backups/<id>/, and stay there after it is deleted.
module.exports = {
  dataDir,
  buildingsDir: path.join(dataDir, 'buildings'),
  deletedDir: path.join(dataDir, 'buildings-deleted'),
  backupRoot: path.join(dataDir, 'backups'),
  legacyDbPath: path.join(dataDir, 'apartment.db'),
};
