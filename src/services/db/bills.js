/**
 * Bills CRUD, paid/overdue, recurrence advance, alert queries.
 * amount_mode: fixed | estimate | average; payments logged for name-based averages.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { dateKey } = require('./habits');
const { clampPriority, DEFAULT_PRIORITY } = require('../../utils/priority.cjs');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

const STATUSES = ['pending', 'paid', 'overdue'];
const AMOUNT_MODES = ['fixed', 'estimate', 'average'];
/** Min payment history rows (by name) before Calc Average unlocks. */
const AVG_MIN_SAMPLES = 6;

/** Add months to YYYY-MM-DD (clamps day). */
function addMonthsIso(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return dateKey(dt);
}

function advanceDue(dueDate, recurrence) {
  if (recurrence === 'monthly') return addMonthsIso(dueDate, 1);
  if (recurrence === 'quarterly') return addMonthsIso(dueDate, 3);
  if (recurrence === 'yearly') return addMonthsIso(dueDate, 12);
  return null;
}

function normalizeAmountMode(mode) {
  return AMOUNT_MODES.includes(mode) ? mode : 'fixed';
}

function enrich(row) {
  if (!row) return null;
  return {
    ...row,
    title: row.name,
    amount_mode: normalizeAmountMode(row.amount_mode),
  };
}

/** Create bill. */
function createBill({
  name,
  amount,
  due_date,
  recurrence = null,
  category = null,
  amount_mode = 'fixed',
  priority = DEFAULT_PRIORITY,
  description = null,
}) {
  try {
    const billName = uniqueTitleFor('bill', name);
    const amt = Number(amount);
    if (!Number.isFinite(amt)) throw new Error('Amount required');
    if (!due_date) throw new Error('due_date required (YYYY-MM-DD)');
    const rec = recurrence || null;
    if (rec && !['monthly', 'quarterly', 'yearly'].includes(rec)) {
      throw new Error('recurrence must be monthly, quarterly, yearly, or null');
    }
    const mode = normalizeAmountMode(amount_mode);
    const prio = clampPriority(priority);
    const details = description != null ? String(description).trim() || null : null;
    const info = getDb()
      .prepare(
        `INSERT INTO bills (name, amount, amount_mode, due_date, recurrence, paid_status, category, priority, description)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .run(billName, amt, mode, due_date, rec, category || null, prio, details);
    const row = getBill(Number(info.lastInsertRowid));
    require('./calendar-sync').syncBill(row);
    return row;
  } catch (err) {
    logError('createBill', err);
    throw err;
  }
}

function getBill(id) {
  const row = getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
  return enrich(row);
}

function listBills({ includePaid = true } = {}) {
  try {
    const rows = getDb()
      .prepare(
        `SELECT * FROM bills
         ${includePaid ? '' : "WHERE paid_status != 'paid'"}
         ORDER BY COALESCE(priority, 3) ASC, due_date ASC, name COLLATE NOCASE ASC`
      )
      .all();
    return rows.map(enrich);
  } catch (err) {
    logError('listBills', err);
    throw err;
  }
}

function updateBill(id, fields) {
  try {
    const cur = getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!cur) throw new Error('Bill not found');
    const name =
      fields.name !== undefined
        ? uniqueTitleFor('bill', fields.name, id)
        : cur.name;
    const amount =
      fields.amount !== undefined ? Number(fields.amount) : cur.amount;
    if (!Number.isFinite(amount)) throw new Error('Invalid amount');
    const due_date = fields.due_date !== undefined ? fields.due_date : cur.due_date;
    const recurrence =
      fields.recurrence !== undefined ? fields.recurrence || null : cur.recurrence;
    const category =
      fields.category !== undefined ? fields.category : cur.category;
    const amount_mode =
      fields.amount_mode !== undefined
        ? normalizeAmountMode(fields.amount_mode)
        : normalizeAmountMode(cur.amount_mode);
    let paid_status =
      fields.paid_status !== undefined ? fields.paid_status : cur.paid_status;
    if (!STATUSES.includes(paid_status)) paid_status = cur.paid_status;
    const priority =
      fields.priority !== undefined
        ? clampPriority(fields.priority)
        : clampPriority(cur.priority);
    const description =
      fields.description !== undefined
        ? String(fields.description || '').trim() || null
        : cur.description;

    const dueChanged = fields.due_date !== undefined && fields.due_date !== cur.due_date;
    const db = getDb();
    db.prepare(
      `UPDATE bills SET name = ?, amount = ?, amount_mode = ?, due_date = ?, recurrence = ?,
       category = ?, paid_status = ?, priority = ?, description = ?
       ${dueChanged ? ', alerted_before = 0, alerted_due = 0, snooze_until = NULL' : ''}
       WHERE id = ?`
    ).run(
      name,
      amount,
      amount_mode,
      due_date,
      recurrence,
      category,
      paid_status,
      priority,
      description,
      id
    );

    // Keep denormalized payment names in sync for name-based averages
    if (name !== cur.name) {
      db.prepare('UPDATE bill_payments SET bill_name = ? WHERE bill_id = ?').run(
        name,
        id
      );
    }
    const row = getBill(id);
    require('./calendar-sync').syncBill(row, {
      prevDueDate: dueChanged ? cur.due_date : undefined,
    });
    return row;
  } catch (err) {
    logError('updateBill', err);
    throw err;
  }
}

/**
 * Mark paid. Logs actual to bill_payments, then advances recurring due_date.
 * @param {number} id
 * @param {{ actual_amount?: number }} [opts] — defaults to standing bill.amount
 */
function markPaid(id, opts = {}) {
  try {
    const cur = getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!cur) throw new Error('Bill not found');
    let actual =
      opts.actual_amount !== undefined ? Number(opts.actual_amount) : cur.amount;
    if (!Number.isFinite(actual)) actual = cur.amount;

    const db = getDb();
    const tx = db.transaction(() => {
      // Exact dup = same bill name + amount + due_date (fortnightly differs by due_date)
      const exactDup = db
        .prepare(
          `SELECT id FROM bill_payments
           WHERE lower(trim(bill_name)) = lower(trim(?))
             AND amount = ?
             AND due_date = ?
           LIMIT 1`
        )
        .get(cur.name, actual, cur.due_date);

      if (!exactDup) {
        db.prepare(
          `INSERT INTO bill_payments (bill_id, bill_name, amount, due_date)
           VALUES (?, ?, ?, ?)`
        ).run(id, cur.name, actual, cur.due_date);
      }

      const next = advanceDue(cur.due_date, cur.recurrence);
      if (next) {
        db.prepare(
          `UPDATE bills SET paid_status = 'pending', due_date = ?,
           alerted_before = 0, alerted_due = 0, snooze_until = NULL
           WHERE id = ?`
        ).run(next, id);
      } else {
        db.prepare(
          `UPDATE bills SET paid_status = 'paid',
           alerted_before = 1, alerted_due = 1, snooze_until = NULL
           WHERE id = ?`
        ).run(id);
      }
    });
    tx();
    const row = getBill(id);
    // Leave the paid occurrence; upsert the new due_date
    require('./calendar-sync').syncBill(row);
    return row;
  } catch (err) {
    logError('markPaid', err);
    throw err;
  }
}

/**
 * Payment count + average for a bill name (case-insensitive trim).
 * @param {string} name
 * @returns {{ count: number, average: number|null, canAverage: boolean }}
 */
function getBillAmountStats(name) {
  try {
    const key = String(name || '')
      .trim()
      .toLowerCase();
    if (!key) return { count: 0, average: null, canAverage: false };
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS count, AVG(amount) AS average
         FROM bill_payments
         WHERE lower(trim(bill_name)) = ?`
      )
      .get(key);
    const count = Number(row?.count) || 0;
    const average = count > 0 ? Number(row.average) : null;
    return {
      count,
      average: Number.isFinite(average) ? average : null,
      canAverage: count >= AVG_MIN_SAMPLES,
    };
  } catch (err) {
    logError('getBillAmountStats', err);
    throw err;
  }
}

const PAYMENT_SORTS = {
  dateAsc: 'paid_at ASC',
  dateDesc: 'paid_at DESC',
  amountHigh: 'amount DESC',
  amountLow: 'amount ASC',
};

/**
 * Paid history from bill_payments (recurring pays live here, not paid_status).
 * @param {{ year: number, month?: string|number, billName?: string, sort?: string }} opts
 *   month: 'ALL' or 1–12; billName: 'ALL' or exact display name; sort: dateAsc|dateDesc|amountHigh|amountLow
 */
function listBillPayments(opts = {}) {
  try {
    const year = Number(opts.year);
    if (!Number.isFinite(year)) throw new Error('year required');
    const monthRaw = opts.month;
    const month =
      monthRaw === undefined || monthRaw === null || monthRaw === '' || monthRaw === 'ALL'
        ? null
        : Number(monthRaw);
    const billName = opts.billName;
    const nameKey =
      !billName || billName === 'ALL'
        ? null
        : String(billName).trim().toLowerCase();
    const orderBy = PAYMENT_SORTS[opts.sort] || PAYMENT_SORTS.dateDesc;

    const where = [`strftime('%Y', paid_at) = ?`];
    const params = [String(year)];
    if (month != null && Number.isFinite(month) && month >= 1 && month <= 12) {
      where.push(`strftime('%m', paid_at) = ?`);
      params.push(String(month).padStart(2, '0'));
    }
    if (nameKey) {
      where.push(`lower(trim(bill_name)) = ?`);
      params.push(nameKey);
    }

    return getDb()
      .prepare(
        `SELECT id, bill_id, bill_name, amount, due_date, paid_at
         FROM bill_payments
         WHERE ${where.join(' AND ')}
         ORDER BY ${orderBy}`
      )
      .all(...params);
  } catch (err) {
    logError('listBillPayments', err);
    throw err;
  }
}

/**
 * Distinct years + bill names for history filter dropdowns.
 * Always includes the current calendar year.
 * @returns {{ years: number[], names: string[] }}
 */
function listBillPaymentFilterOptions() {
  try {
    const db = getDb();
    const yearRows = db
      .prepare(
        `SELECT DISTINCT CAST(strftime('%Y', paid_at) AS INTEGER) AS y
         FROM bill_payments
         WHERE paid_at IS NOT NULL
         ORDER BY y DESC`
      )
      .all();
    const years = yearRows.map((r) => Number(r.y)).filter(Number.isFinite);
    const currentYear = new Date().getFullYear();
    if (!years.includes(currentYear)) years.unshift(currentYear);

    const nameRows = db
      .prepare(
        `SELECT bill_name FROM bill_payments
         GROUP BY lower(trim(bill_name))
         ORDER BY lower(trim(bill_name)) COLLATE NOCASE`
      )
      .all();
    const names = nameRows.map((r) => r.bill_name).filter(Boolean);

    return { years, names };
  } catch (err) {
    logError('listBillPaymentFilterOptions', err);
    throw err;
  }
}

function deleteBill(id) {
  try {
    require('./calendar-sync').deleteEventsForSource('bill', id);
    getDb().prepare('DELETE FROM bills WHERE id = ?').run(id);
    return true;
  } catch (err) {
    logError('deleteBill', err);
    throw err;
  }
}

/** Delete one payment history row (user correction in History). */
function deleteBillPayment(id) {
  try {
    const info = getDb().prepare('DELETE FROM bill_payments WHERE id = ?').run(id);
    return info.changes > 0;
  } catch (err) {
    logError('deleteBillPayment', err);
    throw err;
  }
}

/** Flip pending → overdue when past due. Returns {id, name}[]. */
function markOverdueBills() {
  try {
    const today = dateKey();
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, name FROM bills
         WHERE paid_status = 'pending' AND due_date < ?`
      )
      .all(today);
    if (rows.length) {
      db.prepare(
        `UPDATE bills SET paid_status = 'overdue'
         WHERE paid_status = 'pending' AND due_date < ?`
      ).run(today);
    }
    return rows;
  } catch (err) {
    logError('markOverdueBills', err);
    throw err;
  }
}

/** Bills due today or overdue (brief). */
function listBillsForBrief() {
  try {
    const today = dateKey();
    const dueToday = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status IN ('pending', 'overdue') AND due_date = ?
         ORDER BY name COLLATE NOCASE`
      )
      .all(today)
      .map(enrich);
    const overdue = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status = 'overdue' AND due_date < ?
         ORDER BY due_date ASC`
      )
      .all(today)
      .map(enrich);
    return { billsDueToday: dueToday, billsOverdue: overdue };
  } catch (err) {
    logError('listBillsForBrief', err);
    throw err;
  }
}

/**
 * Pending/overdue bills needing day-before or day-of popup.
 * @returns {{ id, name, title, amount, due_date, alertKind: 'before'|'due' }[]}
 */
function listDueBillAlerts() {
  try {
    const today = dateKey();
    const tomorrow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return dateKey(d);
    })();
    const rows = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status IN ('pending', 'overdue')
           AND (snooze_until IS NULL OR datetime(snooze_until) <= datetime('now'))`
      )
      .all();
    const out = [];
    for (const b of rows) {
      if (b.due_date === today && !b.alerted_due) {
        out.push({ ...enrich(b), alertKind: 'due' });
      } else if (b.due_date === tomorrow && !b.alerted_before) {
        out.push({ ...enrich(b), alertKind: 'before' });
      }
    }
    return out;
  } catch (err) {
    logError('listDueBillAlerts', err);
    throw err;
  }
}

function markBillAlerted(id, alertKind) {
  if (alertKind === 'before') {
    getDb().prepare('UPDATE bills SET alerted_before = 1 WHERE id = ?').run(id);
  } else {
    getDb().prepare('UPDATE bills SET alerted_due = 1 WHERE id = ?').run(id);
  }
}

function snoozeBill(id, minutes = 10) {
  try {
    const until = new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString();
    // Clear alerted flags so poll can re-fire after snooze_until
    getDb()
      .prepare(
        `UPDATE bills SET snooze_until = ?, alerted_before = 0, alerted_due = 0
         WHERE id = ?`
      )
      .run(until, id);
    return getBill(id);
  } catch (err) {
    logError('snoozeBill', err);
    throw err;
  }
}

/** X on popup — treat as dismiss for this alert wave (mark both if due today). */
function dismissBillAlert(id) {
  try {
    const b = getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!b) return null;
    const today = dateKey();
    if (b.due_date === today) {
      getDb()
        .prepare('UPDATE bills SET alerted_due = 1, snooze_until = NULL WHERE id = ?')
        .run(id);
    } else {
      getDb()
        .prepare(
          'UPDATE bills SET alerted_before = 1, snooze_until = NULL WHERE id = ?'
        )
        .run(id);
    }
    return getBill(id);
  } catch (err) {
    logError('dismissBillAlert', err);
    throw err;
  }
}

module.exports = {
  createBill,
  getBill,
  listBills,
  updateBill,
  markPaid,
  getBillAmountStats,
  listBillPayments,
  listBillPaymentFilterOptions,
  deleteBill,
  deleteBillPayment,
  markOverdueBills,
  listBillsForBrief,
  listDueBillAlerts,
  markBillAlerted,
  snoozeBill,
  dismissBillAlert,
  advanceDue,
  STATUSES,
  AMOUNT_MODES,
  AVG_MIN_SAMPLES,
};
