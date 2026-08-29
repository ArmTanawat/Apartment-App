// routes/backups.js — seeing and triggering database backups.
//
// These read and write the backups/ folder. Nothing here touches the database
// or any table, so adding this route changed no part of the schema.

const express = require('express');
const { runBackup, listBackups, KEEP } = require('../backup.js');

const router = express.Router();

// GET /backups — what copies exist, newest first.
//
// The point is reassurance: a backup that runs silently is indistinguishable
// from one that never ran. This lets the settings screen show the date of the
// last copy rather than a promise that copies are happening.
router.get('/', (req, res) => {
  const backups = listBackups();

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
  const file = runBackup();

  if (!file) {
    return res.status(400).json({ error: 'There is no database to back up yet' });
  }

  const backups = listBackups();
  res.status(201).json({
    created: backups[0],
    count: backups.length,
    keeps: KEEP
  });
});

module.exports = router;
