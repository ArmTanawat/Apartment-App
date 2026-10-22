// routes/backups.js — seeing and triggering database backups.
//
// These read and write the open building's own folder, backups/<id>/. Nothing
// here touches the database or any table, so adding this route changed no part
// of the schema.

const express = require('express');
const { runBackup, listBackups, KEEP } = require('../backup.js');
const { active } = require('../buildings.js');

const router = express.Router();

// GET /backups — what copies exist, newest first.
//
// The point is reassurance: a backup that runs silently is indistinguishable
// from one that never ran. This lets the settings screen show the date of the
// last copy rather than a promise that copies are happening.
router.get('/', (req, res) => {
  const backups = listBackups(active().backupDir);

  res.json({
    count: backups.length,
    keeps: KEEP,
    latest: backups[0] || null,
    backups
  });
});

// POST /backups — make a copy right now.
//
// Backups otherwise happen only when the server starts, which could be weeks
// apart if the program is left running. This is the button for "I am about to
// change a lot of things and want a copy first".
router.post('/', (req, res) => {
  const { file: dbFile, backupDir } = active();
  const file = runBackup(dbFile, backupDir);

  if (!file) {
    return res.status(400).json({ error: 'ยังไม่มีฐานข้อมูลให้สำรอง' });
  }

  const backups = listBackups(backupDir);
  res.status(201).json({
    created: backups[0],
    count: backups.length,
    keeps: KEEP
  });
});

module.exports = router;
