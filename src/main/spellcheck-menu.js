/**
 * Native RMB on editable fields: OS spell suggestions + standard edit roles.
 * Skip non-editable targets so renderer menus (Calendar, Lists) stay exclusive.
 */
const { Menu } = require('electron');

/**
 * Attach Chromium context-menu handler to a BrowserWindow.
 * @param {Electron.BrowserWindow} win
 */
function attachSpellcheckMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;

    /** @type {Electron.MenuItemConstructorOptions[]} */
    const items = [];
    const misspelled = params.misspelledWord;
    const suggestions = params.dictionarySuggestions || [];

    for (const word of suggestions) {
      items.push({
        label: word,
        click: () => win.webContents.replaceMisspelling(word),
      });
    }

    if (misspelled) {
      if (items.length) items.push({ type: 'separator' });
      items.push({
        label: `Add “${misspelled}” to dictionary`,
        click: () =>
          win.webContents.session.addWordToSpellCheckerDictionary(misspelled),
      });
    }

    if (items.length) items.push({ type: 'separator' });
    items.push(
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    );

    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

module.exports = { attachSpellcheckMenu };
