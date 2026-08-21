/**
 * Notes print + export (.md / .txt / .pdf). Main process only.
 */
const fs = require('fs');
const path = require('path');
const { BrowserWindow, dialog } = require('electron');
const { getDataDir } = require('./portable-paths');
const { logError } = require('./logger');
const { getNote } = require('../services/db/notes');
const { renderBasicMd, mdToPlainText } = require('../utils/basic-md.cjs');

const FONT_CSS = {
  outfit: '"Outfit", "Segoe UI", sans-serif',
  serif: '"Source Serif 4", Georgia, serif',
  mono: '"IBM Plex Mono", Consolas, monospace',
  segoe: '"Segoe UI", sans-serif',
};

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function slugTitle(title) {
  const s = String(title || 'note')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return s || 'note';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function exportsDir() {
  const dir = path.join(getDataDir(), 'exports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dialogParent() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined;
}

function buildPrintHtml(note) {
  const style = note.style || {};
  const font = FONT_CSS[style.fontFamily] || FONT_CSS.segoe;
  const size = Number(style.fontSize) || 16;
  const color = style.fontColor || '#111111';
  const bg = style.bgColor || '#ffffff';
  const body = renderBasicMd(note.content || '');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(note.title)}</title>
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${font};
    font-size: ${size}px;
    color: ${color};
    background: ${bg};
    padding: 28px 32px;
    line-height: 1.45;
  }
  h1.note-print-title { font-size: 1.4em; margin: 0 0 16px; }
  h1 { font-size: 1.4em; margin: 0 0 8px; }
  h2 { font-size: 1.15em; margin: 0 0 8px; }
  h3 { font-size: 1.05em; margin: 0 0 8px; }
  p, ul, ol { margin: 0 0 8px; }
  code { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 0.9em; }
</style></head>
<body>
  <h1 class="note-print-title">${escapeHtml(note.title)}</h1>
  ${body}
</body></html>`;
}

function defaultPath(note, ext) {
  return path.join(exportsDir(), `${slugTitle(note.title)}_${todayKey()}.${ext}`);
}

async function pickSavePath(note, ext, label) {
  const result = await dialog.showSaveDialog(dialogParent(), {
    title: `Export ${label}`,
    defaultPath: defaultPath(note, ext),
    filters: [{ name: label, extensions: [ext] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

/** Load HTML in a hidden window; resolves when ready. */
function loadPrintWindow(html) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 800,
      height: 1100,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    const tmp = path.join(exportsDir(), `_note_print_${Date.now()}.html`);
    try {
      fs.writeFileSync(tmp, html, 'utf8');
    } catch (err) {
      win.destroy();
      reject(err);
      return;
    }
    win.on('closed', () => {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    });
    win.webContents.once('did-finish-load', () => resolve({ win, tmp }));
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      win.destroy();
      reject(new Error(desc || String(code)));
    });
    win.loadFile(tmp);
  });
}

async function printNote(id) {
  try {
    const note = getNote(id);
    if (!note) throw new Error('Note not found');
    const { win } = await loadPrintWindow(buildPrintHtml(note));
    return await new Promise((resolve) => {
      win.webContents.print({ silent: false, printBackground: true }, (ok, err) => {
        if (!win.isDestroyed()) win.destroy();
        if (!ok && err) logError('printNote', new Error(String(err)));
        resolve({ ok: Boolean(ok) });
      });
    });
  } catch (err) {
    logError('printNote', err);
    throw err;
  }
}

/**
 * Export a note. format: md | txt | pdf
 * @returns {{ ok: boolean, cancelled?: boolean, path?: string }}
 */
async function exportNote(id, format) {
  try {
    const note = getNote(id);
    if (!note) throw new Error('Note not found');
    const fmt = String(format || '').toLowerCase();
    if (fmt === 'md') {
      const dest = await pickSavePath(note, 'md', 'Markdown');
      if (!dest) return { ok: false, cancelled: true };
      fs.writeFileSync(dest, note.content || '', 'utf8');
      return { ok: true, path: dest };
    }
    if (fmt === 'txt') {
      const dest = await pickSavePath(note, 'txt', 'Text');
      if (!dest) return { ok: false, cancelled: true };
      fs.writeFileSync(dest, mdToPlainText(note.content || ''), 'utf8');
      return { ok: true, path: dest };
    }
    if (fmt === 'pdf') {
      const dest = await pickSavePath(note, 'pdf', 'PDF');
      if (!dest) return { ok: false, cancelled: true };
      const { win } = await loadPrintWindow(buildPrintHtml(note));
      const buf = await win.webContents.printToPDF({ printBackground: true });
      if (!win.isDestroyed()) win.destroy();
      fs.writeFileSync(dest, buf);
      return { ok: true, path: dest };
    }
    throw new Error('Unknown export format');
  } catch (err) {
    logError('exportNote', err);
    throw err;
  }
}

module.exports = { printNote, exportNote };
