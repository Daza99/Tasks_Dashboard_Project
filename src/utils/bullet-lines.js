/**
 * Bullet-pad line prefixes: Mixed / Line (-) / Dot (*) / Numbered (1.).
 */

/**
 * Parse a single line's marker. Accepts -, *, 1. / 1
 * @param {string} line
 * @returns {{ kind: 'line'|'dot'|'numbered'|'none', indent: string, text: string, n: number|null }}
 */
export function parseLine(line) {
  const s = String(line);
  const dash = s.match(/^(\s*)-\s?(.*)$/);
  if (dash) return { kind: 'line', indent: dash[1], text: dash[2], n: null };
  const star = s.match(/^(\s*)\*\s?(.*)$/);
  if (star) return { kind: 'dot', indent: star[1], text: star[2], n: null };
  const numDot = s.match(/^(\s*)(\d+)\.\s?(.*)$/);
  if (numDot) return { kind: 'numbered', indent: numDot[1], text: numDot[3], n: Number(numDot[2]) };
  // Bare "1" after backspacing a marker (user-accepted input)
  const one = s.match(/^(\s*)1(?:\s+(.*)|$)/);
  if (one) return { kind: 'numbered', indent: one[1], text: one[2] || '', n: 1 };
  return { kind: 'none', indent: '', text: s, n: null };
}

/**
 * Prefix string for a marker kind.
 * @param {'line'|'dot'|'numbered'|'none'} kind
 * @param {number|null} [n]
 */
export function prefixFor(kind, n = 1) {
  if (kind === 'line') return '- ';
  if (kind === 'dot') return '* ';
  if (kind === 'numbered') return `${n}. `;
  return '';
}

/**
 * Marker for the next line after `prev`, given toolbar mode.
 * @param {'mixed'|'line'|'dot'|'numbered'} mode
 * @param {{ kind: string, n: number|null }} prev
 */
export function nextMarker(mode, prev) {
  if (mode === 'line') return { kind: 'line', n: null };
  if (mode === 'dot') return { kind: 'dot', n: null };
  if (mode === 'numbered') {
    const n = prev.kind === 'numbered' && prev.n ? prev.n + 1 : 1;
    return { kind: 'numbered', n };
  }
  // Mixed: inherit last line; numbered increments
  if (prev.kind === 'numbered') return { kind: 'numbered', n: (prev.n || 0) + 1 };
  if (prev.kind === 'line' || prev.kind === 'dot') return { kind: prev.kind, n: null };
  return { kind: 'none', n: null };
}

/**
 * Insert a prefixed newline at the caret. Returns { text, caret }.
 * @param {string} text
 * @param {number} caret
 * @param {'mixed'|'line'|'dot'|'numbered'} mode
 */
export function insertPrefixedNewline(text, caret, mode) {
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const lineStart = before.lastIndexOf('\n') + 1;
  const prev = parseLine(before.slice(lineStart));
  const next = nextMarker(mode, prev);
  const insert = `\n${prefixFor(next.kind, next.n)}`;
  return { text: before + insert + after, caret: before.length + insert.length };
}

/**
 * Seed first line when the pad is empty and mode is locked.
 * @param {'mixed'|'line'|'dot'|'numbered'} mode
 */
export function seedEmpty(mode) {
  if (mode === 'line') return '- ';
  if (mode === 'dot') return '* ';
  if (mode === 'numbered') return '1. ';
  return '';
}
