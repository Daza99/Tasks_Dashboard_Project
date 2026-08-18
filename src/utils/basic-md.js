/**
 * Tiny markdown subset for MD list preview. Escape first, then format.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Inline: code, bold, italic, links (display only — no navigation). */
function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<span class="md-pad__link">$1</span>');
}

/**
 * Render basic MD: # / ##, **bold**, *italic*, `-`/`*` lists, `code`, [text](http).
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
