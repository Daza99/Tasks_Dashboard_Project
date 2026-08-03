/**
 * Register IPC handlers — renderer never touches SQL/FS directly.
 */
const { ipcMain } = require('electron');
const {
  getAllSettings,
  setSetting,
  getActiveTheme,
  setThemeBase,
} = require('./database');
const { getDataDir } = require('./portable-paths');
const { logError } = require('./logger');
const {
  createTask,
  listTasks,
  getTask,
  updateTask,
  completeTask,
  deleteTask,
} = require('../services/db/tasks');
const {
  createReminder,
  listReminders,
  getReminder,
  updateReminder,
  completeReminder,
  dismissReminder,
  deleteReminder,
} = require('../services/db/reminders');
const { getTodayBrief } = require('../services/db/today');
const { addTag } = require('../services/db/tags');
const { runTagAudit } = require('./scheduler');
const { registerNotificationIpc } = require('./notification-window');
const { parseQuickAdd } = require('../utils/quick-add-parser');

function registerIpcHandlers() {
  registerNotificationIpc();

  ipcMain.handle('settings:getAll', () => {
    try {
      return getAllSettings();
    } catch (err) {
      logError('settings:getAll', err);
      throw err;
    }
  });

  ipcMain.handle('settings:set', (_e, key, value) => {
    try {
      setSetting(key, value);
      return getAllSettings();
    } catch (err) {
      logError('settings:set', err);
      throw err;
    }
  });

  ipcMain.handle('theme:getActive', () => {
    try {
      return getActiveTheme();
    } catch (err) {
      logError('theme:getActive', err);
      throw err;
    }
  });

  ipcMain.handle('theme:setBase', (_e, base) => {
    try {
      return setThemeBase(base);
    } catch (err) {
      logError('theme:setBase', err);
      throw err;
    }
  });

  ipcMain.handle('app:getPaths', () => ({
    dataDir: getDataDir(),
  }));

  ipcMain.handle('app:health', () => ({
    ok: true,
    offline: true,
  }));

  // --- Tasks ---
  ipcMain.handle('tasks:list', (_e, opts) => listTasks(opts || {}));
  ipcMain.handle('tasks:get', (_e, id) => getTask(id));
  ipcMain.handle('tasks:create', (_e, data) => {
    const task = createTask(data);
    if (data.tags?.length) {
      for (const t of data.tags) addTag('task', task.id, t);
    }
    return getTask(task.id);
  });
  ipcMain.handle('tasks:update', (_e, id, fields) => updateTask(id, fields));
  ipcMain.handle('tasks:complete', (_e, id) => completeTask(id));
  ipcMain.handle('tasks:delete', (_e, id) => deleteTask(id));

  // --- Reminders ---
  ipcMain.handle('reminders:list', (_e, opts) => listReminders(opts || {}));
  ipcMain.handle('reminders:get', (_e, id) => getReminder(id));
  ipcMain.handle('reminders:create', (_e, data) => {
    const rem = createReminder(data);
    if (data.tags?.length) {
      for (const t of data.tags) addTag('reminder', rem.id, t);
    }
    return getReminder(rem.id);
  });
  ipcMain.handle('reminders:update', (_e, id, fields) => {
    const row = updateReminder(id, fields);
    if (fields?.datetime !== undefined) {
      const { clearFiredSession } = require('./scheduler');
      clearFiredSession(id);
    }
    return row;
  });
  ipcMain.handle('reminders:complete', (_e, id) => completeReminder(id));
  ipcMain.handle('reminders:dismiss', (_e, id) => dismissReminder(id));
  ipcMain.handle('reminders:delete', (_e, id) => deleteReminder(id));

  // --- Today + Quick Add ---
  ipcMain.handle('today:getBrief', () => getTodayBrief());
  ipcMain.handle('today:runAudit', () => runTagAudit());

  ipcMain.handle('quickAdd:submit', (_e, text) => {
    try {
      const parsed = parseQuickAdd(text);
      if (parsed.type === 'task') {
        const task = createTask(parsed.payload);
        for (const t of parsed.tags) addTag('task', task.id, t);
        return { type: 'task', item: getTask(task.id) };
      }
      const rem = createReminder(parsed.payload);
      for (const t of parsed.tags) addTag('reminder', rem.id, t);
      return { type: 'reminder', item: getReminder(rem.id) };
    } catch (err) {
      logError('quickAdd:submit', err);
      throw err;
    }
  });
}

module.exports = { registerIpcHandlers };
