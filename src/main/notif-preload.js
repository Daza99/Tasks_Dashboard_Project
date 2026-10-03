/**
 * Preload for notification popup windows only.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notifApi', {
  complete: (payload, opts) => ipcRenderer.invoke('notif:complete', payload, opts),
  snooze: (payload, minutes) => ipcRenderer.invoke('notif:snooze', payload, minutes),
  ignore: (payload) => ipcRenderer.invoke('notif:ignore', payload),
  delete: (payload) => ipcRenderer.invoke('notif:delete', payload),
  minimize: (payload) => ipcRenderer.invoke('notif:minimize', payload),
  getMeta: () => ipcRenderer.invoke('notif:getMeta'),
  view: (payload) => ipcRenderer.invoke('notif:view', payload),
  /** Pause the other popups while Snooze+ or Paid+date is open. */
  priorityHold: (payload, active) =>
    ipcRenderer.invoke('notif:priorityHold', payload, active),
  /** Live title/details/created after dashboard edit. */
  onRefresh: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('notif:refresh', listener);
    return () => ipcRenderer.removeListener('notif:refresh', listener);
  },
});
