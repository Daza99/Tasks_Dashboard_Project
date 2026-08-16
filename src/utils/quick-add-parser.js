/**
 * Natural-language Quick Add → task | reminder | transaction | habit.
 * Examples:
 *   "buy milk" → task todo_24
 *   "remind call mom tomorrow"
 *   "$12.50 coffee" / "spent 12.50 groceries lunch"
 *   "habit stretch daily"
 */

function stripTags(text) {
  const { normalizeTagName } = require('./tag-helpers.cjs');
  const tags = [];
  const cleaned = text
    .replace(/#([a-zA-Z0-9_-]+)/g, (_, t) => {
      const bare = normalizeTagName(t);
      if (bare) tags.push(bare);
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { cleaned, tags };
}

function parseTimeToday(phrase) {
  const m = phrase.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!ap && h <= 7) h += 12;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

/** Local YYYY-MM-DD. */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {string} input
 * @returns {{ type: string, payload: object, tags: string[] }}
 */
function parseQuickAdd(input) {
  const raw = (input || '').trim();
  if (!raw) throw new Error('Empty input');

  const { cleaned, tags } = stripTags(raw);
  const lower = cleaned.toLowerCase();

  // Spend: $12.50 coffee  |  spent 12.50 groceries
  const spendMatch =
    cleaned.match(/^\$\s*(\d+(?:\.\d{1,2})?)\s+(.+)$/i) ||
    cleaned.match(/^(?:spent|spend|tx|paid)\s+\$?\s*(\d+(?:\.\d{1,2})?)\s+(.+)$/i);
  if (spendMatch) {
    const amount = Number(spendMatch[1]);
    let rest = spendMatch[2].trim();
    const parts = rest.split(/\s+/);
    const category = parts[0] || 'misc';
    const description = parts.slice(1).join(' ') || null;
    return {
      type: 'transaction',
      payload: { amount, category, description, date: todayKey(), tags },
      tags,
    };
  }

  // Habit: habit stretch  |  habit meditate weekly
  if (/^habit\b/i.test(cleaned)) {
    let body = cleaned.replace(/^habit\s+/i, '').trim();
    let frequency = 'daily';
    if (/\bweekdays?\b/i.test(body) || /\bweekly\b/i.test(body)) {
      frequency = 'weekly';
      body = body.replace(/\bweekdays?\b/i, '').replace(/\bweekly\b/i, '').trim();
    } else if (/\bmonthly\b/i.test(body) || /\bcustom\b/i.test(body)) {
      frequency = 'monthly';
      body = body.replace(/\bmonthly\b/i, '').replace(/\bcustom\b/i, '').trim();
    } else if (/\bdaily\b/i.test(body)) {
      body = body.replace(/\bdaily\b/i, '').trim();
    }
    if (!body) throw new Error('Habit name required');
    return {
      type: 'habit',
      payload: { name: body, frequency },
      tags,
    };
  }

  const isReminder =
    /^(remind(?:er)?|rem)\b/i.test(cleaned) ||
    lower.startsWith('!') ||
    /\bremind me\b/i.test(cleaned);

  if (isReminder) {
    let body = cleaned
      .replace(/^(remind(?:er)?|rem)\s*(me\s*(to\s*)?)?/i, '')
      .replace(/^!\s*/, '')
      .trim();

    let scope = 'today';
    let datetime = null;

    if (/\btomorrow\b/i.test(body)) {
      scope = 'tomorrow';
      body = body.replace(/\btomorrow\b/i, '').trim();
      datetime = parseTimeToday(body);
      if (datetime) {
        const t = new Date(datetime);
        const tom = new Date();
        tom.setDate(tom.getDate() + 1);
        tom.setHours(t.getHours(), t.getMinutes(), 0, 0);
        datetime = tom.toISOString();
      }
      body = body.replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?\b/i, '').trim();
    } else if (/\btoday\b/i.test(body)) {
      scope = 'today';
      body = body.replace(/\btoday\b/i, '').trim();
      datetime = parseTimeToday(body);
      body = body.replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?\b/i, '').trim();
    } else {
      datetime = parseTimeToday(body);
      if (datetime) {
        body = body.replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?\b/i, '').trim();
      }
    }

    if (!body) body = 'Reminder';

    return {
      type: 'reminder',
      payload: { title: body, scope, datetime },
      tags,
    };
  }

  let kind = 'todo_24';
  let body = cleaned;
  if (/\btodo\s+open\b/i.test(body) || /\bopen\s*:/i.test(body)) {
    kind = 'todo_open';
    body = body.replace(/\btodo\s+open\b/i, '').replace(/\bopen\s*:/i, '').trim();
  } else {
    body = body.replace(/^(todo|task)\s+/i, '').trim();
  }

  let priority = 3;
  const prioMatch =
    body.match(/\bp([1-3])\b/i) ||
    body.match(/\bprio(?:rity)?\s*[:=]?\s*([1-3])\b/i);
  if (prioMatch) {
    priority = Number(prioMatch[1]);
    body = body
      .replace(/\bp[1-3]\b/i, '')
      .replace(/\bprio(?:rity)?\s*[:=]?\s*[1-3]\b/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    type: 'task',
    payload: { title: body || cleaned, kind, priority },
    tags,
  };
}

module.exports = { parseQuickAdd, stripTags, parseTimeToday };
