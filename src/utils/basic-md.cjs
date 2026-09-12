/**
 * Notes markdown subset — CommonJS for main-process print/export.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function colorMarkRe() {
  return /\{#([0-9a-fA-F]{6})\}(.*?)\{\/\}/gs;
}

function hlMarkRe() {
  return /\{hl:#([0-9a-fA-F]{6})\}(.*?)\{\/hl\}/gs;
}

/** Split trailing sentence punctuation off a URL match. */
function splitUrlPunct(raw) {
  const m = String(raw).match(/^(.*?)([.,;:!?)\]\}]*)$/);
  return { href: m[1], punct: m[2] };
}

/**
 * Wrap leftover bare http(s) URLs. Skip text already inside <a> or <code>.
 * @param {string} html
 * @returns {string}
 */
function autolinkHttp(html) {
  return String(html).replace(
    /(<a\b[^>]*>[\s\S]*?<\/a>)|(<code\b[^>]*>[\s\S]*?<\/code>)|(https?:\/\/[^\s<]+)/gi,
    (all, a, code, url) => {
      if (a) return a;
      if (code) return code;
      const { href, punct } = splitUrlPunct(url);
      if (!href) return all;
      return `<a class="md-pad__link" href="${href}">${href}</a>${punct}`;
    }
  );
}

function inline(s) {
  const formatted = escapeHtml(s)
    .replace(hlMarkRe(), '<span style="background-color:#$1">$2</span>')
    .replace(colorMarkRe(), '<span style="color:#$1">$2</span>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a class="md-pad__link" href="$2">$1</a>'
    );
  return autolinkHttp(formatted);
}

function renderBasicMd(src) {
  const lines = String(src || '').split('\n');
  const out = [];
  let listKind = null;

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

function mdToPlainText(src) {
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

module.exports = { renderBasicMd, mdToPlainText };
