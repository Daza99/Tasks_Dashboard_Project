/**
 * Preload — expose a narrow API via contextBridge.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getActiveTheme: () => ipcRenderer.invoke('theme:getActive'),
  setThemeBase: (base) => ipcRenderer.invoke('theme:setBase', base),
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  health: () => ipcRenderer.invoke('app:health'),

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
});
