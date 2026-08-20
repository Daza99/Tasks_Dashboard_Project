/**
 * Tiny markdown subset for MD list preview. Escape first, then format.
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

function colorMarkRe() {
  return /\{#([0-9a-fA-F]{6})\}(.*?)\{\/\}/gs;
}

/** Inline: color, code, strike, bold, italic, links (display only — no navigation). */
function inline(s) {
  return escapeHtml(s)
    .replace(colorMarkRe(), '<span style="color:#$1">$2</span>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<span class="md-pad__link">$1</span>');
}

/**
 * Render basic MD: # / ##, {#rrggbb}color{/}, ~~strike~~, **bold**, *italic*, lists, `code`, links.
 * @param {string} src
 * @returns {string} HTML
 */
export function renderBasicMd(src) {
  const lines = String(src || '').split('\n');
  const out = [];
  let inList = false;

  function closeList() {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  }

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
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
    if (li) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
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
 * Markdown → contenteditable HTML. Color marks become spans; other MD stays literal.
 * @param {string} src
 * @returns {string}
 */
export function mdToEditHtml(src) {
  return escapeHtml(String(src || ''))
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
  if (color) return `{#${color.slice(1)}}${inner}{/}`;
  if (tag === 'DIV' || tag === 'P') {
    return (afterSibling ? '\n' : '') + inner;
  }
  return inner;
}

/**
 * Contenteditable root → markdown with {#rrggbb}…{/} color marks.
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
