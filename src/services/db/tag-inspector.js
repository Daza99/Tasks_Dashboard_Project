/**
 * Tag Inspector — lifecycle transitions, orphan/dup repair, persist last 50 runs.
 * Does not fire popups; poller owns rem_snoozed re-fire.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { expireStaleTodo24 } = require('./tasks');
const { expireGraceReminders, listDueSnoozed } = require('./reminders');
const { sweepContainers } = require('./containers');
const { markOverdueBills } = require('./bills');

const MAX_RUNS = 50;
const TAGGED_TYPES = ['task', 'reminder', 'habit', 'transaction', 'tracker', 'list'];
const PARENT_TABLE = {
  task: 'tasks',
  reminder: 'reminders',
  habit: 'habits',
  transaction: 'transactions',
  tracker: 'trackers',
  list: 'lists',
};

/**
 * Run all inspector checks.
 * @param {'launch'|'manual'|'scheduler'} trigger
 */
function inspectTags(trigger = 'scheduler') {
  try {
    const ran_at = new Date().toISOString();
    const changes = [];
    const anomalies = [];

    const expiredRows = expireStaleTodo24();
    for (const row of expiredRows) {
      changes.push({
        item_type: 'task',
        item_id: row.id,
        title: row.title,
        from: 'todo_24',
        to: 'todo_expired',
        note: `${row.title} — past due`,
      });
    }

    const ignoredRows = expireGraceReminders();
    for (const row of ignoredRows) {
      changes.push({
        item_type: 'reminder',
        item_id: row.id,
        title: row.title,
        from: 'rem_grace',
        to: 'rem_ignored',
        note: `${row.title} — grace expired`,
      });
    }

    const sweep = sweepContainers();
    for (const row of sweep.movedTasks || []) {
      changes.push({
        item_type: 'task',
        item_id: row.id,
        title: row.title,
        from: 'active',
        to: 'expired7',
        note: `${row.title} — retention move`,
      });
    }
    for (const row of sweep.movedReminders || []) {
      changes.push({
        item_type: 'reminder',
        item_id: row.id,
        title: row.title,
        from: 'active',
        to: 'expired7',
        note: `${row.title} — retention move`,
      });
    }

    const overdueBills = markOverdueBills();
    for (const row of overdueBills) {
      changes.push({
        item_type: 'bill',
        item_id: row.id,
        title: row.name,
        from: 'pending',
        to: 'overdue',
        note: `${row.name} — bill overdue`,
      });
    }

    // Leftover after poller; do not retag rem_ignored (would skip popup)
    const snoozedOverdue = listDueSnoozed();
    for (const rem of snoozedOverdue) {
      anomalies.push({
        kind: 'snoozed_overdue',
        detail: `${rem.title} (#${rem.id}) still rem_snoozed past snooze_until`,
      });
    }

    const orphans = repairOrphans();
    for (const row of orphans.removed) {
      changes.push({
        item_type: row.item_type,
        item_id: row.item_id,
        title: null,
        from: row.tag_name,
        to: null,
        note: `orphan item_tags removed (${row.item_type}#${row.item_id})`,
      });
    }

    const dups = repairDuplicates();
    for (const row of dups.removed) {
      changes.push({
        item_type: row.item_type,
        item_id: row.item_id,
        title: null,
        from: row.tag_name,
        to: null,
        note: `duplicate item_tags removed (${row.item_type}#${row.item_id})`,
      });
    }

    const counts = {
      expired: expiredRows.length,
      ignored: ignoredRows.length,
      moved: sweep.moved || 0,
      orphansRemoved: orphans.removed.length,
      dupsRemoved: dups.removed.length,
      snoozedOverdue: snoozedOverdue.length,
      overdue: overdueBills.length,
      deletedExpired7: sweep.deletedExpired7 || 0,
      deletedArchive: sweep.deletedArchive || 0,
    };

    const mutated =
      changes.length > 0 ||
      counts.deletedExpired7 > 0 ||
      counts.deletedArchive > 0;

    const persist =
      trigger === 'manual' || trigger === 'launch' || mutated;
    if (persist) {
      persistRun({ trigger, ran_at, changes, anomalies, counts });
    }

    return { trigger, ran_at, changes, anomalies, counts };
  } catch (err) {
    logError('inspectTags', err);
    throw err;
  }
}

/** Delete item_tags whose parent row is gone, or unknown item_type. */
function repairOrphans() {
  const db = getDb();
  const removed = [];
  const del = db.prepare('DELETE FROM item_tags WHERE id = ?');
  const selectUnknown = db.prepare(
    `SELECT it.id, it.item_type, it.item_id, t.name AS tag_name
     FROM item_tags it
     LEFT JOIN tags t ON t.id = it.tag_id
     WHERE it.item_type NOT IN (${TAGGED_TYPES.map(() => '?').join(', ')})`
  );

  const tx = db.transaction(() => {
    for (const row of selectUnknown.all(...TAGGED_TYPES)) {
      del.run(row.id);
      removed.push(row);
    }
    for (const type of TAGGED_TYPES) {
      const table = PARENT_TABLE[type];
      const rows = db
        .prepare(
          `SELECT it.id, it.item_type, it.item_id, t.name AS tag_name
           FROM item_tags it
           LEFT JOIN tags t ON t.id = it.tag_id
           WHERE it.item_type = ?
             AND it.item_id NOT IN (SELECT id FROM ${table})`
        )
        .all(type);
      for (const row of rows) {
        del.run(row.id);
        removed.push(row);
      }
    }
  });
  tx();
  return { removed };
}

/** Drop extra item_tags rows sharing the same (item_type, item_id, tag_id). Keep min id. */
function repairDuplicates() {
  const db = getDb();
  const extras = db
    .prepare(
      `SELECT it.id, it.item_type, it.item_id, t.name AS tag_name
       FROM item_tags it
       LEFT JOIN tags t ON t.id = it.tag_id
       WHERE it.id NOT IN (
         SELECT MIN(id) FROM item_tags GROUP BY item_type, item_id, tag_id
       )`
    )
    .all();
  if (!extras.length) return { removed: [] };
  const del = db.prepare('DELETE FROM item_tags WHERE id = ?');
  const tx = db.transaction(() => {
    for (const row of extras) del.run(row.id);
  });
  tx();
  return { removed: extras };
}

function persistRun({ trigger, ran_at, changes, anomalies, counts }) {
  const db = getDb();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO tag_audit_runs (ran_at, trigger, summary_json)
         VALUES (?, ?, ?)`
      )
      .run(ran_at, trigger, JSON.stringify({ counts, anomalies }));
    const runId = Number(info.lastInsertRowid);
    const insert = db.prepare(
      `INSERT INTO tag_audit_events
         (run_id, item_type, item_id, from_tag, to_tag, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const ch of changes) {
      insert.run(
        runId,
        ch.item_type || null,
        ch.item_id ?? null,
        ch.from || null,
        ch.to || null,
        ch.note || null
      );
    }

    const ids = db
      .prepare('SELECT id FROM tag_audit_runs ORDER BY id DESC')
      .all();
    if (ids.length > MAX_RUNS) {
      const drop = db.prepare('DELETE FROM tag_audit_runs WHERE id = ?');
      for (const row of ids.slice(MAX_RUNS)) drop.run(row.id);
    }
  });
  tx();
}

/**
 * Recent inspector runs with events (newest first).
 * @param {{ limit?: number }} [opts]
 */
function listInspectLog({ limit = 20 } = {}) {
  try {
    const db = getDb();
    const cap = Math.min(50, Math.max(1, Number(limit) || 20));
    const runs = db
      .prepare(
        `SELECT id, ran_at, trigger, summary_json
         FROM tag_audit_runs ORDER BY id DESC LIMIT ?`
      )
      .all(cap);
    const eventsStmt = db.prepare(
      `SELECT item_type, item_id, from_tag, to_tag, note
       FROM tag_audit_events WHERE run_id = ? ORDER BY id ASC`
    );
    return runs.map((r) => {
      let summary = { counts: {}, anomalies: [] };
      try {
        summary = JSON.parse(r.summary_json) || summary;
      } catch {
        /* keep empty */
      }
      const events = eventsStmt.all(r.id).map((e) => ({
        item_type: e.item_type,
        item_id: e.item_id,
        from: e.from_tag,
        to: e.to_tag,
        note: e.note,
      }));
      return {
        id: r.id,
        ran_at: r.ran_at,
        trigger: r.trigger,
        counts: summary.counts || {},
        anomalies: summary.anomalies || [],
        changes: events,
      };
    });
  } catch (err) {
    logError('listInspectLog', err);
    throw err;
  }
}

module.exports = {
  inspectTags,
  listInspectLog,
};
