/**
 * Natural-language Quick Add → task or reminder payload.
 * Examples:
 *   "buy milk" → task todo_24
 *   "todo open read book #later" → todo_open + tag later
 *   "buy milk p1" → task priority 1
 *   "remind call mom tomorrow" / "remind pay bill at 5pm"
 */

function stripTags(text) {
  const tags = [];
  const cleaned = text
    .replace(/#([a-zA-Z0-9_-]+)/g, (_, t) => {
      tags.push(t.toLowerCase());
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
  if (!ap && h <= 7) h += 12; // bare "5" → 5pm heuristic for evening
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

/**
 * @param {string} input
 * @returns {{ type: 'task'|'reminder', payload: object, tags: string[] }}
 */
function parseQuickAdd(input) {
  const raw = (input || '').trim();
  if (!raw) throw new Error('Empty input');

  const { cleaned, tags } = stripTags(raw);
  const lower = cleaned.toLowerCase();

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
      datetime = parseTimeToday(body); // time-of-day applied to tomorrow in service if we pass ISO — fix below
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

  // p1–p5 or priority:1 (avoid leading ! — that means reminder)
  let priority = 3;
  const prioMatch =
    body.match(/\bp([1-5])\b/i) ||
    body.match(/\bprio(?:rity)?\s*[:=]?\s*([1-5])\b/i);
  if (prioMatch) {
    priority = Number(prioMatch[1]);
    body = body
      .replace(/\bp[1-5]\b/i, '')
      .replace(/\bprio(?:rity)?\s*[:=]?\s*[1-5]\b/i, '')
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
