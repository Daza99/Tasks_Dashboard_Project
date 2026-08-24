/**
 * Preload — expose a narrow API via contextBridge.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getActiveTheme: () => ipcRenderer.invoke('theme:getActive'),
  setThemeBase: (base) => ipcRenderer.invoke('theme:setBase', base),
  listCustomThemes: () => ipcRenderer.invoke('theme:listCustom'),
  saveCustomTheme: (payload) => ipcRenderer.invoke('theme:saveCustom', payload),
  getThemeDefaults: (base) => ipcRenderer.invoke('theme:getDefaults', base),
  resetThemeDefaults: () => ipcRenderer.invoke('theme:resetDefaults'),
  listWallpaperColors: () => ipcRenderer.invoke('wallpaper:listColors'),
  saveWallpaperColor: (payload) => ipcRenderer.invoke('wallpaper:saveColor', payload),
  resetWallpaperDefaults: () => ipcRenderer.invoke('wallpaper:resetDefaults'),
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  health: () => ipcRenderer.invoke('app:health'),
  chooseDataDir: () => ipcRenderer.invoke('dataDir:choose'),
  migrateDataDir: (dest, opts) => ipcRenderer.invoke('dataDir:migrate', dest, opts),
  resetDataDir: () => ipcRenderer.invoke('dataDir:reset'),

  backupNow: () => ipcRenderer.invoke('backup:now'),
  backupStatus: () => ipcRenderer.invoke('backup:status'),
  backupSetPolicy: (opts) => ipcRenderer.invoke('backup:setPolicy', opts),
  backupChooseDest: () => ipcRenderer.invoke('backup:chooseDest'),
  backupPickRestore: () => ipcRenderer.invoke('backup:pickRestore'),
  backupRestore: (folderPath) => ipcRenderer.invoke('backup:restore', folderPath),
  onBackupStarted: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('backup:started', listener);
    return () => ipcRenderer.removeListener('backup:started', listener);
  },
  onBackupEnded: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('backup:ended', listener);
    return () => ipcRenderer.removeListener('backup:ended', listener);
  },
  onBackupDidRun: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('backup:didRun', listener);
    return () => ipcRenderer.removeListener('backup:didRun', listener);
  },

  listTasks: (opts) => ipcRenderer.invoke('tasks:list', opts),
  getTask: (id) => ipcRenderer.invoke('tasks:get', id),
  createTask: (data) => ipcRenderer.invoke('tasks:create', data),
  updateTask: (id, fields) => ipcRenderer.invoke('tasks:update', id, fields),
  completeTask: (id) => ipcRenderer.invoke('tasks:complete', id),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),

  listReminders: (opts) => ipcRenderer.invoke('reminders:list', opts),
  getReminder: (id) => ipcRenderer.invoke('reminders:get', id),
  createReminder: (data) => ipcRenderer.invoke('reminders:create', data),
  updateReminder: (id, fields) => ipcRenderer.invoke('reminders:update', id, fields),
  completeReminder: (id) => ipcRenderer.invoke('reminders:complete', id),
  dismissReminder: (id) => ipcRenderer.invoke('reminders:dismiss', id),
  deleteReminder: (id) => ipcRenderer.invoke('reminders:delete', id),

  listHabits: (opts) => ipcRenderer.invoke('habits:list', opts),
  getHabit: (id) => ipcRenderer.invoke('habits:get', id),
  createHabit: (data) => ipcRenderer.invoke('habits:create', data),
  updateHabit: (id, fields) => ipcRenderer.invoke('habits:update', id, fields),
  deleteHabit: (id) => ipcRenderer.invoke('habits:delete', id),
  archiveHabit: (id) => ipcRenderer.invoke('habits:archive', id),
  activateHabit: (id) => ipcRenderer.invoke('habits:activate', id),
  toggleCheckin: (id, date) => ipcRenderer.invoke('habits:toggleCheckin', id, date),

  listTrackers: () => ipcRenderer.invoke('trackers:list'),
  getTracker: (id) => ipcRenderer.invoke('trackers:get', id),
  createTracker: (data) => ipcRenderer.invoke('trackers:create', data),
  updateTracker: (id, fields) => ipcRenderer.invoke('trackers:update', id, fields),
  deleteTracker: (id) => ipcRenderer.invoke('trackers:delete', id),
  deleteTrackers: (ids) => ipcRenderer.invoke('trackers:deleteMany', ids),
  logTracker: (id, value) => ipcRenderer.invoke('trackers:log', id, value),
  undoTrackerLog: (id) => ipcRenderer.invoke('trackers:undo', id),
  trackerTimerStart: (id) => ipcRenderer.invoke('trackers:timerStart', id),
  trackerTimerPause: (id) => ipcRenderer.invoke('trackers:timerPause', id),
  trackerTimerReset: (id) => ipcRenderer.invoke('trackers:timerReset', id),
  resetTracker: (id) => ipcRenderer.invoke('trackers:reset', id),
  listTrackersDue: () => ipcRenderer.invoke('trackers:due'),
  openTrackerPopout: (id) => ipcRenderer.invoke('trackers:popoutOpen', id),
  onTrackersChanged: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('trackers:changed', listener);
    return () => ipcRenderer.removeListener('trackers:changed', listener);
  },

  listBills: (opts) => ipcRenderer.invoke('bills:list', opts),
  getBill: (id) => ipcRenderer.invoke('bills:get', id),
  createBill: (data) => ipcRenderer.invoke('bills:create', data),
  updateBill: (id, fields) => ipcRenderer.invoke('bills:update', id, fields),
  markBillPaid: (id, opts) => ipcRenderer.invoke('bills:markPaid', id, opts),
  getBillAmountStats: (name) => ipcRenderer.invoke('bills:amountStats', name),
  listBillPayments: (opts) => ipcRenderer.invoke('bills:listPayments', opts),
  listBillPaymentFilterOptions: () =>
    ipcRenderer.invoke('bills:paymentFilterOptions'),
  deleteBill: (id) => ipcRenderer.invoke('bills:delete', id),
  deleteBillPayment: (id) => ipcRenderer.invoke('bills:deletePayment', id),

  getEvent: (id) => ipcRenderer.invoke('events:get', id),
  listEventsDay: (day) => ipcRenderer.invoke('events:listDay', day),
  listEventsRange: (start, end) => ipcRenderer.invoke('events:listRange', start, end),
  createEvent: (data) => ipcRenderer.invoke('events:create', data),
  updateEvent: (id, fields) => ipcRenderer.invoke('events:update', id, fields),
  deleteEvent: (id) => ipcRenderer.invoke('events:delete', id),
  syncCalendarMonth: (year, monthIndex) =>
    ipcRenderer.invoke('events:syncMonth', year, monthIndex),
  removeCalendarSelection: (ids, opts) =>
    ipcRenderer.invoke('events:removeSelection', ids, opts),

  listTransactions: (opts) => ipcRenderer.invoke('tx:list', opts),
  getTransaction: (id) => ipcRenderer.invoke('tx:get', id),
  listCategories: () => ipcRenderer.invoke('tx:categories'),
  createTransaction: (data) => ipcRenderer.invoke('tx:create', data),
  updateTransaction: (id, fields) => ipcRenderer.invoke('tx:update', id, fields),
  deleteTransaction: (id) => ipcRenderer.invoke('tx:delete', id),

  listTags: (opts) => ipcRenderer.invoke('tags:list', opts),
  listTagCatalog: () => ipcRenderer.invoke('tags:catalog'),
  listTagItems: (tagName, opts) =>
    ipcRenderer.invoke('tags:items', tagName, opts),
  inspectTags: () => ipcRenderer.invoke('tags:inspect'),
  listInspectLog: (opts) => ipcRenderer.invoke('tags:inspectLog', opts),

  listExpired7: () => ipcRenderer.invoke('containers:listExpired7'),
  listCompleted: (opts) => ipcRenderer.invoke('containers:listCompleted', opts),
  listArchive: () => ipcRenderer.invoke('containers:listArchive'),
  containerCounts: () => ipcRenderer.invoke('containers:counts'),
  archiveItem: (itemType, id) => ipcRenderer.invoke('containers:archive', itemType, id),
  restoreItem: (itemType, id, from) =>
    ipcRenderer.invoke('containers:restore', itemType, id, from),
  deleteContainerItem: (itemType, id) =>
    ipcRenderer.invoke('containers:delete', itemType, id),
  bulkArchive: (payload) => ipcRenderer.invoke('containers:bulkArchive', payload),
  bulkRestore: (payload) => ipcRenderer.invoke('containers:bulkRestore', payload),
  bulkDelete: (payload) => ipcRenderer.invoke('containers:bulkDelete', payload),
  sweepContainers: () => ipcRenderer.invoke('containers:sweep'),
  setLocked: (itemType, id, locked) =>
    ipcRenderer.invoke('items:setLocked', itemType, id, locked),

  listLists: (opts) => ipcRenderer.invoke('lists:list', opts),
  getList: (id) => ipcRenderer.invoke('lists:get', id),
  createList: (data) => ipcRenderer.invoke('lists:create', data),
  renameList: (id, name) => ipcRenderer.invoke('lists:rename', id, name),
  deleteList: (id) => ipcRenderer.invoke('lists:delete', id),
  mergeLists: (sourceId, targetId) => ipcRenderer.invoke('lists:merge', sourceId, targetId),
  listListItems: (id) => ipcRenderer.invoke('lists:items', id),
  addListEntry: (listId, title) => ipcRenderer.invoke('lists:addEntry', listId, title),
  toggleListEntry: (id, done) => ipcRenderer.invoke('lists:toggleEntry', id, done),
  renameListEntry: (id, title) => ipcRenderer.invoke('lists:renameEntry', id, title),
  removeListEntry: (id) => ipcRenderer.invoke('lists:removeEntry', id),
  saveListDoc: (id, payload) => ipcRenderer.invoke('lists:saveDoc', id, payload),
  exportList: (id) => ipcRenderer.invoke('lists:export', id),

  listNotes: (opts) => ipcRenderer.invoke('notes:list', opts),
  getNote: (id) => ipcRenderer.invoke('notes:get', id),
  createNote: (data) => ipcRenderer.invoke('notes:create', data),
  updateNote: (id, fields) => ipcRenderer.invoke('notes:update', id, fields),
  saveNoteDoc: (id, payload) => ipcRenderer.invoke('notes:saveDoc', id, payload),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  listNoteCategories: () => ipcRenderer.invoke('notes:categories'),
  createNoteCategory: (name) => ipcRenderer.invoke('notes:createCategory', name),
  exportNote: (id, format) => ipcRenderer.invoke('notes:export', id, format),
  printNote: (id) => ipcRenderer.invoke('notes:print', id),
  openNotePopout: (id) => ipcRenderer.invoke('notes:popoutOpen', id),
  focusNotePopout: (id) => ipcRenderer.invoke('notes:popoutFocus', id),
  listNotePopouts: () => ipcRenderer.invoke('notes:popoutList'),
  closeNotePopoutSelf: () => ipcRenderer.invoke('notes:popoutCloseSelf'),
  onNotePopouts: (cb) => {
    const listener = (_e, ids) => cb(ids);
    ipcRenderer.on('notes:popouts', listener);
    return () => ipcRenderer.removeListener('notes:popouts', listener);
  },
  onNotePopoutFlushClose: (cb) => {
    const listener = () => {
      Promise.resolve(cb()).catch(() => {}).finally(() => {
        ipcRenderer.invoke('notes:popoutCloseSelf').catch(() => {});
      });
    };
    ipcRenderer.on('notes:popout-flush-close', listener);
    return () => ipcRenderer.removeListener('notes:popout-flush-close', listener);
  },
  listHashtagWhitelist: () => ipcRenderer.invoke('lists:hashtagWhitelist'),
  appendListHashtag: (name) => ipcRenderer.invoke('lists:appendHashtag', name),

  /** Main asks renderer to flush debounced pad saves before quit. */
  onFlush: (cb) => {
    const listener = () => {
      Promise.resolve(cb()).catch(() => {}).finally(() => {
        ipcRenderer.send('app:flushed');
      });
    };
    ipcRenderer.on('app:flush', listener);
    return () => ipcRenderer.removeListener('app:flush', listener);
  },

  search: (opts) => ipcRenderer.invoke('search:query', opts),
  searchFilterOptions: (scope) =>
    ipcRenderer.invoke('search:filterOptions', scope),

  getTodayBrief: () => ipcRenderer.invoke('today:getBrief'),
  runAudit: () => ipcRenderer.invoke('today:runAudit'),
  quickAdd: (text) => ipcRenderer.invoke('quickAdd:submit', text),

  /** Subscribe to brief refresh nudges from main (optional future). */
  onBriefInvalidate: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('brief:invalidate', listener);
    return () => ipcRenderer.removeListener('brief:invalidate', listener);
  },

  /** Notification VIEW → open the item's editor. */
  onOpenItem: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('app:open-item', listener);
    return () => ipcRenderer.removeListener('app:open-item', listener);
  },
});
