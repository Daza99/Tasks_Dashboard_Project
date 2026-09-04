/**
 * Register IPC handlers — renderer never touches SQL/FS directly.
 */
const { ipcMain } = require('electron');
const {
  getAllSettings,
  setSetting,
  getActiveTheme,
  setThemeBase,
  listCustomThemes,
  saveCustomTheme,
  getThemeDefaults,
  resetThemeDefaults,
  listWallpaperColors,
  saveWallpaperColor,
  resetWallpaperDefaults,
} = require('./database');
const { getPathInfo } = require('./portable-paths');
const { logError } = require('./logger');
const {
  createTask,
  listTasks,
  getTask,
  updateTask,
  completeTask,
  deleteTask,
  deleteTasks,
} = require('../services/db/tasks');
const {
  createReminder,
  listReminders,
  getReminder,
  updateReminder,
  completeReminder,
  dismissReminder,
  deleteReminder,
  deleteReminders,
} = require('../services/db/reminders');
const {
  createHabit,
  listHabits,
  getHabit,
  updateHabit,
  deleteHabit,
  deleteHabits,
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
  deleteBills,
  deleteBillPayment,
  deleteBillPayments,
  listBillCategories,
  createBillCategory,
  countBillsWithCategory,
  renameBillCategory,
  deleteBillCategory,
  mergeBillCategories,
} = require('../services/db/bills');
const {
  createEvent,
  getEvent,
  listEventsForDay,
  listEventsInRange,
  listCalendarYearOptions,
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
  deleteTransactions,
} = require('../services/db/transactions');
const { getTodayBrief } = require('../services/db/today');
const {
  addTag,
  listTags,
  listUserTagsWithCounts,
  listTagItems,
  renameUserTag,
  deleteUserTag,
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
  createNote,
  getNote,
  listNotes,
  updateNote,
  saveNoteDoc,
  deleteNote,
  deleteNotes,
  listNoteCategories,
  createNoteCategory,
} = require('../services/db/notes');
const {
  createList,
  getList,
  listLists,
  renameList,
  updateList,
  setListTags,
  deleteList,
  deleteLists,
  mergeLists,
  listItems,
  addListEntry,
  toggleListEntry,
  renameListEntry,
  removeListEntry,
  saveListDoc,
  exportList,
} = require('../services/db/lists');
const { readWhitelist, appendHashtag } = require('../services/list-hashtags');
const {
  createTracker,
  getTracker,
  listTrackers,
  updateTracker,
  deleteTracker,
  deleteTrackers,
  logValue,
  undoLastLog,
  timerStart,
  timerPause,
  timerReset,
  resetTracker,
  listDueThisPeriod,
} = require('../services/db/trackers');
const { inspectTags, listInspectLog } = require('../services/db/tag-inspector');
const {
  registerNotificationIpc,
  refreshOpenNotifications,
} = require('./notification-window');
const {
  registerTrackerPopoutIpc,
  openTrackerPopout,
  closeTrackerPopout,
  broadcastTrackersChanged,
  ensureTick,
} = require('./tracker-popout');
const { registerNotePopoutIpc, closeNotePopoutById } = require('./note-popout');
const { printNote, exportNote } = require('./notes-export');
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
const { chooseDataDir, migrateDataDir, resetDataDir } = require('./data-dir-migrate');

function registerIpcHandlers() {
  registerNotificationIpc();
  registerTrackerPopoutIpc();
  registerNotePopoutIpc();

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

  ipcMain.handle('theme:listCustom', () => {
    try {
      return listCustomThemes();
    } catch (err) {
      logError('theme:listCustom', err);
      throw err;
    }
  });

  ipcMain.handle('theme:saveCustom', (_e, payload) => {
    try {
      return saveCustomTheme(payload || {});
    } catch (err) {
      logError('theme:saveCustom', err);
      throw err;
    }
  });

  ipcMain.handle('theme:getDefaults', (_e, base) => {
    try {
      return getThemeDefaults(base);
    } catch (err) {
      logError('theme:getDefaults', err);
      throw err;
    }
  });

  ipcMain.handle('theme:resetDefaults', () => {
    try {
      return resetThemeDefaults();
    } catch (err) {
      logError('theme:resetDefaults', err);
      throw err;
    }
  });

  ipcMain.handle('wallpaper:listColors', () => {
    try {
      return listWallpaperColors();
    } catch (err) {
      logError('wallpaper:listColors', err);
      throw err;
    }
  });

  ipcMain.handle('wallpaper:saveColor', (_e, payload) => {
    try {
      return saveWallpaperColor(payload || {});
    } catch (err) {
      logError('wallpaper:saveColor', err);
      throw err;
    }
  });

  ipcMain.handle('wallpaper:resetDefaults', () => {
    try {
      return resetWallpaperDefaults();
    } catch (err) {
      logError('wallpaper:resetDefaults', err);
      throw err;
    }
  });

  ipcMain.handle('app:getPaths', () => getPathInfo());

  ipcMain.handle('app:health', () => ({
    ok: true,
    offline: true,
  }));

  ipcMain.handle('dataDir:choose', async () => {
    try {
      return await chooseDataDir();
    } catch (err) {
      logError('dataDir:choose', err);
      throw err;
    }
  });

  ipcMain.handle('dataDir:migrate', async (_e, dest, opts) => {
    try {
      return await migrateDataDir(dest, opts || {});
    } catch (err) {
      logError('dataDir:migrate', err);
      throw err;
    }
  });

  ipcMain.handle('dataDir:reset', async () => {
    try {
      return await resetDataDir();
    } catch (err) {
      logError('dataDir:reset', err);
      throw err;
    }
  });

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
    refreshOpenNotifications('task', id);
    return row;
  });
  ipcMain.handle('tasks:complete', (_e, id) => completeTask(id));
  ipcMain.handle('tasks:delete', (_e, id) => deleteTask(id));
  ipcMain.handle('tasks:deleteMany', (_e, ids) => deleteTasks(ids || []));

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
    refreshOpenNotifications('reminder', id);
    return row;
  });
  ipcMain.handle('reminders:complete', (_e, id) => completeReminder(id));
  ipcMain.handle('reminders:dismiss', (_e, id) => dismissReminder(id));
  ipcMain.handle('reminders:delete', (_e, id) => deleteReminder(id));
  ipcMain.handle('reminders:deleteMany', (_e, ids) => deleteReminders(ids || []));

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
    refreshOpenNotifications('habit', id);
    return row;
  });
  ipcMain.handle('habits:delete', (_e, id) => deleteHabit(id));
  ipcMain.handle('habits:deleteMany', (_e, ids) => deleteHabits(ids || []));
  ipcMain.handle('habits:archive', (_e, id) => archiveHabit(id));
  ipcMain.handle('habits:activate', (_e, id) => activateHabit(id));
  ipcMain.handle('habits:toggleCheckin', (_e, id, date) => toggleCheckin(id, date));

  // --- Trackers ---
  ipcMain.handle('trackers:list', () => listTrackers());
  ipcMain.handle('trackers:get', (_e, id) => getTracker(id));
  ipcMain.handle('trackers:create', (_e, data) => {
    const row = createTracker(data || {});
    if (row?.kind === 'countdown') ensureTick();
    broadcastTrackersChanged(row?.id);
    return row;
  });
  ipcMain.handle('trackers:update', (_e, id, fields) => {
    const row = updateTracker(id, fields || {});
    broadcastTrackersChanged(id);
    refreshOpenNotifications('tracker', id);
    return row;
  });
  ipcMain.handle('trackers:delete', (_e, id) => {
    const ok = deleteTracker(id);
    broadcastTrackersChanged(id);
    return ok;
  });
  ipcMain.handle('trackers:deleteMany', (_e, ids) => {
    const n = deleteTrackers(ids || []);
    // No id → refresh all popouts; missing rows close themselves
    broadcastTrackersChanged();
    return n;
  });
  ipcMain.handle('trackers:log', (_e, id, value) => {
    const row = logValue(id, value);
    broadcastTrackersChanged(id);
    return row;
  });
  ipcMain.handle('trackers:undo', (_e, id) => {
    const row = undoLastLog(id);
    broadcastTrackersChanged(id);
    return row;
  });
  ipcMain.handle('trackers:timerStart', (_e, id) => {
    const row = timerStart(id);
    if (row?.kind === 'countdown') ensureTick();
    broadcastTrackersChanged(id);
    return row;
  });
  ipcMain.handle('trackers:timerPause', (_e, id) => {
    const row = timerPause(id);
    broadcastTrackersChanged(id);
    return row;
  });
  ipcMain.handle('trackers:timerReset', (_e, id) => {
    const row = timerReset(id);
    broadcastTrackersChanged(id);
    return row;
  });
  ipcMain.handle('trackers:reset', (_e, id) => {
    const row = resetTracker(id);
    broadcastTrackersChanged(id);
    return row;
  });
  ipcMain.handle('trackers:due', () => listDueThisPeriod());
  ipcMain.handle('trackers:popoutOpen', (_e, id) => openTrackerPopout(id));
  ipcMain.handle('trackers:popoutClose', (_e, id) => closeTrackerPopout(id));

  // --- Bills ---
  ipcMain.handle('bills:list', (_e, opts) => listBills(opts || {}));
  ipcMain.handle('bills:get', (_e, id) => getBill(id));
  ipcMain.handle('bills:create', (_e, data) => createBill(data));
  ipcMain.handle('bills:update', (_e, id, fields) => {
    const row = updateBill(id, fields);
    if (
      fields?.due_date !== undefined ||
      fields?.nudge !== undefined ||
      fields?.nudge_datetime !== undefined ||
      fields?.nudge_mode !== undefined ||
      fields?.date_offset_days !== undefined ||
      fields?.remind_days_before !== undefined
    ) {
      const { clearFiredSession } = require('./scheduler');
      clearFiredSession('bill', id);
      clearFiredSession('bill', `${id}:due`);
      clearFiredSession('bill', `${id}:before`);
      clearFiredSession('bill_nudge', id);
    }
    refreshOpenNotifications('bill', id);
    return row;
  });
  ipcMain.handle('bills:markPaid', (_e, id, opts) => {
    const row = markPaid(id, opts || {});
    const { clearFiredSession } = require('./scheduler');
    clearFiredSession('bill', id);
    clearFiredSession('bill', `${id}:due`);
    clearFiredSession('bill', `${id}:before`);
    clearFiredSession('bill_nudge', id);
    return row;
  });
  ipcMain.handle('bills:amountStats', (_e, name) => getBillAmountStats(name));
  ipcMain.handle('bills:listPayments', (_e, opts) => listBillPayments(opts || {}));
  ipcMain.handle('bills:paymentFilterOptions', () => listBillPaymentFilterOptions());
  ipcMain.handle('bills:delete', (_e, id) => deleteBill(id));
  ipcMain.handle('bills:deleteMany', (_e, ids) => deleteBills(ids || []));
  ipcMain.handle('bills:deletePayment', (_e, id) => deleteBillPayment(id));
  ipcMain.handle('bills:deletePaymentsMany', (_e, ids) =>
    deleteBillPayments(ids || [])
  );
  ipcMain.handle('bills:categories', () => listBillCategories());
  ipcMain.handle('bills:createCategory', (_e, name) => createBillCategory(name));
  ipcMain.handle('bills:countCategory', (_e, name) => countBillsWithCategory(name));
  ipcMain.handle('bills:renameCategory', (_e, from, to) =>
    renameBillCategory(from, to)
  );
  ipcMain.handle('bills:deleteCategory', (_e, name) => deleteBillCategory(name));
  ipcMain.handle('bills:mergeCategories', (_e, keep, mergeAway) =>
    mergeBillCategories(keep, mergeAway)
  );

  // --- Events / Calendar ---
  ipcMain.handle('events:get', (_e, id) => getEvent(id));
  ipcMain.handle('events:listDay', (_e, day) => listEventsForDay(day));
  ipcMain.handle('events:listRange', (_e, start, end) =>
    listEventsInRange(start, end)
  );
  ipcMain.handle('events:yearOptions', (_e, visitedYear) =>
    listCalendarYearOptions(visitedYear)
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
  ipcMain.handle('tx:deleteMany', (_e, ids) => deleteTransactions(ids || []));

  ipcMain.handle('tags:list', (_e, opts) => listTags(opts || {}));
  ipcMain.handle('tags:catalog', () => listUserTagsWithCounts());
  ipcMain.handle('tags:items', (_e, tagName, opts) =>
    listTagItems(tagName, opts || {})
  );
  ipcMain.handle('tags:inspect', () => inspectTags('manual'));
  ipcMain.handle('tags:inspectLog', (_e, opts) => listInspectLog(opts || {}));
  ipcMain.handle('tags:rename', (_e, id, newName) => renameUserTag(id, newName));
  ipcMain.handle('tags:delete', (_e, id) => deleteUserTag(id));

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
  ipcMain.handle('lists:update', (_e, id, fields) => updateList(id, fields || {}));
  ipcMain.handle('lists:setTags', (_e, id, tags) => setListTags(id, tags));
  ipcMain.handle('lists:delete', (_e, id) => deleteList(id));
  ipcMain.handle('lists:deleteMany', (_e, ids) => deleteLists(ids || []));
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
  ipcMain.handle('lists:hashtagWhitelist', () => readWhitelist());
  ipcMain.handle('lists:appendHashtag', (_e, name) => appendHashtag(name));

  // --- Notes ---
  ipcMain.handle('notes:list', (_e, opts) => listNotes(opts || {}));
  ipcMain.handle('notes:get', (_e, id) => getNote(id));
  ipcMain.handle('notes:create', (_e, data) => createNote(data || {}));
  ipcMain.handle('notes:update', (_e, id, fields) => updateNote(id, fields || {}));
  ipcMain.handle('notes:saveDoc', (_e, id, payload) => saveNoteDoc(id, payload || {}));
  ipcMain.handle('notes:delete', (_e, id) => {
    closeNotePopoutById(id);
    return deleteNote(id);
  });
  ipcMain.handle('notes:deleteMany', (_e, ids) => {
    const list = Array.isArray(ids) ? ids : [];
    for (const id of list) closeNotePopoutById(id);
    return deleteNotes(list);
  });
  ipcMain.handle('notes:categories', () => listNoteCategories());
  ipcMain.handle('notes:createCategory', (_e, name) => createNoteCategory(name));
  ipcMain.handle('notes:export', (_e, id, format) => exportNote(id, format));
  ipcMain.handle('notes:print', (_e, id) => printNote(id));

  ipcMain.handle('search:query', (_e, opts) => runSearch(opts || {}));
  ipcMain.handle('search:filterOptions', (_e, scope) =>
    searchFilterOptions(scope || {})
  );

  // --- Today + Quick Add ---
  ipcMain.handle('today:getBrief', () => getTodayBrief());
  ipcMain.handle('today:runAudit', () => inspectTags('manual'));

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
