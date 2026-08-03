/**

 * Preload for notification popup windows only.

 */

const { contextBridge, ipcRenderer } = require('electron');



contextBridge.exposeInMainWorld('notifApi', {

  complete: (id) => ipcRenderer.invoke('notif:complete', id),

  snooze: (id, minutes) => ipcRenderer.invoke('notif:snooze', id, minutes),

  ignore: (id) => ipcRenderer.invoke('notif:ignore', id),

  minimize: (id) => ipcRenderer.invoke('notif:minimize', id),

});


