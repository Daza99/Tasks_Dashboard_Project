/**
 * Money / expenditure logging + aggregates.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { getItemTagNames, addTag } = require('./tags');
const { dateKey } = require('./habits');

function enrich(row) {
  if (!row) return null;
  return { ...row, tags: getItemTagNames('transaction', row.id) };
}

/** Create transaction. */
function createTransaction({
  amount,
  category,
  description = null,
  date = dateKey(),
  tags = [],
}) {
  try {
    const amt = Number(amount);
    if (!Number.isFinite(amt)) throw new Error('Amount required');
    if (!category?.trim()) throw new Error('Category required');
    const info = getDb()
      .prepare(
        `INSERT INTO transactions (amount, category, description, date)
         VALUES (?, ?, ?, ?)`
      )
      .run(amt, category.trim(), description, date);
    const id = Number(info.lastInsertRowid);
    for (const t of tags || []) addTag('transaction', id, t);
    return getTransaction(id);
  } catch (err) {
    logError('createTransaction', err);
    throw err;
  }
}

function getTransaction(id) {
  const row = getDb().prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  return enrich(row);
}

function listTransactions({ limit = 100 } = {}) {
  try {
    return getDb()
      .prepare(
        `SELECT * FROM transactions
         ORDER BY date DESC, created_at DESC
         LIMIT ?`
      )
      .all(limit)
      .map(enrich);
  } catch (err) {
    logError('listTransactions', err);
    throw err;
  }
}

/** Distinct categories for suggestions (recent first). */
function listCategories() {
  try {
    return getDb()
      .prepare(
        `SELECT category, MAX(created_at) AS last_used
         FROM transactions
         GROUP BY category
         ORDER BY last_used DESC
         LIMIT 30`
      )
      .all()
      .map((r) => r.category);
  } catch (err) {
    logError('listCategories', err);
    throw err;
  }
}

function updateTransaction(id, fields) {
  try {
    const cur = getDb().prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!cur) throw new Error('Transaction not found');
    const amount =
      fields.amount !== undefined ? Number(fields.amount) : cur.amount;
    if (!Number.isFinite(amount)) throw new Error('Invalid amount');
    const category =
      fields.category !== undefined
        ? String(fields.category).trim()
        : cur.category;
    if (!category) throw new Error('Category required');
    const description =
      fields.description !== undefined ? fields.description : cur.description;
    const date = fields.date !== undefined ? fields.date : cur.date;
    getDb()
      .prepare(
        `UPDATE transactions SET amount = ?, category = ?, description = ?, date = ?
         WHERE id = ?`
      )
      .run(amount, category, description, date, id);
    return getTransaction(id);
  } catch (err) {
    logError('updateTransaction', err);
    throw err;
  }
}

function deleteTransaction(id) {
  try {
    getDb()
      .prepare(
        `DELETE FROM item_tags WHERE item_type = 'transaction' AND item_id = ?`
      )
      .run(id);
    getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return true;
  } catch (err) {
    logError('deleteTransaction', err);
    throw err;
  }
}

function sumForDate(day = dateKey()) {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE date = ?`
    )
    .get(day);
  return Number(row.total) || 0;
}

function sumMonthToDate(ref = new Date()) {
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const prefix = `${y}-${m}-`;
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE date LIKE ?`
    )
    .get(`${prefix}%`);
  return Number(row.total) || 0;
}

/** Brief money snapshot. */
function getMoneySnapshot() {
  return {
    moneyToday: sumForDate(),
    moneyMtd: sumMonthToDate(),
  };
}

module.exports = {
  createTransaction,
  getTransaction,
  listTransactions,
  listCategories,
  updateTransaction,
  deleteTransaction,
  sumForDate,
  sumMonthToDate,
  getMoneySnapshot,
};
