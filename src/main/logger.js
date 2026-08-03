/**
 * Simple file logger — avoids console.log in production paths.
 */
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./portable-paths');

function logError(context, err) {
  try {
    const line = `[${new Date().toISOString()}] ${context}: ${err?.stack || err}\n`;
    const logPath = path.join(getDataDir(), 'app-error.log');
    fs.appendFileSync(logPath, line);
  } catch {
    // Last resort if data dir unavailable
  }
}

module.exports = { logError };
