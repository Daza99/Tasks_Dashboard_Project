/**
 * Resolve portable data directory next to the app (USB-friendly).
 * Dev: project root /data ; Prod: directory containing the exe /data
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const DATA_SUBDIRS = ['wallpapers', 'sounds', 'exports', 'themes'];

/** Absolute path to the portable data root. */
function getDataDir() {
  if (!app.isPackaged) {
    // Dev: workspace root (two levels up from src/main)
    return path.join(__dirname, '..', '..', 'data');
  }
  // Packaged dir build: sit beside the executable
  return path.join(path.dirname(process.execPath), 'data');
}

/** Ensure data/ and known subfolders exist. Returns dataDir. */
function ensureDirs() {
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  for (const sub of DATA_SUBDIRS) {
    const p = path.join(dataDir, sub);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
  return dataDir;
}

/** Path to dashboard.db inside data/. */
function getDbPath() {
  return path.join(getDataDir(), 'dashboard.db');
}

/** Path to schema.sql (dev vs packaged resources). */
function getSchemaPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'services', 'db', 'schema.sql');
  }
  return path.join(process.resourcesPath, 'schema.sql');
}

module.exports = { getDataDir, ensureDirs, getDbPath, getSchemaPath, DATA_SUBDIRS };
