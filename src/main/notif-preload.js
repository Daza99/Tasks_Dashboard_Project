/**
 * Preload for notification popup windows only.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notifApi', {
  complete: (payload) => ipcRenderer.invoke('notif:complete', payload),
  snooze: (payload, minutes) => ipcRenderer.invoke('notif:snooze', payload, minutes),
  ignore: (payload) => ipcRenderer.invoke('notif:ignore', payload),
  minimize: (payload) => ipcRenderer.invoke('notif:minimize', payload),
});
