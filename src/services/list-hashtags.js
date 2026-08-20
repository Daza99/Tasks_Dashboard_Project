/**
 * File-backed whitelist of list hashtags (one bare name per line).
 * Path: data/list-hashtags.txt — portable beside the DB.
 */
const fs = require('fs');
const path = require('path');
const { getDataDir, ensureDirs } = require('../main/portable-paths');
const { normalizeTagName } = require('../utils/tag-helpers.cjs');
const { logError } = require('../main/logger');

const SEED = ['list'];

/** Absolute path to the whitelist file. */
function getWhitelistPath() {
  return path.join(getDataDir(), 'list-hashtags.txt');
}

/** Ensure file exists with seed tags. */
function ensureWhitelistFile() {
  ensureDirs();
  const p = getWhitelistPath();
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, `${SEED.join('\n')}\n`, 'utf8');
  }
  return p;
}

/**
 * Read unique bare hashtag names (sorted).
 * @returns {string[]}
 */
function readWhitelist() {
  try {
    const p = ensureWhitelistFile();
    const raw = fs.readFileSync(p, 'utf8');
    const names = new Set();
    for (const line of raw.split(/\r?\n/)) {
      const bare = normalizeTagName(line);
      if (bare) names.add(bare);
    }
    if (!names.size) {
      for (const s of SEED) names.add(s);
      fs.writeFileSync(p, `${[...names].join('\n')}\n`, 'utf8');
    }
    return [...names].sort();
  } catch (err) {
    logError('readWhitelist', err);
    return [...SEED];
  }
}

/**
 * Append a new hashtag if not already present.
 * @param {string} name bare or #prefixed
 * @returns {string[]} updated whitelist
 */
function appendHashtag(name) {
  try {
    const bare = normalizeTagName(name);
    if (!bare) return readWhitelist();
    const current = readWhitelist();
    if (current.includes(bare)) return current;
    const p = ensureWhitelistFile();
    fs.appendFileSync(p, `${bare}\n`, 'utf8');
    return readWhitelist();
  } catch (err) {
    logError('appendHashtag', err);
    throw err;
  }
}

module.exports = {
  getWhitelistPath,
  readWhitelist,
  appendHashtag,
};
