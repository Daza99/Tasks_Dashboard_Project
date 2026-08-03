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
