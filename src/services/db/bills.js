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
const RECURRENCES = ['monthly', 'fortnight', 'quarterly', 'yearly'];
/** Min payment history rows (by name) before Calc Average unlocks. */
const AVG_MIN_SAMPLES = 6;

/** Add months to YYYY-MM-DD (clamps day). */
function addMonthsIso(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return dateKey(dt);
}

/** Add days to YYYY-MM-DD. */
function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateKey(dt);
}

/** Local due date at 09:00 → ISO (matches calendar dateAtNine). */
function dueAtNine(dueDate) {
  const [y, m, d] = String(dueDate).split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0).toISOString();
}

function advanceDue(dueDate, recurrence) {
  if (recurrence === 'monthly') return addMonthsIso(dueDate, 1);
  if (recurrence === 'fortnight') return addDaysIso(dueDate, 14);
  if (recurrence === 'quarterly') return addMonthsIso(dueDate, 3);
  if (recurrence === 'yearly') return addMonthsIso(dueDate, 12);
  return null;
}

function normalizeAmountMode(mode) {
  return AMOUNT_MODES.includes(mode) ? mode : 'fixed';
}

/**
 * Resolve nudge columns from create/update payload + due date.
 * Off → all null. day_before = due 09:00 minus 1 calendar day.
 */
function resolveNudgeFields(dueDate, { nudge, nudge_mode, nudge_datetime } = {}) {
  if (!nudge) {
    return { nudge_datetime: null, nudge_mode: null, nudge_alerted: 0 };
  }
  const mode = nudge_mode === 'custom' ? 'custom' : 'day_before';
  if (mode === 'custom') {
    if (!nudge_datetime) throw new Error('nudge_datetime required for custom nudge');
    const at = new Date(nudge_datetime);
    if (Number.isNaN(at.getTime())) throw new Error('Invalid nudge_datetime');
    return {
      nudge_datetime: at.toISOString(),
      nudge_mode: 'custom',
      nudge_alerted: 0,
    };
  }
  if (!dueDate) {
    return { nudge_datetime: null, nudge_mode: null, nudge_alerted: 0 };
  }
  const due = new Date(dueAtNine(dueDate));
  due.setDate(due.getDate() - 1);
  return {
    nudge_datetime: due.toISOString(),
    nudge_mode: 'day_before',
    nudge_alerted: 0,
  };
}

/** Shift custom nudge by the same day delta as a due-date advance. */
function shiftNudgeWithDue(nudgeIso, fromDue, toDue) {
  if (!nudgeIso || !fromDue || !toDue) return nudgeIso;
  const [fy, fm, fd] = String(fromDue).split('-').map(Number);
  const [ty, tm, td] = String(toDue).split('-').map(Number);
  const deltaMs =
    new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime();
  const at = new Date(nudgeIso);
  if (Number.isNaN(at.getTime())) return nudgeIso;
  return new Date(at.getTime() + deltaMs).toISOString();
}

function enrich(row) {
  if (!row) return null;
  return {
    ...row,
    title: row.name,
    amount_mode: normalizeAmountMode(row.amount_mode),
    show_on_calendar: Number(row.show_on_calendar) !== 0 ? 1 : 0,
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
  show_on_calendar = 1,
  nudge = false,
  nudge_mode = null,
  nudge_datetime = null,
}) {
  try {
    const billName = uniqueTitleFor('bill', name);
    const amt = Number(amount);
    if (!Number.isFinite(amt)) throw new Error('Amount required');
    if (!due_date) throw new Error('due_date required (YYYY-MM-DD)');
    const rec = recurrence || null;
    if (rec && !RECURRENCES.includes(rec)) {
      throw new Error('recurrence must be monthly, fortnight, quarterly, yearly, or null');
    }
    const mode = normalizeAmountMode(amount_mode);
    const prio = clampPriority(priority);
    const details = description != null ? String(description).trim() || null : null;
    const onCal = show_on_calendar ? 1 : 0;
    const cat = category != null ? String(category).trim() || null : null;
    if (cat) createBillCategory(cat);
    const nudgeFields = resolveNudgeFields(due_date, {
      nudge,
      nudge_mode,
      nudge_datetime,
    });
    const info = getDb()
      .prepare(
        `INSERT INTO bills (name, amount, amount_mode, due_date, recurrence, paid_status, category,
           priority, description, show_on_calendar, nudge_datetime, nudge_mode, nudge_alerted)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        billName,
        amt,
        mode,
        due_date,
        rec,
        cat,
        prio,
        details,
        onCal,
        nudgeFields.nudge_datetime,
        nudgeFields.nudge_mode,
        nudgeFields.nudge_alerted
      );
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
    let recurrence =
      fields.recurrence !== undefined ? fields.recurrence || null : cur.recurrence;
    if (recurrence && !RECURRENCES.includes(recurrence)) {
      throw new Error('recurrence must be monthly, fortnight, quarterly, yearly, or null');
    }
    const category =
      fields.category !== undefined
        ? String(fields.category || '').trim() || null
        : cur.category;
    if (fields.category !== undefined && category) createBillCategory(category);
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
    const show_on_calendar =
      fields.show_on_calendar !== undefined
        ? fields.show_on_calendar
          ? 1
          : 0
        : Number(cur.show_on_calendar) !== 0
          ? 1
          : 0;

    const dueChanged = fields.due_date !== undefined && fields.due_date !== cur.due_date;
    const nudgeTouched =
      fields.nudge !== undefined ||
      fields.nudge_mode !== undefined ||
      fields.nudge_datetime !== undefined ||
      (dueChanged && cur.nudge_mode === 'day_before');

    let nudge_datetime = cur.nudge_datetime;
    let nudge_mode = cur.nudge_mode;
    let nudge_alerted = cur.nudge_alerted;
    if (nudgeTouched) {
      const nudgeOn =
        fields.nudge !== undefined
          ? Boolean(fields.nudge)
          : Boolean(cur.nudge_datetime);
      const mode =
        fields.nudge_mode !== undefined ? fields.nudge_mode : cur.nudge_mode;
      const customAt =
        fields.nudge_datetime !== undefined
          ? fields.nudge_datetime
          : cur.nudge_datetime;
      const resolved = resolveNudgeFields(due_date, {
        nudge: nudgeOn,
        nudge_mode: mode,
        nudge_datetime: customAt,
      });
      nudge_datetime = resolved.nudge_datetime;
      nudge_mode = resolved.nudge_mode;
      nudge_alerted = resolved.nudge_alerted;
    }

    const db = getDb();
    db.prepare(
      `UPDATE bills SET name = ?, amount = ?, amount_mode = ?, due_date = ?, recurrence = ?,
       category = ?, paid_status = ?, priority = ?, description = ?,
       show_on_calendar = ?, nudge_datetime = ?, nudge_mode = ?, nudge_alerted = ?
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
      show_on_calendar,
      nudge_datetime,
      nudge_mode,
      nudge_alerted,
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
        let nextNudge = cur.nudge_datetime;
        let nextNudgeMode = cur.nudge_mode;
        let nextNudgeAlerted = 0;
        if (cur.nudge_mode === 'day_before' && cur.nudge_datetime) {
          const resolved = resolveNudgeFields(next, {
            nudge: true,
            nudge_mode: 'day_before',
          });
          nextNudge = resolved.nudge_datetime;
          nextNudgeMode = resolved.nudge_mode;
        } else if (cur.nudge_mode === 'custom' && cur.nudge_datetime) {
          nextNudge = shiftNudgeWithDue(cur.nudge_datetime, cur.due_date, next);
        } else {
          nextNudge = null;
          nextNudgeMode = null;
          nextNudgeAlerted = 0;
        }
        db.prepare(
          `UPDATE bills SET paid_status = 'pending', due_date = ?,
           alerted_before = 0, alerted_due = 0, snooze_until = NULL,
           nudge_datetime = ?, nudge_mode = ?, nudge_alerted = ?
           WHERE id = ?`
        ).run(next, nextNudge, nextNudgeMode, nextNudgeAlerted, id);
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

function uniqPositiveIds(ids) {
  return [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
}

/**
 * Bulk-delete bills and their calendar events in one transaction.
 * @param {number[]} ids
 * @returns {number} how many were deleted
 */
function deleteBills(ids) {
  try {
    const list = uniqPositiveIds(ids);
    if (!list.length) return 0;
    const db = getDb();
    const delRow = db.prepare('DELETE FROM bills WHERE id = ?');
    const run = db.transaction((idList) => {
      let n = 0;
      for (const id of idList) {
        require('./calendar-sync').deleteEventsForSource('bill', id);
        const r = delRow.run(id);
        if (r.changes) n += 1;
      }
      return n;
    });
    return run(list);
  } catch (err) {
    logError('deleteBills', err);
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

/**
 * Bulk-delete payment history rows in one transaction.
 * @param {number[]} ids
 * @returns {number} how many were deleted
 */
function deleteBillPayments(ids) {
  try {
    const list = uniqPositiveIds(ids);
    if (!list.length) return 0;
    const db = getDb();
    const delRow = db.prepare('DELETE FROM bill_payments WHERE id = ?');
    const run = db.transaction((idList) => {
      let n = 0;
      for (const id of idList) {
        const r = delRow.run(id);
        if (r.changes) n += 1;
      }
      return n;
    });
    return run(list);
  } catch (err) {
    logError('deleteBillPayments', err);
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

/** Bills due today or overdue (Today Focus brief). */
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
 * Unpaid bills due this calendar week plus leftover overdue before Monday.
 * @param {string} weekStartKey yyyy-mm-dd (Monday)
 * @param {string} weekEndKey yyyy-mm-dd (Sunday)
 */
function listBillsForWeekBrief(weekStartKey, weekEndKey) {
  try {
    const dueThisWeek = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status IN ('pending', 'overdue')
           AND due_date >= ? AND due_date <= ?
         ORDER BY due_date ASC, name COLLATE NOCASE`
      )
      .all(weekStartKey, weekEndKey)
      .map(enrich);
    const overdue = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status = 'overdue' AND due_date < ?
         ORDER BY due_date ASC`
      )
      .all(weekStartKey)
      .map(enrich);
    return { billsDueThisWeek: dueThisWeek, billsOverdue: overdue };
  } catch (err) {
    logError('listBillsForWeekBrief', err);
    throw err;
  }
}

/**
 * Pending/overdue bills needing due-day popup (day-before is optional Nudge).
 * @returns {{ id, name, title, amount, due_date, alertKind: 'due' }[]}
 */
function listDueBillAlerts() {
  try {
    const today = dateKey();
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
      }
    }
    return out;
  } catch (err) {
    logError('listDueBillAlerts', err);
    throw err;
  }
}

/** Pending bills whose nudge_datetime has arrived and not yet alerted. */
function listDueBillNudges() {
  try {
    return getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status IN ('pending', 'overdue')
           AND nudge_datetime IS NOT NULL
           AND COALESCE(nudge_alerted, 0) = 0
           AND datetime(nudge_datetime) <= datetime('now')`
      )
      .all()
      .map(enrich);
  } catch (err) {
    logError('listDueBillNudges', err);
    throw err;
  }
}

function markBillNudgeAlerted(id) {
  getDb().prepare('UPDATE bills SET nudge_alerted = 1 WHERE id = ?').run(id);
  return getBill(id);
}

/** Category names for dropdowns, A–Z. */
function listBillCategories() {
  try {
    return getDb()
      .prepare('SELECT name FROM bill_categories ORDER BY name COLLATE NOCASE ASC')
      .all()
      .map((r) => r.name);
  } catch (err) {
    logError('listBillCategories', err);
    throw err;
  }
}

/**
 * Insert a category name if missing.
 * @param {string} name
 * @returns {string} trimmed name
 */
function createBillCategory(name) {
  try {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Category name required');
    getDb()
      .prepare('INSERT OR IGNORE INTO bill_categories (name) VALUES (?)')
      .run(trimmed);
    return trimmed;
  } catch (err) {
    logError('createBillCategory', err);
    throw err;
  }
}

/** Snooze only the nudge; bill due is unchanged. */
function snoozeBillNudge(id, minutes = 10) {
  try {
    const settingsMins = Number(
      getDb()
        .prepare(`SELECT value FROM settings WHERE key = 'notif_default_snooze_minutes'`)
        .get()?.value || 10
    );
    const mins = Number(minutes);
    const useMins = Number.isFinite(mins) && mins > 0 ? mins : settingsMins;
    const until = new Date(Date.now() + useMins * 60 * 1000).toISOString();
    getDb()
      .prepare(`UPDATE bills SET nudge_datetime = ?, nudge_alerted = 0 WHERE id = ?`)
      .run(until, id);
    return getBill(id);
  } catch (err) {
    logError('snoozeBillNudge', err);
    throw err;
  }
}

/** X / Done on nudge popup — drop this nudge only. */
function dismissBillNudge(id) {
  return markBillNudgeAlerted(id);
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
  deleteBills,
  deleteBillPayment,
  deleteBillPayments,
  markOverdueBills,
  listBillsForBrief,
  listBillsForWeekBrief,
  listDueBillAlerts,
  listDueBillNudges,
  markBillAlerted,
  markBillNudgeAlerted,
  snoozeBill,
  snoozeBillNudge,
  dismissBillAlert,
  dismissBillNudge,
  advanceDue,
  addMonthsIso,
  listBillCategories,
  createBillCategory,
  STATUSES,
  AMOUNT_MODES,
  AVG_MIN_SAMPLES,
};
