-- Personal Dashboard schema (Lumo v2 §4 + timers stub)

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_datetime DATETIME,
    completed_at DATETIME,
    priority INTEGER, -- 1 High, 2 Medium, 3 Low
    list_locked BOOLEAN DEFAULT 0,
    archived BOOLEAN DEFAULT 0,
    archived_date DATETIME,
    locked INTEGER DEFAULT 0,
    container TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    datetime DATETIME NOT NULL,
    recurrence TEXT,
    dismissed BOOLEAN DEFAULT 0,
    snooze_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    archived BOOLEAN DEFAULT 0,
    archived_date DATETIME,
    locked INTEGER DEFAULT 0,
    container TEXT NOT NULL DEFAULT 'active',
    is_appointment INTEGER DEFAULT 0,
    description TEXT
);

CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL,
    color TEXT,
    nudge_time TEXT,
    snooze_until DATETIME,
    last_nudge_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    priority INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY,
    habit_id INTEGER NOT NULL,
    date DATE NOT NULL,
    completed BOOLEAN DEFAULT 0,
    FOREIGN KEY(habit_id) REFERENCES habits(id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    amount_mode TEXT NOT NULL DEFAULT 'fixed', -- fixed | estimate | average
    due_date DATE NOT NULL,
    recurrence TEXT,
    paid_status TEXT DEFAULT 'pending',
    category TEXT,
    snooze_until DATETIME,
    alerted_before INTEGER DEFAULT 0,
    alerted_due INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    priority INTEGER DEFAULT 3,
    description TEXT
);

-- Actual amounts paid per cycle; average keyed by bill_name
CREATE TABLE IF NOT EXISTS bill_payments (
    id INTEGER PRIMARY KEY,
    bill_id INTEGER,
    bill_name TEXT NOT NULL,
    amount REAL NOT NULL,
    due_date DATE,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_type TEXT,
    source_id INTEGER,
    occurrence_date DATE,
    hidden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Timers module stub (Phase 3); Compact UI reserves a scroll slot
CREATE TABLE IF NOT EXISTS timers (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    remaining_seconds INTEGER,
    status TEXT DEFAULT 'idle',
    priority INTEGER DEFAULT 3,
    due_datetime DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    archived BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    color TEXT,
    is_system BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_tags (
    id INTEGER PRIMARY KEY,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id)
);

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

CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- todo | bullet | md
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    parent_id INTEGER,
    content TEXT,
    style_json TEXT
);

CREATE TABLE IF NOT EXISTS list_items (
    id INTEGER PRIMARY KEY,
    list_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(list_id) REFERENCES lists(id)
);

CREATE TABLE IF NOT EXISTS wallpaper_library (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    eligible_for_random BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sound_library (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    eligible_for_random BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS themes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    theme_json TEXT NOT NULL,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_default BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
