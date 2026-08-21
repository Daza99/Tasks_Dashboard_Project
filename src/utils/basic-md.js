/**
 * Tiny markdown subset for MD list / Notes preview. Escape first, then format.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Parse #rgb / #rrggbb / rgb() to lowercase #rrggbb, or null. */
function rgbToHex(c) {
  if (!c) return null;
  const v = String(c).trim();
  const full = v.match(/^#([0-9a-fA-F]{6})$/);
  if (full) return `#${full[1].toLowerCase()}`;
  const short = v.match(/^#([0-9a-fA-F]{3})$/);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

/** Inline color from data-md-color, font color, or style.color. */
function nodeColor(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.dataset?.mdColor) return rgbToHex(el.dataset.mdColor);
  if (el.tagName === 'FONT') return rgbToHex(el.getAttribute('color'));
  return el.style?.color ? rgbToHex(el.style.color) : null;
}

/** Highlight from data-md-hl or background-color (skip transparent). */
function nodeHighlight(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.dataset?.mdHl) return rgbToHex(el.dataset.mdHl);
  const bg = el.style?.backgroundColor;
  if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return null;
  return rgbToHex(bg);
}

function colorMarkRe() {
  return /\{#([0-9a-fA-F]{6})\}(.*?)\{\/\}/gs;
}

function hlMarkRe() {
  return /\{hl:#([0-9a-fA-F]{6})\}(.*?)\{\/hl\}/gs;
}

/** Wrap escaped text with highlight then color, then inline MD. */
function inline(s) {
  return escapeHtml(s)
    .replace(
      hlMarkRe(),
      '<span style="background-color:#$1">$2</span>'
    )
    .replace(colorMarkRe(), '<span style="color:#$1">$2</span>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<span class="md-pad__link">$1</span>');
}

/**
 * Render basic MD: # / ## / ###, color, highlight, strike, bold, italic, ul/ol, code, links.
 * @param {string} src
 * @returns {string} HTML
 */
export function renderBasicMd(src) {
  const lines = String(src || '').split('\n');
  const out = [];
  let listKind = null; // 'ul' | 'ol'

  function closeList() {
    if (listKind === 'ul') out.push('</ul>');
    if (listKind === 'ol') out.push('</ol>');
    listKind = null;
  }

  for (const line of lines) {
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (h3) {
      closeList();
      out.push(`<h3>${inline(h3[1])}</h3>`);
      continue;
    }
    if (h2) {
      closeList();
      out.push(`<h2>${inline(h2[1])}</h2>`);
      continue;
    }
    if (h1) {
      closeList();
      out.push(`<h1>${inline(h1[1])}</h1>`);
      continue;
    }
    if (ul) {
      if (listKind === 'ol') closeList();
      if (listKind !== 'ul') {
        out.push('<ul>');
        listKind = 'ul';
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    if (ol) {
      if (listKind === 'ul') closeList();
      if (listKind !== 'ol') {
        out.push('<ol>');
        listKind = 'ol';
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') out.push('<br/>');
    else out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('');
}

/**
 * Markdown → contenteditable HTML. Color/highlight marks become spans.
 * @param {string} src
 * @returns {string}
 */
export function mdToEditHtml(src) {
  return escapeHtml(String(src || ''))
    .replace(
      hlMarkRe(),
      '<span data-md-hl="#$1" style="background-color:#$1">$2</span>'
    )
    .replace(
      colorMarkRe(),
      '<span data-md-color="#$1" style="color:#$1">$2</span>'
    )
    .replace(/\n/g, '<br>');
}

function serializeNodes(nodes) {
  let s = '';
  for (let i = 0; i < nodes.length; i += 1) {
    s += serializeNode(nodes[i], i > 0);
  }
  return s;
}

function serializeNode(node, afterSibling) {
  if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, ' ');
  if (node.nodeType !== 1) return '';
  const tag = node.tagName;
  if (tag === 'BR') return '\n';
  const inner = serializeNodes(node.childNodes);
  const color = nodeColor(node);
  const hl = nodeHighlight(node);
  let out = inner;
  // Split at newlines so preview (per-line inline) does not leak raw marks
  if (color) {
    out = out
      .split('\n')
      .map((part) => `{#${color.slice(1)}}${part}{/}`)
      .join('\n');
  }
  if (hl) {
    out = out
      .split('\n')
      .map((part) => `{hl:${hl}}${part}{/hl}`)
      .join('\n');
  }
  if (tag === 'DIV' || tag === 'P') {
    return (afterSibling ? '\n' : '') + out;
  }
  return out;
}

/**
 * Contenteditable root → markdown with color + highlight marks.
 * @param {ParentNode} root
 * @returns {string}
 */
export function editHtmlToMd(root) {
  if (!root) return '';
  // Chromium empty CE is a lone <br>
  if (
    root.childNodes.length === 1 &&
    root.firstChild.nodeType === 1 &&
    root.firstChild.tagName === 'BR'
  ) {
    return '';
  }
  return serializeNodes(root.childNodes);
}

/** Strip MD / color / highlight marks for .txt export. */
export function mdToPlainText(src) {
  return String(src || '')
    .replace(/\{hl:#[0-9a-fA-F]{6}\}/g, '')
    .replace(/\{\/hl\}/g, '')
    .replace(/\{#[0-9a-fA-F]{6}\}/g, '')
    .replace(/\{\/\}/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '');
}
