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
  wallpaper_color: '#3e5679',
  wallpaper_color_id: '',
  wallpaper_image_path: '',
  wallpaper_fit: 'fill',
  wallpaper_dim: '0',
  notif_position: 'br',
  notif_timeout_seconds: '15',
  notif_text_color: '#111111',
  notif_random_bg: 'true',
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
  theme_brightness_dark: '50',
  theme_brightness_light: '50',
  theme_custom_id: '',
  layout_mode: 'compact',
  display_name: '',
  date_format: 'ymd',
  Debut_mode: '1',
  show_tags_always: 'false',
  backup_auto_daily: 'true',
  backup_remind_days: '5',
  backup_remind_id: '',
  last_backup_at: '',
  last_backup_path: '',
  hotkeys: JSON.stringify({
    calendar: 'Ctrl+C',
    projects: 'Ctrl+P',
    trackers: 'Ctrl+T',
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
  '--panel-bg': 'rgba(62, 86, 121, 0.72)',
  '--panel-border': 'rgba(255, 255, 255, 0.08)',
  '--text-primary': '#f2f5f8',
  '--text-secondary': 'rgba(242, 245, 248, 0.55)',
  '--text-muted': 'rgba(242, 245, 248, 0.35)',
  '--accent': '#39ff6a',
  '--accent-dim': 'rgba(57, 255, 106, 0.25)',
  '--sidebar-bg': 'rgba(62, 86, 121, 0.78)',
  '--sidebar-active-bg': 'rgba(57, 255, 106, 0.12)',
  '--sidebar-active-text': '#39ff6a',
  '--input-bg': 'rgba(0, 0, 0, 0.35)',
  '--input-border': 'rgba(255, 255, 255, 0.12)',
  '--progress-fill': '#39ff6a',
  '--progress-track': 'rgba(255, 255, 255, 0.1)',
  '--topbar-bg': 'rgba(62, 86, 121, 0.65)',
  '--danger': '#ff5c5c',
  '--button-bg': 'rgba(57, 255, 106, 0.25)',
  '--button-text': '#39ff6a',
  '--action-text': 'rgba(242, 245, 248, 0.55)',
  '--clock-color': '#39ff6a',
  '--font-clock': '"Cascadia Mono", "Consolas", "Courier New", monospace',
};

const DEFAULT_LIGHT_THEME = {
  name: 'Light Glass',
  '--bg': 'transparent',
  '--panel-bg': 'rgba(255, 255, 255, 0.78)',
  '--panel-border': 'rgba(0, 0, 0, 0.08)',
  '--text-primary': '#12181f',
  '--text-secondary': 'rgba(18, 24, 31, 0.6)',
  '--text-muted': 'rgba(18, 24, 31, 0.4)',
  '--accent': '#056b32',
  '--accent-dim': 'rgba(46, 196, 102, 0.30)',
  '--sidebar-bg': 'rgba(245, 248, 250, 0.85)',
  '--sidebar-active-bg': 'rgba(46, 196, 102, 0.20)',
  '--sidebar-active-text': '#056b32',
  '--input-bg': 'rgba(255, 255, 255, 0.9)',
  '--input-border': 'rgba(0, 0, 0, 0.12)',
  '--progress-fill': '#056b32',
  '--progress-track': 'rgba(0, 0, 0, 0.08)',
  '--topbar-bg': 'rgba(255, 255, 255, 0.7)',
  '--danger': '#d93838',
  '--button-bg': 'rgba(46, 196, 102, 0.30)',
  '--button-text': '#056b32',
  '--action-text': 'rgba(18, 24, 31, 0.6)',
  '--clock-color': '#056b32',
  '--font-clock': '"Cascadia Mono", "Consolas", "Courier New", monospace',
};

/** In-memory Custom / New starter — not a themes row. */
const DEFAULT_NEUTRAL_THEME = {
  name: 'Neutral',
  '--bg': 'transparent',
  '--panel-bg': 'rgba(40, 42, 46, 0.72)',
  '--panel-border': 'rgba(255, 255, 255, 0.1)',
  '--text-primary': '#ececec',
  '--text-secondary': 'rgba(236, 236, 236, 0.55)',
  '--text-muted': 'rgba(236, 236, 236, 0.35)',
  '--accent': '#c4c8ce',
  '--accent-dim': 'rgba(196, 200, 206, 0.25)',
  '--sidebar-bg': 'rgba(32, 34, 38, 0.78)',
  '--sidebar-active-bg': 'rgba(196, 200, 206, 0.12)',
  '--sidebar-active-text': '#c4c8ce',
  '--input-bg': 'rgba(0, 0, 0, 0.35)',
  '--input-border': 'rgba(255, 255, 255, 0.12)',
  '--progress-fill': '#c4c8ce',
  '--progress-track': 'rgba(255, 255, 255, 0.1)',
  '--topbar-bg': 'rgba(28, 30, 34, 0.65)',
  '--danger': '#ff5c5c',
  '--button-bg': 'rgba(196, 200, 206, 0.22)',
  '--button-text': '#c4c8ce',
  '--action-text': 'rgba(236, 236, 236, 0.55)',
  '--clock-color': '#c4c8ce',
  '--font-clock': '"Cascadia Mono", "Consolas", "Courier New", monospace',
};

const BUILTIN_THEME_NAMES = ['Dark Glass', 'Light Glass'];

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
    migrateThemeBrightness();
    migrateWallpaperColorId();
    migrateBackupSettings();
    migrateNotifRandomDefault();
    migrateLightGlassGreenContrast();
    migrateDarkGlassBg();
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
  addBill('show_on_calendar', 'show_on_calendar INTEGER DEFAULT 1');
  addBill('nudge_datetime', 'nudge_datetime TEXT');
  addBill('nudge_mode', 'nudge_mode TEXT');
  addBill('nudge_alerted', 'nudge_alerted INTEGER DEFAULT 0');

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
  migrateListsLocal();
  migrateListsHashtagBackfill();
  migrateListsHashtagRetagAfterInspector();
  migrateTagInspector();
  migrateNotesModule();
  migrateWallpaperColors();
}

/** Notes pad columns + category dropdown table (existing DBs). */
function migrateNotesModule() {
  const noteCols = db.prepare('PRAGMA table_info(notes)').all().map((c) => c.name);
  if (!noteCols.includes('style_json')) db.exec('ALTER TABLE notes ADD COLUMN style_json TEXT');
  if (!noteCols.includes('category')) db.exec('ALTER TABLE notes ADD COLUMN category TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Tag Inspector tables + unique item_tags. Dedup before the unique index
 * (existing DBs). Flag item_tags_unique_v1 — INSERT OR IGNORE would not
 * update live rows; CREATE TABLE IF NOT EXISTS does not add indexes.
 */
function migrateTagInspector() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_audit_runs (
      id INTEGER PRIMARY KEY,
      ran_at DATETIME NOT NULL,
      trigger TEXT NOT NULL,
      summary_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tag_audit_events (
      id INTEGER PRIMARY KEY,
      run_id INTEGER NOT NULL,
      item_type TEXT,
      item_id INTEGER,
      from_tag TEXT,
      to_tag TEXT,
      note TEXT,
      FOREIGN KEY(run_id) REFERENCES tag_audit_runs(id) ON DELETE CASCADE
    );
  `);

  const flag = db
    .prepare("SELECT value FROM settings WHERE key = 'item_tags_unique_v1'")
    .get();
  if (flag && flag.value === '1') return;

  db.prepare(
    `DELETE FROM item_tags
     WHERE id NOT IN (
       SELECT MIN(id) FROM item_tags GROUP BY item_type, item_id, tag_id
     )`
  ).run();
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_item_tags_unique
       ON item_tags(item_type, item_id, tag_id)`
  );
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('item_tags_unique_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run();
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

/**
 * Lists v2: todo|bullet|md, list-local checklist rows, drop reminder lists.
 * One-shot flag lists_local_v1.
 */
function migrateListsLocal() {
  const listCols = db.prepare('PRAGMA table_info(lists)').all().map((c) => c.name);
  if (!listCols.includes('content')) db.exec('ALTER TABLE lists ADD COLUMN content TEXT');
  if (!listCols.includes('style_json')) db.exec('ALTER TABLE lists ADD COLUMN style_json TEXT');

  const flag = db.prepare("SELECT value FROM settings WHERE key = 'lists_local_v1'").get();
  if (flag && flag.value === '1') return;

  db.prepare(
    `DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE type = 'reminder')`
  ).run();
  db.prepare("DELETE FROM lists WHERE type = 'reminder'").run();

  const itemCols = db.prepare('PRAGMA table_info(list_items)').all().map((c) => c.name);
  if (itemCols.includes('item_type') || itemCols.includes('item_id')) {
    db.exec(`
      CREATE TABLE list_items_new (
        id INTEGER PRIMARY KEY,
        list_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        done INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(list_id) REFERENCES lists(id)
      );
    `);
    db.exec('DROP TABLE list_items');
    db.exec('ALTER TABLE list_items_new RENAME TO list_items');
  }

  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('lists_local_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run();
}

/**
 * One-shot: tag existing lists with #list so the default hashtag filter
 * is not empty. Flag lists_hashtag_backfill_v1.
 */
function migrateListsHashtagBackfill() {
  const flag = db
    .prepare("SELECT value FROM settings WHERE key = 'lists_hashtag_backfill_v1'")
    .get();
  if (flag && flag.value === '1') return;

  db.prepare(
    `INSERT OR IGNORE INTO tags (name, color, is_system) VALUES ('list', NULL, 0)`
  ).run();
  const listTag = db.prepare(`SELECT id FROM tags WHERE name = 'list'`).get();
  if (listTag) {
    const lists = db.prepare('SELECT id FROM lists').all();
    const hasUserTag = db.prepare(
      `SELECT 1 FROM item_tags it
       JOIN tags t ON t.id = it.tag_id
       WHERE it.item_type = 'list' AND it.item_id = ? AND t.is_system = 0
       LIMIT 1`
    );
    const link = db.prepare(
      `INSERT INTO item_tags (item_type, item_id, tag_id) VALUES ('list', ?, ?)`
    );
    for (const row of lists) {
      if (!hasUserTag.get(row.id)) link.run(row.id, listTag.id);
    }
  }

  // Seed whitelist file so autocomplete has #list
  try {
    require('../services/list-hashtags').readWhitelist();
  } catch {
    /* ignore — file created on first Lists visit */
  }

  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('lists_hashtag_backfill_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run();
}

/**
 * Re-tag lists whose #list tags were wiped by Tag Inspector orphan repair
 * (item_type 'list' was not in TAGGED_TYPES). Flag lists_hashtag_retag_v2.
 */
function migrateListsHashtagRetagAfterInspector() {
  const flag = db
    .prepare("SELECT value FROM settings WHERE key = 'lists_hashtag_retag_v2'")
    .get();
  if (flag && flag.value === '1') return;

  db.prepare(
    `INSERT OR IGNORE INTO tags (name, color, is_system) VALUES ('list', NULL, 0)`
  ).run();
  const listTag = db.prepare(`SELECT id FROM tags WHERE name = 'list'`).get();
  if (listTag) {
    const lists = db.prepare('SELECT id FROM lists').all();
    const hasUserTag = db.prepare(
      `SELECT 1 FROM item_tags it
       JOIN tags t ON t.id = it.tag_id
       WHERE it.item_type = 'list' AND it.item_id = ? AND t.is_system = 0
       LIMIT 1`
    );
    const link = db.prepare(
      `INSERT INTO item_tags (item_type, item_id, tag_id) VALUES ('list', ?, ?)`
    );
    for (const row of lists) {
      if (!hasUserTag.get(row.id)) link.run(row.id, listTag.id);
    }
  }

  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('lists_hashtag_retag_v2', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run();
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

const BACKUP_MODES = new Set(['daily', 'every3', 'remind', 'off']);

/** One-time: derive backup_mode from legacy backup_auto_daily (do not seed daily blindly). */
function migrateBackupSettings() {
  const s = getAllSettings();
  if (!s.backup_mode || !BACKUP_MODES.has(s.backup_mode)) {
    setSetting('backup_mode', s.backup_auto_daily === 'false' ? 'off' : 'daily');
  }
  if (s.backup_remind_days == null || s.backup_remind_days === '') {
    setSetting('backup_remind_days', '5');
  }
  if (s.backup_remind_id == null) {
    setSetting('backup_remind_id', '');
  }
}

/** One-time: feature was seeded off; turn random colors on. Later opt-out is kept. */
function migrateNotifRandomDefault() {
  const s = getAllSettings();
  if (s.notif_random_bg_enable_v1 === '1') return;
  if (s.notif_random_bg !== 'true') {
    setSetting('notif_random_bg', 'true');
  }
  setSetting('notif_random_bg_enable_v1', '1');
}

/** One-time: Light Glass mid-green washed out; brighter fill + darker ink. */
function migrateLightGlassGreenContrast() {
  const s = getAllSettings();
  if (s.theme_light_green_v1 === '1') return;
  const row = getDb()
    .prepare("SELECT id, theme_json FROM themes WHERE name = 'Light Glass' LIMIT 1")
    .get();
  if (row) {
    let parsed = {};
    try {
      parsed = JSON.parse(row.theme_json) || {};
    } catch {
      parsed = {};
    }
    const greens = {
      '--accent': DEFAULT_LIGHT_THEME['--accent'],
      '--accent-dim': DEFAULT_LIGHT_THEME['--accent-dim'],
      '--sidebar-active-bg': DEFAULT_LIGHT_THEME['--sidebar-active-bg'],
      '--sidebar-active-text': DEFAULT_LIGHT_THEME['--sidebar-active-text'],
      '--progress-fill': DEFAULT_LIGHT_THEME['--progress-fill'],
      '--button-bg': DEFAULT_LIGHT_THEME['--button-bg'],
      '--button-text': DEFAULT_LIGHT_THEME['--button-text'],
      '--clock-color': DEFAULT_LIGHT_THEME['--clock-color'],
    };
    getDb()
      .prepare('UPDATE themes SET theme_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...parsed, ...greens }), row.id);
  }
  setSetting('theme_light_green_v1', '1');
}

/** One-time: Dark Glass fills + factory wallpaper navy → #3e5679. */
function migrateDarkGlassBg() {
  const s = getAllSettings();
  if (s.theme_dark_bg_v1 === '1') return;
  const row = getDb()
    .prepare("SELECT id, theme_json FROM themes WHERE name = 'Dark Glass' LIMIT 1")
    .get();
  if (row) {
    let parsed = {};
    try {
      parsed = JSON.parse(row.theme_json) || {};
    } catch {
      parsed = {};
    }
    const fills = {
      '--panel-bg': DEFAULT_DARK_THEME['--panel-bg'],
      '--sidebar-bg': DEFAULT_DARK_THEME['--sidebar-bg'],
      '--topbar-bg': DEFAULT_DARK_THEME['--topbar-bg'],
    };
    getDb()
      .prepare('UPDATE themes SET theme_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...parsed, ...fills }), row.id);
  }
  const hex = String(s.wallpaper_color || '').trim().toLowerCase();
  if (hex === '#0a1628') {
    setSetting('wallpaper_color', '#3e5679');
    const id = String(s.wallpaper_color_id || '').trim();
    if (!id) setSetting('wallpaper_color_id', '');
  }
  setSetting('theme_dark_bg_v1', '1');
}

/** Existing DBs: INSERT OR IGNORE won't add brightness keys. */
function migrateThemeBrightness() {
  const s = getAllSettings();
  if (s.theme_brightness_dark == null || s.theme_brightness_dark === '') {
    setSetting('theme_brightness_dark', '50');
  }
  if (s.theme_brightness_light == null || s.theme_brightness_light === '') {
    setSetting('theme_brightness_light', '50');
  }
  if (s.theme_custom_id == null) setSetting('theme_custom_id', '');
}

/** Existing DBs: INSERT OR IGNORE will not add wallpaper_color_id. */
function migrateWallpaperColorId() {
  const s = getAllSettings();
  if (s.wallpaper_color_id == null) setSetting('wallpaper_color_id', '');
}

/** Named wallpaper color presets (existing DBs). */
function migrateWallpaperColors() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallpaper_colors (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
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

/** CSS custom properties only (skip `name` and junk). */
function cssVarsOnly(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('--') && v != null && v !== '') out[k] = v;
  }
  return out;
}

function isBuiltinThemeName(name) {
  return BUILTIN_THEME_NAMES.includes(name);
}

function fallbackDefaults(row, base) {
  if (base === 'light' || (row && row.name === 'Light Glass')) return DEFAULT_LIGHT_THEME;
  return DEFAULT_DARK_THEME;
}

function parseThemeJson(raw, fallback) {
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  return { ...cssVarsOnly(fallback), ...cssVarsOnly(parsed) };
}

function themeFromRow(row, base) {
  return {
    id: row.id,
    name: row.name,
    vars: parseThemeJson(row.theme_json, fallbackDefaults(row, base)),
    theme_base: base,
    builtin: isBuiltinThemeName(row.name),
  };
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
    return themeFromRow(row, base);
  } catch (err) {
    logError('getActiveTheme', err);
    throw err;
  }
}

/** Switch light/dark/custom base. Custom does not apply last saved until Confirm. */
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

/** User-named presets (not Dark/Light Glass). */
function listCustomThemes() {
  try {
    const rows = getDb()
      .prepare(
        `SELECT id, name, theme_json FROM themes
         WHERE name NOT IN ('Dark Glass', 'Light Glass')
         ORDER BY name COLLATE NOCASE`
      )
      .all();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      vars: parseThemeJson(r.theme_json, DEFAULT_DARK_THEME),
    }));
  } catch (err) {
    logError('listCustomThemes', err);
    throw err;
  }
}

/**
 * Insert (New) or overwrite an existing user preset, then activate it.
 * @param {{ id?: number, name?: string, vars: Record<string, string> }} payload
 */
function saveCustomTheme(payload) {
  try {
    const json = JSON.stringify({ ...cssVarsOnly(DEFAULT_DARK_THEME), ...cssVarsOnly(payload?.vars) });
    const id = payload && payload.id != null ? Number(payload.id) : null;
    if (id) {
      const row = getDb().prepare('SELECT * FROM themes WHERE id = ?').get(id);
      if (!row || isBuiltinThemeName(row.name)) {
        throw new Error('Cannot overwrite built-in theme');
      }
      const name = payload?.name != null ? String(payload.name).trim().slice(0, 40) : '';
      if (name && isBuiltinThemeName(name)) throw new Error('Reserved theme name');
      if (name) {
        getDb()
          .prepare('UPDATE themes SET theme_json = ?, name = ? WHERE id = ?')
          .run(json, name, row.id);
      } else {
        getDb().prepare('UPDATE themes SET theme_json = ? WHERE id = ?').run(json, row.id);
      }
      setSetting('active_theme_id', String(row.id));
      setSetting('theme_custom_id', String(row.id));
      setSetting('theme_base', 'custom');
    } else {
      const name = String(payload?.name || '').trim().slice(0, 40);
      if (!name) throw new Error('Name required');
      if (isBuiltinThemeName(name)) throw new Error('Reserved theme name');
      const info = getDb()
        .prepare('INSERT INTO themes (name, theme_json, is_default) VALUES (?, ?, 0)')
        .run(name, json);
      const newId = Number(info.lastInsertRowid);
      setSetting('active_theme_id', String(newId));
      setSetting('theme_custom_id', String(newId));
      setSetting('theme_base', 'custom');
    }
    return getActiveTheme();
  } catch (err) {
    logError('saveCustomTheme', err);
    throw err;
  }
}

/** Built-in CSS vars; Custom / New uses in-memory Neutral. */
function getThemeDefaults(base) {
  let src = DEFAULT_DARK_THEME;
  if (base === 'light') src = DEFAULT_LIGHT_THEME;
  else if (base === 'neutral') src = DEFAULT_NEUTRAL_THEME;
  return cssVarsOnly(src);
}

/**
 * Insert or restore a built-in Glass row from the in-code default.
 * @param {object} def DEFAULT_DARK_THEME | DEFAULT_LIGHT_THEME
 * @param {boolean} isDefault
 * @returns {number} row id
 */
function ensureBuiltinTheme(def, isDefault) {
  const json = JSON.stringify(def);
  const row = getDb().prepare('SELECT id FROM themes WHERE name = ? LIMIT 1').get(def.name);
  if (row) {
    getDb()
      .prepare('UPDATE themes SET theme_json = ?, is_default = ? WHERE id = ?')
      .run(json, isDefault ? 1 : 0, row.id);
    return row.id;
  }
  const info = getDb()
    .prepare('INSERT INTO themes (name, theme_json, is_default) VALUES (?, ?, ?)')
    .run(def.name, json, isDefault ? 1 : 0);
  return Number(info.lastInsertRowid);
}

/**
 * Restore Dark/Light Glass JSON and switch to Dark Glass at brightness 50.
 * Does not delete user custom presets.
 */
function resetThemeDefaults() {
  try {
    const darkId = ensureBuiltinTheme(DEFAULT_DARK_THEME, true);
    ensureBuiltinTheme(DEFAULT_LIGHT_THEME, false);
    setSetting('theme_base', 'dark');
    setSetting('theme_brightness_dark', '50');
    setSetting('theme_brightness_light', '50');
    setSetting('active_theme_id', String(darkId));
    return getActiveTheme();
  } catch (err) {
    logError('resetThemeDefaults', err);
    throw err;
  }
}

const WALLPAPER_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Normalize a wallpaper hex to #rrggbb.
 * @param {string} color
 */
function normalizeWallpaperHex(color) {
  const s = String(color || '').trim();
  if (!WALLPAPER_HEX.test(s)) throw new Error('Invalid color');
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return s.toLowerCase();
}

/** Named wallpaper color presets. */
function listWallpaperColors() {
  try {
    return getDb()
      .prepare(
        'SELECT id, name, color FROM wallpaper_colors ORDER BY name COLLATE NOCASE'
      )
      .all();
  } catch (err) {
    logError('listWallpaperColors', err);
    throw err;
  }
}

/**
 * Insert (New) or overwrite a named wallpaper color, then apply it.
 * @param {{ id?: number, name?: string, color: string }} payload
 */
function saveWallpaperColor(payload) {
  try {
    const color = normalizeWallpaperHex(payload?.color);
    const id = payload && payload.id != null ? Number(payload.id) : null;
    if (id) {
      const row = getDb().prepare('SELECT * FROM wallpaper_colors WHERE id = ?').get(id);
      if (!row) throw new Error('Wallpaper preset not found');
      const name = payload?.name != null ? String(payload.name).trim().slice(0, 40) : '';
      if (name) {
        getDb()
          .prepare('UPDATE wallpaper_colors SET color = ?, name = ? WHERE id = ?')
          .run(color, name, id);
      } else {
        getDb().prepare('UPDATE wallpaper_colors SET color = ? WHERE id = ?').run(color, id);
      }
      setSetting('wallpaper_mode', 'color');
      setSetting('wallpaper_color', color);
      setSetting('wallpaper_color_id', String(id));
      return { id, name: name || row.name, color };
    }
    const name = String(payload?.name || '').trim().slice(0, 40);
    if (!name) throw new Error('Name required');
    const info = getDb()
      .prepare('INSERT INTO wallpaper_colors (name, color) VALUES (?, ?)')
      .run(name, color);
    const newId = Number(info.lastInsertRowid);
    setSetting('wallpaper_mode', 'color');
    setSetting('wallpaper_color', color);
    setSetting('wallpaper_color_id', String(newId));
    return { id: newId, name, color };
  } catch (err) {
    logError('saveWallpaperColor', err);
    throw err;
  }
}

/**
 * Restore factory wallpaper color. Named presets are left in wallpaper_colors.
 * @returns {{ wallpaper_color: string, wallpaper_color_id: string }}
 */
function resetWallpaperDefaults() {
  try {
    setSetting('wallpaper_mode', 'color');
    setSetting('wallpaper_color', '#3e5679');
    setSetting('wallpaper_color_id', '');
    return { wallpaper_color: '#3e5679', wallpaper_color_id: '' };
  } catch (err) {
    logError('resetWallpaperDefaults', err);
    throw err;
  }
}

function closeDatabase() {
  if (db) {
    try {
      // Flush WAL onto dashboard.db so USB eject is less likely to leave a dirty journal
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (err) {
      logError('closeDatabase:wal_checkpoint', err);
    }
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
  listCustomThemes,
  saveCustomTheme,
  getThemeDefaults,
  resetThemeDefaults,
  listWallpaperColors,
  saveWallpaperColor,
  resetWallpaperDefaults,
  closeDatabase,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
};
