/**
 * SQLite access layer (better-sqlite3). Main process only.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const { getDbPath, getSchemaPath, ensureDirs } = require('./portable-paths');
const { logError } = require('./logger');

let db = null;

const DEFAULT_SETTINGS = {
  wallpaper_mode: 'color',
  wallpaper_color: '#0a1628',
  wallpaper_image_path: '',
  wallpaper_fit: 'fill',
  wallpaper_dim: '0',
  notif_position: 'br',
  notif_timeout_seconds: '15',
  notif_text_color: '#ffffff',
  notif_random_bg: 'false',
  notif_random_sfx: 'false',
  notif_volume: '50',
  notif_grace_period_hours: '1',
  notif_default_snooze_minutes: '10',
  retention_days_expired: '7',
  archive_retention_years: '3',
  auto_delete_archive: 'false',
  archive_filesize_limit_mb: '500',
  auto_delete_expired7: 'false',
  auto_delete_expired7_days: '30',
  list_naming_templates: JSON.stringify(['Current Date', 'Project', 'Other']),
  theme_base: 'dark',
  active_theme_id: '1',
  layout_mode: 'compact',
  display_name: '',
  Debut_mode: '1',
  show_tags_always: 'false',
  backup_auto_daily: 'true',
  last_backup_at: '',
  last_backup_path: '',
  hotkeys: JSON.stringify({
    calendar: 'Ctrl+C',
    projects: 'Ctrl+P',
    habits: 'Ctrl+H',
    bills: 'Ctrl+B',
  }),
};

const SYSTEM_TAGS = [
  'todo_24', 'todo_open', 'todo_completed', 'todo_expired', 'todo_alerted',
  'rem_today', 'rem_tomorrow', 'rem_dated', 'rem_open',
  'rem_pending', 'rem_fired', 'rem_grace', 'rem_ignored',
  'rem_completed', 'rem_snoozed', 'locked', 'archived',
  'nudge',
];

const DEFAULT_DARK_THEME = {
  name: 'Dark Glass',
  '--bg': 'transparent',
  '--panel-bg': 'rgba(12, 18, 28, 0.72)',
  '--panel-border': 'rgba(255, 255, 255, 0.08)',
  '--text-primary': '#f2f5f8',
  '--text-secondary': 'rgba(242, 245, 248, 0.55)',
  '--text-muted': 'rgba(242, 245, 248, 0.35)',
  '--accent': '#39ff6a',
  '--accent-dim': 'rgba(57, 255, 106, 0.25)',
  '--sidebar-bg': 'rgba(10, 14, 22, 0.78)',
  '--sidebar-active-bg': 'rgba(57, 255, 106, 0.12)',
  '--sidebar-active-text': '#39ff6a',
  '--input-bg': 'rgba(0, 0, 0, 0.35)',
  '--input-border': 'rgba(255, 255, 255, 0.12)',
  '--progress-fill': '#39ff6a',
  '--progress-track': 'rgba(255, 255, 255, 0.1)',
  '--topbar-bg': 'rgba(8, 12, 20, 0.65)',
  '--danger': '#ff5c5c',
};

const DEFAULT_LIGHT_THEME = {
  name: 'Light Glass',
  '--bg': 'transparent',
  '--panel-bg': 'rgba(255, 255, 255, 0.78)',
  '--panel-border': 'rgba(0, 0, 0, 0.08)',
  '--text-primary': '#12181f',
  '--text-secondary': 'rgba(18, 24, 31, 0.6)',
  '--text-muted': 'rgba(18, 24, 31, 0.4)',
  '--accent': '#0d9f4a',
  '--accent-dim': 'rgba(13, 159, 74, 0.18)',
  '--sidebar-bg': 'rgba(245, 248, 250, 0.85)',
  '--sidebar-active-bg': 'rgba(13, 159, 74, 0.12)',
  '--sidebar-active-text': '#0d9f4a',
  '--input-bg': 'rgba(255, 255, 255, 0.9)',
  '--input-border': 'rgba(0, 0, 0, 0.12)',
  '--progress-fill': '#0d9f4a',
  '--progress-track': 'rgba(0, 0, 0, 0.08)',
  '--topbar-bg': 'rgba(255, 255, 255, 0.7)',
  '--danger': '#d93838',
};

/** Open DB, run schema, seed defaults. Call once on app ready. */
function initDatabase() {
  try {
    ensureDirs();
    const dbPath = getDbPath();
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schemaPath = getSchemaPath();
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    migrateSchema();

    seedSettings();
    seedSystemTags();
    seedThemes();
    try {
      require('../services/db/calendar-sync').syncOnAppStart();
    } catch (syncErr) {
      logError('syncOnAppStart', syncErr);
    }
    return db;
  } catch (err) {
    logError('initDatabase', err);
    throw err;
  }
}

/** Additive columns for DBs created before Phase 3 schema extensions. */
function migrateSchema() {
  const habitCols = db.prepare('PRAGMA table_info(habits)').all().map((c) => c.name);
  const addHabit = (col, ddl) => {
    if (!habitCols.includes(col)) db.exec(`ALTER TABLE habits ADD COLUMN ${ddl}`);
  };
  addHabit('nudge_time', 'nudge_time TEXT');
  addHabit('snooze_until', 'snooze_until DATETIME');
  addHabit('last_nudge_date', 'last_nudge_date DATE');
  addHabit('description', 'description TEXT');
  addHabit('priority', 'priority INTEGER DEFAULT 3');

  const billCols = db.prepare('PRAGMA table_info(bills)').all().map((c) => c.name);
  const addBill = (col, ddl) => {
    if (!billCols.includes(col)) db.exec(`ALTER TABLE bills ADD COLUMN ${ddl}`);
  };
  addBill('snooze_until', 'snooze_until DATETIME');
  addBill('alerted_before', 'alerted_before INTEGER DEFAULT 0');
  addBill('alerted_due', 'alerted_due INTEGER DEFAULT 0');
  addBill('amount_mode', "amount_mode TEXT NOT NULL DEFAULT 'fixed'");
  addBill('priority', 'priority INTEGER DEFAULT 3');
  addBill('description', 'description TEXT');

  const remCols = db.prepare('PRAGMA table_info(reminders)').all().map((c) => c.name);
  if (!remCols.includes('description')) {
    db.exec('ALTER TABLE reminders ADD COLUMN description TEXT');
  }
  if (!remCols.includes('nudge_datetime')) {
    db.exec('ALTER TABLE reminders ADD COLUMN nudge_datetime TEXT');
  }
  if (!remCols.includes('nudge_mode')) {
    db.exec('ALTER TABLE reminders ADD COLUMN nudge_mode TEXT');
  }
  if (!remCols.includes('nudge_alerted')) {
    db.exec('ALTER TABLE reminders ADD COLUMN nudge_alerted INTEGER DEFAULT 0');
  }

  // One-shot: clamp legacy task 4–5 down to P3 Low
  const prioFlag = db
    .prepare("SELECT value FROM settings WHERE key = 'priority_3level_v1'")
    .get();
  if (!prioFlag || prioFlag.value !== '1') {
    db.prepare('UPDATE tasks SET priority = 3 WHERE priority IS NOT NULL AND priority > 3').run();
    db.prepare('UPDATE tasks SET priority = 1 WHERE priority IS NOT NULL AND priority < 1').run();
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('priority_3level_v1', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run();
  }

  // Payment history for estimate/average (CREATE IF NOT EXISTS covers older DBs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bill_payments (
      id INTEGER PRIMARY KEY,
      bill_id INTEGER,
      bill_name TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date DATE,
      paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE SET NULL
    );
  `);

  // One-shot: remove exact payment dupes (same name + amount + due_date), keep oldest id
  const dedupeFlag = db
    .prepare("SELECT value FROM settings WHERE key = 'bill_payments_exact_deduped_v1'")
    .get();
  if (!dedupeFlag || dedupeFlag.value !== '1') {
    db.prepare(
      `DELETE FROM bill_payments
       WHERE id NOT IN (
         SELECT MIN(id) FROM bill_payments
         GROUP BY lower(trim(bill_name)), amount, due_date
       )`
    ).run();
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('bill_payments_exact_deduped_v1', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run();
  }

  // One-shot: daily|weekdays|custom → daily|weekly|monthly + nudge tags
  const habitFreqFlag = db
    .prepare("SELECT value FROM settings WHERE key = 'habits_freq_nudge_v1'")
    .get();
  if (!habitFreqFlag || habitFreqFlag.value !== '1') {
    db.prepare(
      `UPDATE habits SET frequency = 'weekly' WHERE frequency = 'weekdays'`
    ).run();
    db.prepare(
      `UPDATE habits SET frequency = 'monthly' WHERE frequency = 'custom'`
    ).run();
    // Ensure nudge system tag exists, then attach to habits with nudge_time
    db.prepare(
      `INSERT OR IGNORE INTO tags (name, color, is_system) VALUES ('nudge', NULL, 1)`
    ).run();
    const nudgeTag = db.prepare(`SELECT id FROM tags WHERE name = 'nudge'`).get();
    if (nudgeTag) {
      const withNudge = db
        .prepare(`SELECT id FROM habits WHERE nudge_time IS NOT NULL`)
        .all();
      const exists = db.prepare(
        `SELECT id FROM item_tags
         WHERE item_type = 'habit' AND item_id = ? AND tag_id = ?`
      );
      const link = db.prepare(
        `INSERT INTO item_tags (item_type, item_id, tag_id) VALUES ('habit', ?, ?)`
      );
      for (const h of withNudge) {
        if (!exists.get(h.id, nudgeTag.id)) link.run(h.id, nudgeTag.id);
      }
    }
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('habits_freq_nudge_v1', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run();
  }

  migrateContainerColumns();
  migrateCalendarLinks();
}

/** Linked calendar events + reminder appointment flag (existing DBs). */
function migrateCalendarLinks() {
  const eventCols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  const addEvent = (col, ddl) => {
    if (!eventCols.includes(col)) db.exec(`ALTER TABLE events ADD COLUMN ${ddl}`);
  };
  addEvent('source_type', 'source_type TEXT');
  addEvent('source_id', 'source_id INTEGER');
  addEvent('occurrence_date', 'occurrence_date DATE');
  addEvent('hidden', 'hidden INTEGER DEFAULT 0');

  const remCols = db.prepare('PRAGMA table_info(reminders)').all().map((c) => c.name);
  if (!remCols.includes('is_appointment')) {
    db.exec('ALTER TABLE reminders ADD COLUMN is_appointment INTEGER DEFAULT 0');
  }

  // Collapse pre-index dupes so the unique index can be created
  db.prepare(
    `DELETE FROM events
     WHERE source_type IS NOT NULL
       AND occurrence_date IS NOT NULL
       AND id NOT IN (
         SELECT MIN(id) FROM events
         WHERE source_type IS NOT NULL AND occurrence_date IS NOT NULL
         GROUP BY source_type, source_id, occurrence_date
       )`
  ).run();

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_occ
      ON events(source_type, source_id, occurrence_date)
      WHERE source_type IS NOT NULL AND occurrence_date IS NOT NULL
  `);
}

/** Padlock + cleanup container columns; backfill locked from #locked tag. */
function migrateContainerColumns() {
  const addCols = (table) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes('locked')) db.exec(`ALTER TABLE ${table} ADD COLUMN locked INTEGER DEFAULT 0`);
    if (!cols.includes('container')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN container TEXT NOT NULL DEFAULT 'active'`);
    }
  };
  addCols('tasks');
  addCols('reminders');

  const flag = db
    .prepare("SELECT value FROM settings WHERE key = 'containers_locked_backfill_v1'")
    .get();
  if (flag && flag.value === '1') return;

  db.prepare(
    `UPDATE tasks SET locked = 1 WHERE id IN (
       SELECT it.item_id FROM item_tags it
       JOIN tags t ON t.id = it.tag_id
       WHERE it.item_type = 'task' AND t.name = 'locked'
     )`
  ).run();
  db.prepare(
    `UPDATE reminders SET locked = 1 WHERE id IN (
       SELECT it.item_id FROM item_tags it
       JOIN tags t ON t.id = it.tag_id
       WHERE it.item_type = 'reminder' AND t.name = 'locked'
     )`
  ).run();
  db.prepare(
    `UPDATE tasks SET container = 'archive' WHERE archived = 1 AND (container IS NULL OR container = 'active')`
  ).run();
  db.prepare(
    `UPDATE reminders SET container = 'archive' WHERE archived = 1 AND (container IS NULL OR container = 'active')`
  ).run();
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('containers_locked_backfill_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run();
}

function seedSettings() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insert.run(key, value);
    }
  });
  tx();
}

function seedSystemTags() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO tags (name, color, is_system) VALUES (?, ?, 1)'
  );
  const tx = db.transaction(() => {
    for (const name of SYSTEM_TAGS) {
      insert.run(name, null);
    }
  });
  tx();
}

function seedThemes() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM themes').get().c;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO themes (name, theme_json, is_default) VALUES (?, ?, ?)'
  );
  insert.run(DEFAULT_DARK_THEME.name, JSON.stringify(DEFAULT_DARK_THEME), 1);
  insert.run(DEFAULT_LIGHT_THEME.name, JSON.stringify(DEFAULT_LIGHT_THEME), 0);
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

/** Return all settings as a plain object. */
function getAllSettings() {
  try {
    const rows = getDb().prepare('SELECT key, value FROM settings').all();
    const out = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
  } catch (err) {
    logError('getAllSettings', err);
    throw err;
  }
}

/** Set a single settings key. */
function setSetting(key, value) {
  try {
    getDb()
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, String(value));
    return true;
  } catch (err) {
    logError('setSetting', err);
    throw err;
  }
}

/** Active theme JSON merged with theme_base preference. */
function getActiveTheme() {
  try {
    const settings = getAllSettings();
    const base = settings.theme_base || 'dark';
    const id = Number(settings.active_theme_id) || 1;
    let row = getDb().prepare('SELECT * FROM themes WHERE id = ?').get(id);
    if (!row) {
      row = getDb()
        .prepare('SELECT * FROM themes WHERE is_default = 1 LIMIT 1')
        .get();
    }
    // If light base requested and we have Light Glass, prefer it when active_theme_id still default
    if (base === 'light') {
      const light = getDb()
        .prepare("SELECT * FROM themes WHERE name = 'Light Glass' LIMIT 1")
        .get();
      if (light) row = light;
    } else if (base === 'dark') {
      const dark = getDb()
        .prepare("SELECT * FROM themes WHERE name = 'Dark Glass' LIMIT 1")
        .get();
      if (dark) row = dark;
    }
    return {
      id: row.id,
      name: row.name,
      vars: JSON.parse(row.theme_json),
      theme_base: base,
    };
  } catch (err) {
    logError('getActiveTheme', err);
    throw err;
  }
}

/** Switch light/dark base and point active_theme_id at matching preset. */
function setThemeBase(base) {
  try {
    if (base !== 'light' && base !== 'dark' && base !== 'custom') {
      throw new Error('Invalid theme_base');
    }
    setSetting('theme_base', base);
    if (base === 'light' || base === 'dark') {
      const name = base === 'light' ? 'Light Glass' : 'Dark Glass';
      const row = getDb()
        .prepare('SELECT id FROM themes WHERE name = ? LIMIT 1')
        .get(name);
      if (row) setSetting('active_theme_id', String(row.id));
    }
    return getActiveTheme();
  } catch (err) {
    logError('setThemeBase', err);
    throw err;
  }
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDb,
  getAllSettings,
  setSetting,
  getActiveTheme,
  setThemeBase,
  closeDatabase,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
};
