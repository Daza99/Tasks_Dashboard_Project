/**
 * Cross-module search — provider registry, LIKE + item_tags, scoped filters.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { parseSearchQuery } = require('../../utils/search-parser.cjs');
const { getItemTagNames } = require('./tags');

const HIT_CAP = 80;

/** View id → provider ids. Compact uses ALL_PROVIDERS. */
const VIEW_PROVIDERS = {
  today: ['task', 'reminder'],
  tasks: ['task'],
  reminders: ['reminder'],
  bills: ['bill'],
  habits: ['habit'],
  calendar: ['event'],
  spending: ['transaction'],
  lists: ['list'],
  expired: ['task', 'reminder'],
  completed: ['task', 'reminder'],
  archive: ['task', 'reminder'],
};

const ALL_PROVIDERS = [
  'task',
  'reminder',
  'bill',
  'habit',
  'event',
  'transaction',
  'list',
];

/** Escape LIKE wildcards. */
function likePat(term) {
  return `%${String(term).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

function isSet(v) {
  return v != null && v !== '' && v !== 'all';
}

/** True when any dropdown is constraining results. */
function hasActiveFilters(f = {}) {
  return ['year', 'month', 'repeat', 'status', 'module', 'locked', 'priority', 'paid', 'snoozed'].some(
    (k) => isSet(f[k])
  );
}

/**
 * Resolve provider ids from layout + optional Module dropdown.
 * @param {{ compact?: boolean, view?: string }} scope
 * @param {string} [moduleFilter]
 */
function resolveProviders(scope, moduleFilter) {
  let ids = scope?.compact
    ? [...ALL_PROVIDERS]
    : VIEW_PROVIDERS[scope?.view] || [];
  if (isSet(moduleFilter)) ids = ids.filter((id) => id === moduleFilter);
  return ids;
}

/** Year/month on a datetime/date expression. No-op when both unset. */
function yearMonthSql(dateExpr, filters) {
  if (!isSet(filters.year) && !isSet(filters.month)) return { sql: '1=1', vals: [] };
  const parts = [`${dateExpr} IS NOT NULL`, `${dateExpr} NOT LIKE '9999%'`];
  const vals = [];
  if (isSet(filters.year)) {
    parts.push(`CAST(strftime('%Y', ${dateExpr}) AS INTEGER) = ?`);
    vals.push(Number(filters.year));
  }
  if (isSet(filters.month)) {
    parts.push(`CAST(strftime('%m', ${dateExpr}) AS INTEGER) = ?`);
    vals.push(Number(filters.month));
  }
  return { sql: parts.join(' AND '), vals };
}

/**
 * Text + tag match: OR-groups of AND-parts.
 * @param {{ empty: boolean, orGroups: { kind: string, value: string }[][] }} parsed
 * @param {{ alias: string, itemType: string, textCols: string[], hasTags: boolean }} spec
 */
function matchSql(parsed, spec) {
  if (parsed.empty) return { sql: '1=1', vals: [] };
  const groupSqls = [];
  const vals = [];
  for (const group of parsed.orGroups) {
    const parts = [];
    for (const part of group) {
      if (part.kind === 'tag') {
        if (!spec.hasTags) {
          parts.push('0');
        } else {
          parts.push(
            `EXISTS (
              SELECT 1 FROM item_tags it
              JOIN tags tg ON tg.id = it.tag_id
              WHERE it.item_type = ? AND it.item_id = ${spec.alias}.id AND tg.name = ?
            )`
          );
          vals.push(spec.itemType, part.value);
        }
      } else {
        const likes = spec.textCols.map((c) => `${c} LIKE ? ESCAPE '\\'`);
        parts.push(`(${likes.join(' OR ')})`);
        const pat = likePat(part.value);
        for (let i = 0; i < spec.textCols.length; i += 1) vals.push(pat);
      }
    }
    groupSqls.push(`(${parts.join(' AND ')})`);
  }
  return { sql: `(${groupSqls.join(' OR ')})`, vals };
}

function lockedSql(alias, filters) {
  if (!isSet(filters.locked)) return { sql: '1=1', vals: [] };
  if (filters.locked === 'locked') return { sql: `IFNULL(${alias}.locked, 0) = 1`, vals: [] };
  return { sql: `IFNULL(${alias}.locked, 0) = 0`, vals: [] };
}

/** container / completed / archived (+ lifecycle tags for expired). */
function containerStatusSql(alias, itemType, expiredTag, filters) {
  const s = filters.status;
  if (!isSet(s)) return { sql: '1=1', vals: [] };
  if (s === 'active') {
    return {
      sql: `${alias}.archived = 0 AND (${alias}.container IS NULL OR ${alias}.container = 'active') AND ${alias}.completed_at IS NULL`,
      vals: [],
    };
  }
  if (s === 'expired') {
    return {
      sql: `(${alias}.container = 'expired7' OR EXISTS (
        SELECT 1 FROM item_tags it JOIN tags tg ON tg.id = it.tag_id
        WHERE it.item_type = ? AND it.item_id = ${alias}.id AND tg.name = ?
      ))`,
      vals: [itemType, expiredTag],
    };
  }
  if (s === 'completed') return { sql: `${alias}.completed_at IS NOT NULL`, vals: [] };
  if (s === 'archived') {
    return { sql: `(${alias}.archived = 1 OR ${alias}.container = 'archive')`, vals: [] };
  }
  return { sql: '1=1', vals: [] };
}

function combine(...clauses) {
  const sql = clauses.map((c) => `(${c.sql})`).join(' AND ');
  const vals = clauses.flatMap((c) => c.vals);
  return { sql, vals };
}

function hit(partial) {
  return {
    type: partial.type,
    id: partial.id,
    title: partial.title || '',
    subtitle: partial.subtitle || '',
    date: partial.date || null,
    tags: partial.tags || [],
    status: partial.status || '',
    locked: Boolean(partial.locked),
    source_type: partial.source_type || null,
    source_id: partial.source_id ?? null,
  };
}

function rowStatus(row, expiredTag, tags) {
  if (row.archived || row.container === 'archive') return 'archived';
  if (row.completed_at) return 'completed';
  if (row.container === 'expired7' || (tags || []).includes(expiredTag)) return 'expired';
  return 'active';
}

function searchTasks(parsed, filters) {
  if (isSet(filters.repeat) || isSet(filters.paid) || filters.snoozed === 'snoozed') {
    return [];
  }
  const db = getDb();
  const m = matchSql(parsed, {
    alias: 't',
    itemType: 'task',
    textCols: ['t.title', 't.description'],
    hasTags: true,
  });
  const ym = yearMonthSql('COALESCE(t.due_datetime, t.created_at)', filters);
  const st = containerStatusSql('t', 'task', 'todo_expired', filters);
  const lk = lockedSql('t', filters);
  const extra = [];
  const extraVals = [];
  if (isSet(filters.priority)) {
    extra.push('t.priority = ?');
    extraVals.push(Number(filters.priority));
  }
  const where = combine(m, ym, st, lk);
  const extraSql = extra.length ? ` AND ${extra.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT t.* FROM tasks t WHERE ${where.sql}${extraSql} ORDER BY t.due_datetime DESC, t.id DESC LIMIT ?`
    )
    .all(...where.vals, ...extraVals, HIT_CAP);
  return rows.map((r) => {
    const tags = getItemTagNames('task', r.id);
    return hit({
      type: 'task',
      id: r.id,
      title: r.title,
      subtitle: [r.priority != null ? `p${r.priority}` : '', r.due_datetime ? String(r.due_datetime).slice(0, 10) : '']
        .filter(Boolean)
        .join(' · '),
      date: r.due_datetime || r.created_at,
      tags,
      status: rowStatus(r, 'todo_expired', tags),
      locked: Number(r.locked) === 1,
    });
  });
}

function searchReminders(parsed, filters) {
  if (isSet(filters.priority) || isSet(filters.paid)) return [];
  const db = getDb();
  const m = matchSql(parsed, {
    alias: 'r',
    itemType: 'reminder',
    textCols: ['r.title', 'r.description'],
    hasTags: true,
  });
  const ym = yearMonthSql('r.datetime', filters);
  const st = containerStatusSql('r', 'reminder', 'rem_ignored', filters);
  const lk = lockedSql('r', filters);
  const extra = [];
  const extraVals = [];
  if (isSet(filters.repeat)) {
    if (filters.repeat === 'once') extra.push("(r.recurrence IS NULL OR r.recurrence = '')");
    else {
      extra.push('r.recurrence = ?');
      extraVals.push(filters.repeat);
    }
  }
  if (filters.snoozed === 'snoozed') {
    extra.push(`EXISTS (
      SELECT 1 FROM item_tags it JOIN tags tg ON tg.id = it.tag_id
      WHERE it.item_type = 'reminder' AND it.item_id = r.id AND tg.name = 'rem_snoozed'
    )`);
  }
  const where = combine(m, ym, st, lk);
  const extraSql = extra.length ? ` AND ${extra.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT r.* FROM reminders r WHERE ${where.sql}${extraSql} ORDER BY r.datetime DESC, r.id DESC LIMIT ?`
    )
    .all(...where.vals, ...extraVals, HIT_CAP);
  return rows.map((r) => {
    const tags = getItemTagNames('reminder', r.id);
    const date = r.datetime && !String(r.datetime).startsWith('9999') ? r.datetime : null;
    return hit({
      type: 'reminder',
      id: r.id,
      title: r.title,
      subtitle: date ? String(date).slice(0, 16).replace('T', ' ') : 'open',
      date,
      tags,
      status: rowStatus(r, 'rem_ignored', tags),
      locked: Number(r.locked) === 1,
    });
  });
}

function searchBills(parsed, filters) {
  // No container — drop out of expired/completed/archived; Locked=locked excludes
  if (
    filters.status === 'expired' ||
    filters.status === 'completed' ||
    filters.status === 'archived' ||
    filters.locked === 'locked' ||
    filters.snoozed === 'snoozed'
  ) {
    return [];
  }
  const db = getDb();
  const m = matchSql(parsed, {
    alias: 'b',
    itemType: 'bill',
    textCols: ['b.name', 'b.category', 'b.description'],
    hasTags: false,
  });
  const ym = yearMonthSql('b.due_date', filters);
  const extra = [];
  const extraVals = [];
  if (isSet(filters.priority)) {
    extra.push('COALESCE(b.priority, 3) = ?');
    extraVals.push(Number(filters.priority));
  }
  if (isSet(filters.repeat)) {
    if (filters.repeat === 'once') extra.push("(b.recurrence IS NULL OR b.recurrence = '')");
    else {
      extra.push('b.recurrence = ?');
      extraVals.push(filters.repeat);
    }
  }
  if (isSet(filters.paid)) {
    extra.push('b.paid_status = ?');
    extraVals.push(filters.paid);
  }
  const where = combine(m, ym);
  const extraSql = extra.length ? ` AND ${extra.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT b.* FROM bills b WHERE ${where.sql}${extraSql} ORDER BY b.due_date DESC, b.id DESC LIMIT ?`
    )
    .all(...where.vals, ...extraVals, HIT_CAP);
  return rows.map((r) =>
    hit({
      type: 'bill',
      id: r.id,
      title: r.name,
      subtitle: [r.priority != null ? `p${r.priority}` : '', r.paid_status, r.recurrence || 'once', r.due_date]
        .filter(Boolean)
        .join(' · '),
      date: r.due_date,
      tags: [],
      status: r.paid_status,
      locked: false,
    })
  );
}

function searchHabits(parsed, filters) {
  if (filters.locked === 'locked' || isSet(filters.paid) || filters.snoozed === 'snoozed') {
    return [];
  }
  const db = getDb();
  const m = matchSql(parsed, {
    alias: 'h',
    itemType: 'habit',
    textCols: ['h.name', 'h.description'],
    hasTags: true,
  });
  const ym = yearMonthSql('h.created_at', filters);
  const extra = [];
  const extraVals = [];
  if (isSet(filters.priority)) {
    extra.push('COALESCE(h.priority, 3) = ?');
    extraVals.push(Number(filters.priority));
  }
  if (isSet(filters.repeat)) {
    extra.push('h.frequency = ?');
    extraVals.push(filters.repeat);
  }
  if (isSet(filters.status)) {
    if (filters.status === 'archived') {
      extra.push(`EXISTS (
        SELECT 1 FROM item_tags it JOIN tags tg ON tg.id = it.tag_id
        WHERE it.item_type = 'habit' AND it.item_id = h.id AND tg.name = 'archived'
      )`);
    } else if (filters.status === 'active') {
      extra.push(`NOT EXISTS (
        SELECT 1 FROM item_tags it JOIN tags tg ON tg.id = it.tag_id
        WHERE it.item_type = 'habit' AND it.item_id = h.id AND tg.name = 'archived'
      )`);
    } else {
      return []; // expired/completed N/A for habits
    }
  }
  const where = combine(m, ym);
  const extraSql = extra.length ? ` AND ${extra.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT h.* FROM habits h WHERE ${where.sql}${extraSql} ORDER BY h.name COLLATE NOCASE ASC LIMIT ?`
    )
    .all(...where.vals, ...extraVals, HIT_CAP);
  return rows.map((r) => {
    const tags = getItemTagNames('habit', r.id);
    return hit({
      type: 'habit',
      id: r.id,
      title: r.name,
      subtitle: [r.priority != null ? `p${r.priority}` : '', r.frequency].filter(Boolean).join(' · '),
      date: r.created_at,
      tags,
      status: tags.includes('archived') ? 'archived' : 'active',
      locked: tags.includes('locked'),
    });
  });
}

function searchEvents(parsed, filters) {
  if (
    filters.status === 'expired' ||
    filters.status === 'completed' ||
    filters.status === 'archived' ||
    filters.locked === 'locked' ||
    isSet(filters.repeat) ||
    isSet(filters.priority) ||
    isSet(filters.paid) ||
    filters.snoozed === 'snoozed'
  ) {
    return [];
  }
  const db = getDb();
  const m = matchSql(parsed, {
    alias: 'e',
    itemType: 'event',
    textCols: ['e.title', 'e.description'],
    hasTags: false,
  });
  const ym = yearMonthSql('e.start_datetime', filters);
  const where = combine(m, ym);
  const rows = db
    .prepare(
      `SELECT e.* FROM events e WHERE ${where.sql} AND COALESCE(e.hidden, 0) = 0 ORDER BY e.start_datetime DESC, e.id DESC LIMIT ?`
    )
    .all(...where.vals, HIT_CAP);
  return rows.map((r) =>
    hit({
      type: 'event',
      id: r.id,
      title: r.title,
      subtitle: r.start_datetime ? String(r.start_datetime).slice(0, 16).replace('T', ' ') : '',
      date: r.start_datetime,
      tags: [],
      status: '',
      locked: false,
      source_type: r.source_type || null,
      source_id: r.source_id != null ? Number(r.source_id) : null,
    })
  );
}

function searchTransactions(parsed, filters) {
  if (
    filters.status === 'expired' ||
    filters.status === 'completed' ||
    filters.status === 'archived' ||
    filters.locked === 'locked' ||
    isSet(filters.repeat) ||
    isSet(filters.priority) ||
    isSet(filters.paid) ||
    filters.snoozed === 'snoozed'
  ) {
    return [];
  }
  const db = getDb();
  const m = matchSql(parsed, {
    alias: 'x',
    itemType: 'transaction',
    textCols: ['x.description', 'x.category'],
    hasTags: true,
  });
  const ym = yearMonthSql('x.date', filters);
  const where = combine(m, ym);
  const rows = db
    .prepare(
      `SELECT x.* FROM transactions x WHERE ${where.sql} ORDER BY x.date DESC, x.id DESC LIMIT ?`
    )
    .all(...where.vals, HIT_CAP);
  return rows.map((r) =>
    hit({
      type: 'transaction',
      id: r.id,
      title: r.description || r.category,
      subtitle: [r.category, r.amount != null ? String(r.amount) : '', r.date].filter(Boolean).join(' · '),
      date: r.date,
      tags: getItemTagNames('transaction', r.id),
      status: '',
      locked: false,
    })
  );
}

function searchLists(parsed, filters) {
  if (
    filters.status === 'expired' ||
    filters.status === 'completed' ||
    filters.status === 'archived' ||
    filters.locked === 'locked' ||
    isSet(filters.repeat) ||
    isSet(filters.priority) ||
    isSet(filters.paid) ||
    filters.snoozed === 'snoozed'
  ) {
    return [];
  }
  const db = getDb();
  const ym = yearMonthSql('l.created_date', filters);
  let textSql = '1=1';
  const textVals = [];
  if (!parsed.empty) {
    // List name OR a linked task/reminder title — same OR/AND structure, no tags
    const groupSqls = [];
    for (const group of parsed.orGroups) {
      const parts = [];
      for (const part of group) {
        if (part.kind === 'tag') {
          parts.push('0');
        } else {
          const pat = likePat(part.value);
          parts.push(
            `(l.name LIKE ? ESCAPE '\\' OR EXISTS (
              SELECT 1 FROM list_items li
              LEFT JOIN tasks t ON li.item_type = 'task' AND t.id = li.item_id
              LEFT JOIN reminders r ON li.item_type = 'reminder' AND r.id = li.item_id
              WHERE li.list_id = l.id AND (t.title LIKE ? ESCAPE '\\' OR r.title LIKE ? ESCAPE '\\')
            ))`
          );
          textVals.push(pat, pat, pat);
        }
      }
      groupSqls.push(`(${parts.join(' AND ')})`);
    }
    textSql = `(${groupSqls.join(' OR ')})`;
  }
  const where = combine({ sql: textSql, vals: textVals }, ym);
  const rows = db
    .prepare(
      `SELECT l.*, (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) AS item_count
       FROM lists l WHERE ${where.sql} ORDER BY l.created_date DESC, l.id DESC LIMIT ?`
    )
    .all(...where.vals, HIT_CAP);
  return rows.map((r) =>
    hit({
      type: 'list',
      id: r.id,
      title: r.name,
      subtitle: `${r.type} · ${r.item_count} items`,
      date: r.created_date,
      tags: [],
      status: '',
      locked: false,
    })
  );
}

const PROVIDERS = {
  task: searchTasks,
  reminder: searchReminders,
  bill: searchBills,
  habit: searchHabits,
  event: searchEvents,
  transaction: searchTransactions,
  list: searchLists,
};

const YEAR_SOURCES = [
  { table: 'tasks', expr: 'COALESCE(due_datetime, created_at)' },
  { table: 'reminders', expr: 'datetime' },
  { table: 'bills', expr: 'due_date' },
  { table: 'habits', expr: 'created_at' },
  { table: 'events', expr: 'start_datetime' },
  { table: 'transactions', expr: 'date' },
  { table: 'lists', expr: 'created_date' },
];

const PROVIDER_YEAR_TABLE = {
  task: YEAR_SOURCES[0],
  reminder: YEAR_SOURCES[1],
  bill: YEAR_SOURCES[2],
  habit: YEAR_SOURCES[3],
  event: YEAR_SOURCES[4],
  transaction: YEAR_SOURCES[5],
  list: YEAR_SOURCES[6],
};

/** Distinct years from scoped tables (drops 9999 open-sentinel). */
function collectYears(providerIds) {
  const db = getDb();
  const years = new Set();
  for (const id of providerIds) {
    const src = PROVIDER_YEAR_TABLE[id];
    if (!src) continue;
    const rows = db
      .prepare(
        `SELECT DISTINCT CAST(strftime('%Y', ${src.expr}) AS INTEGER) AS y
         FROM ${src.table}
         WHERE ${src.expr} IS NOT NULL AND ${src.expr} NOT LIKE '9999%'`
      )
      .all();
    for (const r of rows) {
      if (r.y > 1970 && r.y < 2100) years.add(r.y);
    }
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Run a scoped search.
 * @param {{ query?: string, scope?: { compact?: boolean, view?: string }, filters?: object }} opts
 */
function runSearch(opts = {}) {
  try {
    const filters = opts.filters || {};
    const parsed = parseSearchQuery(opts.query);
    const ids = resolveProviders(opts.scope, filters.module);
    if (parsed.empty && !hasActiveFilters(filters)) {
      return { hits: [], years: collectYears(ids) };
    }
    const hits = [];
    for (const id of ids) {
      const fn = PROVIDERS[id];
      if (fn) hits.push(...fn(parsed, filters));
    }
    hits.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return { hits: hits.slice(0, HIT_CAP), years: collectYears(ids) };
  } catch (err) {
    logError('runSearch', err);
    throw err;
  }
}

/**
 * Year options for the current scope (popover open, before typing).
 * @param {{ compact?: boolean, view?: string }} scope
 */
function searchFilterOptions(scope = {}) {
  try {
    return { years: collectYears(resolveProviders(scope)) };
  } catch (err) {
    logError('searchFilterOptions', err);
    throw err;
  }
}

module.exports = {
  runSearch,
  searchFilterOptions,
  resolveProviders,
  ALL_PROVIDERS,
};
