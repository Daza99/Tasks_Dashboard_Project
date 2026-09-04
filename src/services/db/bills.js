/**
 * Bills CRUD, paid/overdue, recurrence advance, alert queries.
 * amount_mode: fixed | estimate | average; payments logged for name-based averages.
 * due_date = clamped base; watch_date = due_date + date_offset_days.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { dateKey } = require('./habits');
const { addTag, removeTag, getItemTagNames, syncUserTags } = require('./tags');
const { clampPriority, DEFAULT_PRIORITY } = require('../../utils/priority.cjs');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

const STATUSES = ['pending', 'paid', 'overdue'];
const AMOUNT_MODES = ['fixed', 'estimate', 'average'];
const RECURRENCES = ['monthly', 'fortnight', 'quarterly', 'yearly'];
const REGIONS = ['nz', 'us', 'uk', 'other'];
const PAYMENT_TYPES = ['card', 'bank'];
/** Min payment history rows (by name) before Calc Average unlocks. */
const AVG_MIN_SAMPLES = 6;

/** SQLite watch date (base due + offset; negative offsets work). */
function watchSql(alias) {
  const p = alias ? `${alias}.` : '';
  return `date(${p}due_date, CAST(COALESCE(${p}date_offset_days, 0) AS TEXT) || ' days')`;
}

function parseIsoDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return { y, m, d };
}

function isoYmd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Last calendar day of month (month 1–12). */
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function clampDay(year, month, day) {
  const last = lastDayOfMonth(year, month);
  const n = Number(day);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.round(n), last);
}

function billingDayFromDue(dueDate) {
  const d = Number(String(dueDate).slice(8, 10));
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
}

/** Keep billing_day, clamp to last day of the target month (no overflow). */
function addMonthsKeepDay(isoDate, months, billingDay) {
  const { y, m } = parseIsoDate(isoDate);
  const dt = new Date(y, m - 1 + Number(months), 1);
  const ny = dt.getFullYear();
  const nm = dt.getMonth() + 1;
  return isoYmd(ny, nm, clampDay(ny, nm, billingDay));
}

/** Add months to YYYY-MM-DD, clamping the source day to the target month. */
function addMonthsIso(isoDate, months) {
  const { d } = parseIsoDate(isoDate);
  return addMonthsKeepDay(isoDate, months, d);
}

/** Add days to YYYY-MM-DD. */
function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateKey(dt);
}

/** Displayed/watched date = clamped base + offset. */
function watchDateFrom(dueDate, offsetDays) {
  if (!dueDate) return dueDate;
  return addDaysIso(dueDate, Number(offsetDays) || 0);
}

function clampRemindDays(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.max(0, Math.min(30, Math.round(v)));
}

function clampOffset(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(-14, Math.min(14, Math.round(v)));
}

function normalizeRegion(v) {
  if (v == null || v === '') return null;
  return REGIONS.includes(v) ? v : null;
}

function normalizePaymentType(v) {
  if (v == null || v === '') return null;
  return PAYMENT_TYPES.includes(v) ? v : null;
}

/** Local date at 09:00 → ISO (matches calendar dateAtNine). */
function dueAtNine(dueDate) {
  const [y, m, d] = String(dueDate).split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0).toISOString();
}

/**
 * Next base due. Monthly/quarterly/yearly keep billing_day and clamp.
 * @param {string} dueDate
 * @param {string|null} recurrence
 * @param {number} [billingDay]
 */
function advanceDue(dueDate, recurrence, billingDay) {
  const day = billingDay || billingDayFromDue(dueDate);
  if (recurrence === 'monthly') return addMonthsKeepDay(dueDate, 1, day);
  if (recurrence === 'fortnight') return addDaysIso(dueDate, 14);
  if (recurrence === 'quarterly') return addMonthsKeepDay(dueDate, 3, day);
  if (recurrence === 'yearly') return addMonthsKeepDay(dueDate, 12, day);
  return null;
}

function normalizeAmountMode(mode) {
  return AMOUNT_MODES.includes(mode) ? mode : 'fixed';
}

/**
 * Resolve nudge columns. Off → all null. day_before = watch 09:00 minus 1 calendar day.
 */
function resolveNudgeFields(
  dueDate,
  { nudge, nudge_mode, nudge_datetime, date_offset_days } = {}
) {
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
  const watch = watchDateFrom(dueDate, date_offset_days);
  const due = new Date(dueAtNine(watch));
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
  const offset = Number(row.date_offset_days) || 0;
  const billingDay = row.billing_day || billingDayFromDue(row.due_date);
  const watch_date = watchDateFrom(row.due_date, offset);
  return {
    ...row,
    title: row.name,
    amount_mode: normalizeAmountMode(row.amount_mode),
    show_on_calendar: Number(row.show_on_calendar) !== 0 ? 1 : 0,
    billing_day: billingDay,
    date_offset_days: offset,
    remind_days_before: clampRemindDays(row.remind_days_before),
    watch_date,
    tags: getItemTagNames('bill', row.id),
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
  remind_days_before = 3,
  date_offset_days = 0,
  biller_region = null,
  payment_type = null,
  tags = [],
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
    const offset = clampOffset(date_offset_days);
    const lead = clampRemindDays(remind_days_before);
    const billingDay = billingDayFromDue(due_date);
    const region = normalizeRegion(biller_region);
    const payType = normalizePaymentType(payment_type);
    const nudgeFields = resolveNudgeFields(due_date, {
      nudge,
      nudge_mode,
      nudge_datetime,
      date_offset_days: offset,
    });
    const info = getDb()
      .prepare(
        `INSERT INTO bills (name, amount, amount_mode, due_date, recurrence, paid_status, category,
           priority, description, show_on_calendar, nudge_datetime, nudge_mode, nudge_alerted,
           remind_days_before, billing_day, date_offset_days, biller_region, payment_type)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        nudgeFields.nudge_alerted,
        lead,
        billingDay,
        offset,
        region,
        payType
      );
    const id = Number(info.lastInsertRowid);
    if (tags && (Array.isArray(tags) ? tags.length : String(tags).trim())) {
      syncUserTags('bill', id, tags);
    }
    syncOnceTag(id, rec);
    const row = getBill(id);
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
    const watch = watchSql();
    const rows = getDb()
      .prepare(
        `SELECT * FROM bills
         ${includePaid ? '' : "WHERE paid_status != 'paid'"}
         ORDER BY COALESCE(priority, 3) ASC, ${watch} ASC, name COLLATE NOCASE ASC`
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
    const offset =
      fields.date_offset_days !== undefined
        ? clampOffset(fields.date_offset_days)
        : clampOffset(cur.date_offset_days);
    const lead =
      fields.remind_days_before !== undefined
        ? clampRemindDays(fields.remind_days_before)
        : clampRemindDays(cur.remind_days_before);
    const dueChanged = fields.due_date !== undefined && fields.due_date !== cur.due_date;
    const billing_day = dueChanged
      ? billingDayFromDue(due_date)
      : cur.billing_day || billingDayFromDue(due_date);
    const region =
      fields.biller_region !== undefined
        ? normalizeRegion(fields.biller_region)
        : normalizeRegion(cur.biller_region);
    const payType =
      fields.payment_type !== undefined
        ? normalizePaymentType(fields.payment_type)
        : normalizePaymentType(cur.payment_type);

    const offsetChanged = offset !== clampOffset(cur.date_offset_days);
    const leadChanged = lead !== clampRemindDays(cur.remind_days_before);
    const watchChanged = dueChanged || offsetChanged;
    const nudgeTouched =
      fields.nudge !== undefined ||
      fields.nudge_mode !== undefined ||
      fields.nudge_datetime !== undefined ||
      (watchChanged && cur.nudge_mode === 'day_before');

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
        date_offset_days: offset,
      });
      nudge_datetime = resolved.nudge_datetime;
      nudge_mode = resolved.nudge_mode;
      nudge_alerted = resolved.nudge_alerted;
    }

    const resetLead = dueChanged || offsetChanged || leadChanged;
    const resetDue = watchChanged;
    const db = getDb();
    db.prepare(
      `UPDATE bills SET name = ?, amount = ?, amount_mode = ?, due_date = ?, recurrence = ?,
       category = ?, paid_status = ?, priority = ?, description = ?,
       show_on_calendar = ?, nudge_datetime = ?, nudge_mode = ?, nudge_alerted = ?,
       remind_days_before = ?, billing_day = ?, date_offset_days = ?,
       biller_region = ?, payment_type = ?
       ${resetLead ? ', alerted_before = 0' : ''}
       ${resetDue ? ', alerted_due = 0, snooze_until = NULL' : ''}
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
      lead,
      billing_day,
      offset,
      region,
      payType,
      id
    );

    if (name !== cur.name) {
      db.prepare('UPDATE bill_payments SET bill_name = ? WHERE bill_id = ?').run(
        name,
        id
      );
    }
    if (fields.tags !== undefined) syncUserTags('bill', id, fields.tags);
    syncOnceTag(id, recurrence);
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

/** #once follows recurrence: present only when the bill is not repeating. */
function syncOnceTag(id, recurrence) {
  if (recurrence) removeTag('bill', id, 'once');
  else addTag('bill', id, 'once');
}

/** Apply pay-status hashtags (accumulate; never strip). */
function applyPayTags(id, { late, scheduleChanged }) {
  addTag('bill', id, 'paid');
  if (late) addTag('bill', id, 'paidlate');
  if (scheduleChanged) addTag('bill', id, 'paidlatechange');
}

/**
 * Shift day_before/custom nudge onto the next due.
 * @param {object} cur
 * @param {string} nextDue
 * @param {number} offset
 */
function nextNudgeFields(cur, nextDue, offset) {
  if (cur.nudge_mode === 'day_before' && cur.nudge_datetime) {
    return resolveNudgeFields(nextDue, {
      nudge: true,
      nudge_mode: 'day_before',
      date_offset_days: offset,
    });
  }
  if (cur.nudge_mode === 'custom' && cur.nudge_datetime) {
    return {
      nudge_datetime: shiftNudgeWithDue(cur.nudge_datetime, cur.due_date, nextDue),
      nudge_mode: 'custom',
      nudge_alerted: 0,
    };
  }
  return { nudge_datetime: null, nudge_mode: null, nudge_alerted: 0 };
}

/**
 * Mark paid. Logs actual to bill_payments, then advances recurring due_date
 * unless new_due_date is set (biller moved the date).
 * @param {number} id
 * @param {{ actual_amount?: number, late?: boolean, new_due_date?: string }} [opts]
 */
function markPaid(id, opts = {}) {
  try {
    const cur = getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!cur) throw new Error('Bill not found');
    let actual =
      opts.actual_amount !== undefined ? Number(opts.actual_amount) : cur.amount;
    if (!Number.isFinite(actual)) actual = cur.amount;
    const late = Boolean(opts.late);
    const newDueRaw = opts.new_due_date ? String(opts.new_due_date).trim() : '';
    const scheduleChanged = Boolean(newDueRaw);
    if (scheduleChanged && !/^\d{4}-\d{2}-\d{2}$/.test(newDueRaw)) {
      throw new Error('new_due_date must be yyyy-mm-dd');
    }
    if (scheduleChanged && !cur.recurrence) {
      throw new Error('Cannot change schedule on a once bill');
    }

    const offset = clampOffset(cur.date_offset_days);
    const billingDay = cur.billing_day || billingDayFromDue(cur.due_date);

    const db = getDb();
    const tx = db.transaction(() => {
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
          `INSERT INTO bill_payments (bill_id, bill_name, amount, due_date, late, schedule_changed)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, cur.name, actual, cur.due_date, late ? 1 : 0, scheduleChanged ? 1 : 0);
      } else if (late || scheduleChanged) {
        db.prepare(
          `UPDATE bill_payments SET
             late = CASE WHEN ? = 1 THEN 1 ELSE late END,
             schedule_changed = CASE WHEN ? = 1 THEN 1 ELSE schedule_changed END
           WHERE id = ?`
        ).run(late ? 1 : 0, scheduleChanged ? 1 : 0, exactDup.id);
      }

      if (scheduleChanged) {
        const nextDay = billingDayFromDue(newDueRaw);
        const nudge = nextNudgeFields(cur, newDueRaw, offset);
        db.prepare(
          `UPDATE bills SET paid_status = 'pending', due_date = ?, billing_day = ?,
           alerted_before = 0, alerted_due = 0, snooze_until = NULL,
           nudge_datetime = ?, nudge_mode = ?, nudge_alerted = ?
           WHERE id = ?`
        ).run(
          newDueRaw,
          nextDay,
          nudge.nudge_datetime,
          nudge.nudge_mode,
          nudge.nudge_alerted,
          id
        );
      } else {
        const next = advanceDue(cur.due_date, cur.recurrence, billingDay);
        if (next) {
          const nudge = nextNudgeFields(cur, next, offset);
          db.prepare(
            `UPDATE bills SET paid_status = 'pending', due_date = ?,
             alerted_before = 0, alerted_due = 0, snooze_until = NULL,
             nudge_datetime = ?, nudge_mode = ?, nudge_alerted = ?
             WHERE id = ?`
          ).run(next, nudge.nudge_datetime, nudge.nudge_mode, nudge.nudge_alerted, id);
        } else {
          db.prepare(
            `UPDATE bills SET paid_status = 'paid',
             alerted_before = 1, alerted_due = 1, snooze_until = NULL
             WHERE id = ?`
          ).run(id);
        }
      }
      applyPayTags(id, { late, scheduleChanged });
    });
    tx();
    const row = getBill(id);
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
        `SELECT id, bill_id, bill_name, amount, due_date, paid_at,
                COALESCE(late, 0) AS late,
                COALESCE(schedule_changed, 0) AS schedule_changed
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
    const db = getDb();
    db.prepare(`DELETE FROM item_tags WHERE item_type = 'bill' AND item_id = ?`).run(id);
    db.prepare('DELETE FROM bills WHERE id = ?').run(id);
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
    const delTags = db.prepare(`DELETE FROM item_tags WHERE item_type = 'bill' AND item_id = ?`);
    const run = db.transaction((idList) => {
      let n = 0;
      for (const id of idList) {
        require('./calendar-sync').deleteEventsForSource('bill', id);
        delTags.run(id);
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
    const watch = watchSql();
    const rows = db
      .prepare(
        `SELECT id, name FROM bills
         WHERE paid_status = 'pending' AND ${watch} < ?`
      )
      .all(today);
    if (rows.length) {
      db.prepare(
        `UPDATE bills SET paid_status = 'overdue'
         WHERE paid_status = 'pending' AND ${watch} < ?`
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
    const watch = watchSql();
    const dueToday = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status IN ('pending', 'overdue') AND ${watch} = ?
         ORDER BY name COLLATE NOCASE`
      )
      .all(today)
      .map(enrich);
    const overdue = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status = 'overdue' AND ${watch} < ?
         ORDER BY ${watch} ASC`
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
    const watch = watchSql();
    const dueThisWeek = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status IN ('pending', 'overdue')
           AND ${watch} >= ? AND ${watch} <= ?
         ORDER BY ${watch} ASC, name COLLATE NOCASE`
      )
      .all(weekStartKey, weekEndKey)
      .map(enrich);
    const overdue = getDb()
      .prepare(
        `SELECT * FROM bills
         WHERE paid_status = 'overdue' AND ${watch} < ?
         ORDER BY ${watch} ASC`
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
 * Pending/overdue bills needing lead or due-day popup (nudge is separate).
 * @returns {{ alertKind: 'before'|'due' }[]}
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
      const en = enrich(b);
      const watch = en.watch_date;
      if (watch === today && !b.alerted_due) {
        out.push({ ...en, alertKind: 'due' });
        continue;
      }
      const leadDays = clampRemindDays(b.remind_days_before);
      if (leadDays > 0 && watch > today && !b.alerted_before) {
        const leadDate = addDaysIso(watch, -leadDays);
        if (leadDate <= today) {
          out.push({ ...en, alertKind: 'before', leadDays });
        }
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

/** Exact-name row from the catalog, or null. */
function getBillCategoryExact(db, name) {
  return db.prepare('SELECT name FROM bill_categories WHERE name = ?').get(name) || null;
}

/**
 * How many bills use this exact category string.
 * @param {string} name
 * @returns {number}
 */
function countBillsWithCategory(name) {
  try {
    const src = String(name || '').trim();
    if (!src) return 0;
    const row = getDb()
      .prepare('SELECT COUNT(*) AS n FROM bills WHERE category = ?')
      .get(src);
    return Number(row?.n) || 0;
  } catch (err) {
    logError('countBillsWithCategory', err);
    throw err;
  }
}

/**
 * Rename a catalog row and retag matching bills. NOCASE collision → use Merge.
 * @param {string} from
 * @param {string} to
 * @returns {{ from: string, to: string, renamed: number }}
 */
function renameBillCategory(from, to) {
  try {
    const src = String(from || '').trim();
    const dest = String(to || '').trim();
    if (!src || !dest) throw new Error('Category name required');
    const db = getDb();
    if (!getBillCategoryExact(db, src)) throw new Error('Category not found');
    if (dest === src) return { from: src, to: dest, renamed: 0 };

    const clash = db
      .prepare(
        'SELECT name FROM bill_categories WHERE name = ? COLLATE NOCASE AND name != ?'
      )
      .get(dest, src);
    if (clash) {
      throw new Error(`A category named "${clash.name}" already exists. Use Merge.`);
    }

    const run = db.transaction(() => {
      const bills = db
        .prepare('UPDATE bills SET category = ? WHERE category = ?')
        .run(dest, src);
      db.prepare('UPDATE bill_categories SET name = ? WHERE name = ?').run(dest, src);
      return bills.changes;
    });
    return { from: src, to: dest, renamed: run() };
  } catch (err) {
    logError('renameBillCategory', err);
    throw err;
  }
}

/**
 * Drop a catalog row; bills using it become Uncategorized.
 * @param {string} name
 * @returns {{ name: string, uncategorized: number }}
 */
function deleteBillCategory(name) {
  try {
    const src = String(name || '').trim();
    if (!src) throw new Error('Category name required');
    const db = getDb();
    if (!getBillCategoryExact(db, src)) throw new Error('Category not found');

    const run = db.transaction(() => {
      const bills = db
        .prepare('UPDATE bills SET category = NULL WHERE category = ?')
        .run(src);
      db.prepare('DELETE FROM bill_categories WHERE name = ?').run(src);
      return bills.changes;
    });
    return { name: src, uncategorized: run() };
  } catch (err) {
    logError('deleteBillCategory', err);
    throw err;
  }
}

/**
 * Move bills from mergeAway onto keep, then delete mergeAway from the catalog.
 * @param {string} keep
 * @param {string} mergeAway
 * @returns {{ keep: string, mergeAway: string, moved: number }}
 */
function mergeBillCategories(keep, mergeAway) {
  try {
    const keepName = String(keep || '').trim();
    const awayName = String(mergeAway || '').trim();
    if (!keepName || !awayName) throw new Error('Keep and Merge away are required');
    if (keepName === awayName) throw new Error('Keep and Merge away must differ');
    const db = getDb();
    if (!getBillCategoryExact(db, keepName)) throw new Error('Keep category not found');
    if (!getBillCategoryExact(db, awayName)) {
      throw new Error('Merge away category not found');
    }

    const run = db.transaction(() => {
      const bills = db
        .prepare('UPDATE bills SET category = ? WHERE category = ?')
        .run(keepName, awayName);
      db.prepare('DELETE FROM bill_categories WHERE name = ?').run(awayName);
      return bills.changes;
    });
    return { keep: keepName, mergeAway: awayName, moved: run() };
  } catch (err) {
    logError('mergeBillCategories', err);
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
    const watch = watchDateFrom(b.due_date, b.date_offset_days);
    if (watch === today) {
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
  addDaysIso,
  watchDateFrom,
  billingDayFromDue,
  listBillCategories,
  createBillCategory,
  countBillsWithCategory,
  renameBillCategory,
  deleteBillCategory,
  mergeBillCategories,
  STATUSES,
  AMOUNT_MODES,
  AVG_MIN_SAMPLES,
};
