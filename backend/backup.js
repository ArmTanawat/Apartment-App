// backup.js — copies apartment.db to a dated file on every server start.
//
// The whole database is a single file, so a backup is a file copy. Without
// this, a corrupted file or a dead laptop loses every bill ever generated,
// with no copy anywhere — unlike a web app there is no server holding one.

const fs = require('fs');
const path = require('path');
const { dbPath, backupDir } = require('./data-dir.js');

const KEEP = 30;

function runBackup() {
  // Nothing to copy on the very first run, before the database exists.
  if (!fs.existsSync(dbPath)) return null;

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  // YYYY-MM-DD-HHMM sorts correctly as plain text, so the oldest file is
  // always first alphabetically and pruning needs no date parsing.
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-') + '-' + [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0')
  ].join('');

  const target = path.join(backupDir, `apartment-${stamp}.db`);

  // Starting the server twice in the same minute would otherwise overwrite the
  // copy just made. Pruning still runs below either way — an early return here
  // would leave old files behind forever once a restart hit the same minute.
  if (!fs.existsSync(target)) {
    fs.copyFileSync(dbPath, target);
  }

  // Keep the most recent KEEP files and delete the rest, so the folder does
  // not grow without limit.
  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('apartment-') && f.endsWith('.db'))
    .sort();

  while (files.length > KEEP) {
    const oldest = files.shift();
    fs.unlinkSync(path.join(backupDir, oldest));
  }

  return target;
}

// Lists the backup files, newest first, with their size and when they were made.
// Reads the folder — it never opens the database.
function listBackups() {
  if (!fs.existsSync(backupDir)) return [];

  return fs.readdirSync(backupDir)
    .filter(f => f.startsWith('apartment-') && f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(backupDir, f));
      return {
        filename: f,
        size_kb: Math.round(stat.size / 1024),
        created_at: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

module.exports = { runBackup, listBackups, KEEP };
