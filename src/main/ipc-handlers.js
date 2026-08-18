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
const {
  createHabit,
  listHabits,
  getHabit,
  updateHabit,
  deleteHabit,
  archiveHabit,
  activateHabit,
  toggleCheckin,
} = require('../services/db/habits');
const {
  createBill,
  listBills,
  getBill,
  updateBill,
  markPaid,
  getBillAmountStats,
  listBillPayments,
  listBillPaymentFilterOptions,
  deleteBill,
  deleteBillPayment,
} = require('../services/db/bills');
const {
  createEvent,
  getEvent,
  listEventsForDay,
  listEventsInRange,
  updateEvent,
  deleteEvent,
} = require('../services/db/events');
const { syncMonth, removeSelection } = require('../services/db/calendar-sync');
const {
  createTransaction,
  listTransactions,
  getTransaction,
  listCategories,
  updateTransaction,
  deleteTransaction,
} = require('../services/db/transactions');
const { getTodayBrief } = require('../services/db/today');
const {
  addTag,
  listTags,
  listUserTagsWithCounts,
  listTagItems,
} = require('../services/db/tags');
const {
  setLocked,
  listExpired7,
  listCompleted,
  listArchive,
  getContainerCounts,
  archiveItem,
  restoreItem,
  deleteItem,
  bulkArchive,
  bulkRestore,
  bulkDelete,
  sweepContainers,
} = require('../services/db/containers');
const {
  createList,
  getList,
  listLists,
  renameList,
  deleteList,
  mergeLists,
  listItems,
  addListEntry,
  toggleListEntry,
  renameListEntry,
  removeListEntry,
  saveListDoc,
  exportList,
} = require('../services/db/lists');
const { runTagAudit } = require('./scheduler');
const { registerNotificationIpc } = require('./notification-window');
const { parseQuickAdd } = require('../utils/quick-add-parser');
const { runSearch, searchFilterOptions } = require('../services/db/search');
const {
  runBackup,
  getBackupStatus,
  setBackupPolicy,
  chooseDestAndCopy,
  pickRestoreFolder,
  restoreFromFolder,
} = require('./backup');

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

  ipcMain.handle('backup:now', async () => {
    try {
      return await runBackup({ kind: 'manual' });
    } catch (err) {
      logError('backup:now', err);
      throw err;
    }
  });

  ipcMain.handle('backup:status', () => {
    try {
      return getBackupStatus();
    } catch (err) {
      logError('backup:status', err);
      throw err;
    }
  });

  ipcMain.handle('backup:setPolicy', (_e, opts) => {
    try {
      return setBackupPolicy(opts || {});
    } catch (err) {
      logError('backup:setPolicy', err);
      throw err;
    }
  });

  ipcMain.handle('backup:chooseDest', async () => {
    try {
      return await chooseDestAndCopy();
    } catch (err) {
      logError('backup:chooseDest', err);
      throw err;
    }
  });

  ipcMain.handle('backup:pickRestore', async () => {
    try {
      return await pickRestoreFolder();
    } catch (err) {
      logError('backup:pickRestore', err);
      throw err;
    }
  });

  ipcMain.handle('backup:restore', async (_e, folderPath) => {
    try {
      return await restoreFromFolder(folderPath);
    } catch (err) {
      logError('backup:restore', err);
      throw err;
    }
  });

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
  ipcMain.handle('tasks:update', (_e, id, fields) => {
    const row = updateTask(id, fields);
    if (fields?.due_datetime !== undefined) {
      const { clearFiredSession } = require('./scheduler');
      clearFiredSession('task', id);
    }
    return row;
  });
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
    if (fields?.datetime !== undefined || fields?.nudge !== undefined || fields?.nudge_datetime !== undefined) {
      const { clearFiredSession } = require('./scheduler');
      clearFiredSession('reminder', id);
      clearFiredSession('reminder_nudge', id);
    }
    return row;
  });
  ipcMain.handle('reminders:complete', (_e, id) => completeReminder(id));
  ipcMain.handle('reminders:dismiss', (_e, id) => dismissReminder(id));
  ipcMain.handle('reminders:delete', (_e, id) => deleteReminder(id));

  // --- Habits ---
  ipcMain.handle('habits:list', (_e, opts) => listHabits(opts || {}));
  ipcMain.handle('habits:get', (_e, id) => getHabit(id));
  ipcMain.handle('habits:create', (_e, data) => createHabit(data));
  ipcMain.handle('habits:update', (_e, id, fields) => {
    const row = updateHabit(id, fields);
    if (fields?.nudge_time !== undefined) {
      const { clearFiredSession } = require('./scheduler');
      clearFiredSession('habit', id);
    }
    return row;
  });
  ipcMain.handle('habits:delete', (_e, id) => deleteHabit(id));
  ipcMain.handle('habits:archive', (_e, id) => archiveHabit(id));
  ipcMain.handle('habits:activate', (_e, id) => activateHabit(id));
  ipcMain.handle('habits:toggleCheckin', (_e, id, date) => toggleCheckin(id, date));

  // --- Bills ---
  ipcMain.handle('bills:list', (_e, opts) => listBills(opts || {}));
  ipcMain.handle('bills:get', (_e, id) => getBill(id));
  ipcMain.handle('bills:create', (_e, data) => createBill(data));
  ipcMain.handle('bills:update', (_e, id, fields) => {
    const row = updateBill(id, fields);
    if (fields?.due_date !== undefined) {
      const { clearFiredSession } = require('./scheduler');
      clearFiredSession('bill', id);
    }
    return row;
  });
  ipcMain.handle('bills:markPaid', (_e, id, opts) => markPaid(id, opts || {}));
  ipcMain.handle('bills:amountStats', (_e, name) => getBillAmountStats(name));
  ipcMain.handle('bills:listPayments', (_e, opts) => listBillPayments(opts || {}));
  ipcMain.handle('bills:paymentFilterOptions', () => listBillPaymentFilterOptions());
  ipcMain.handle('bills:delete', (_e, id) => deleteBill(id));
  ipcMain.handle('bills:deletePayment', (_e, id) => deleteBillPayment(id));

  // --- Events / Calendar ---
  ipcMain.handle('events:get', (_e, id) => getEvent(id));
  ipcMain.handle('events:listDay', (_e, day) => listEventsForDay(day));
  ipcMain.handle('events:listRange', (_e, start, end) =>
    listEventsInRange(start, end)
  );
  ipcMain.handle('events:create', (_e, data) => createEvent(data));
  ipcMain.handle('events:update', (_e, id, fields) => updateEvent(id, fields));
  ipcMain.handle('events:delete', (_e, id) => deleteEvent(id));
  ipcMain.handle('events:syncMonth', (_e, year, monthIndex) =>
    syncMonth(year, monthIndex)
  );
  ipcMain.handle('events:removeSelection', (_e, ids, opts) =>
    removeSelection(ids, opts || {})
  );

  // --- Transactions / Spending ---
  ipcMain.handle('tx:list', (_e, opts) => listTransactions(opts || {}));
  ipcMain.handle('tx:get', (_e, id) => getTransaction(id));
  ipcMain.handle('tx:categories', () => listCategories());
  ipcMain.handle('tx:create', (_e, data) => createTransaction(data));
  ipcMain.handle('tx:update', (_e, id, fields) => updateTransaction(id, fields));
  ipcMain.handle('tx:delete', (_e, id) => deleteTransaction(id));

  ipcMain.handle('tags:list', (_e, opts) => listTags(opts || {}));
  ipcMain.handle('tags:catalog', () => listUserTagsWithCounts());
  ipcMain.handle('tags:items', (_e, tagName, opts) =>
    listTagItems(tagName, opts || {})
  );

  // --- Cleanup containers + padlock ---
  ipcMain.handle('containers:listExpired7', () => listExpired7());
  ipcMain.handle('containers:listCompleted', (_e, opts) => listCompleted(opts || {}));
  ipcMain.handle('containers:listArchive', () => listArchive());
  ipcMain.handle('containers:counts', () => getContainerCounts());
  ipcMain.handle('containers:archive', (_e, itemType, id) => archiveItem(itemType, id));
  ipcMain.handle('containers:restore', (_e, itemType, id, from) =>
    restoreItem(itemType, id, from)
  );
  ipcMain.handle('containers:delete', (_e, itemType, id) => deleteItem(itemType, id));
  ipcMain.handle('containers:bulkArchive', (_e, payload) => bulkArchive(payload || {}));
  ipcMain.handle('containers:bulkRestore', (_e, payload) => bulkRestore(payload || {}));
  ipcMain.handle('containers:bulkDelete', (_e, payload) => bulkDelete(payload || {}));
  ipcMain.handle('containers:sweep', () => sweepContainers());
  ipcMain.handle('items:setLocked', (_e, itemType, id, locked) =>
    setLocked(itemType, id, locked)
  );

  // --- Lists ---
  ipcMain.handle('lists:list', (_e, opts) => listLists(opts || {}));
  ipcMain.handle('lists:get', (_e, id) => getList(id));
  ipcMain.handle('lists:create', (_e, data) => createList(data));
  ipcMain.handle('lists:rename', (_e, id, name) => renameList(id, name));
  ipcMain.handle('lists:delete', (_e, id) => deleteList(id));
  ipcMain.handle('lists:merge', (_e, sourceId, targetId) =>
    mergeLists(sourceId, targetId)
  );
  ipcMain.handle('lists:items', (_e, id) => listItems(id));
  ipcMain.handle('lists:addEntry', (_e, listId, title) => addListEntry(listId, title));
  ipcMain.handle('lists:toggleEntry', (_e, id, done) => toggleListEntry(id, done));
  ipcMain.handle('lists:renameEntry', (_e, id, title) => renameListEntry(id, title));
  ipcMain.handle('lists:removeEntry', (_e, id) => removeListEntry(id));
  ipcMain.handle('lists:saveDoc', (_e, id, payload) => saveListDoc(id, payload || {}));
  ipcMain.handle('lists:export', (_e, id) => exportList(id));

  ipcMain.handle('search:query', (_e, opts) => runSearch(opts || {}));
  ipcMain.handle('search:filterOptions', (_e, scope) =>
    searchFilterOptions(scope || {})
  );

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
      if (parsed.type === 'reminder') {
        const rem = createReminder(parsed.payload);
        for (const t of parsed.tags) addTag('reminder', rem.id, t);
        return { type: 'reminder', item: getReminder(rem.id) };
      }
      if (parsed.type === 'transaction') {
        const tx = createTransaction(parsed.payload);
        return { type: 'transaction', item: tx };
      }
      if (parsed.type === 'habit') {
        const habit = createHabit({
          ...parsed.payload,
          tags: parsed.tags,
        });
        return { type: 'habit', item: habit };
      }
      throw new Error(`Unknown quick-add type: ${parsed.type}`);
    } catch (err) {
      logError('quickAdd:submit', err);
      throw err;
    }
  });
}

module.exports = { registerIpcHandlers };
