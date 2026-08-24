/**
 * Preload for tracker popout widgets only.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trackerApi', {
  getState: () => ipcRenderer.invoke('trackers:popoutState'),
  close: () => ipcRenderer.invoke('trackers:popoutCloseSelf'),
  minimize: () => ipcRenderer.invoke('trackers:popoutMinimizeSelf'),
  /** Focus dashboard Trackers view with this widget's tracker editing. */
  edit: () => ipcRenderer.invoke('trackers:popoutEditSelf'),
  log: (id, value) => ipcRenderer.invoke('trackers:log', id, value),
  undo: (id) => ipcRenderer.invoke('trackers:undo', id),
  timerStart: (id) => ipcRenderer.invoke('trackers:timerStart', id),
  timerPause: (id) => ipcRenderer.invoke('trackers:timerPause', id),
  timerReset: (id) => ipcRenderer.invoke('trackers:timerReset', id),
  dockList: () => ipcRenderer.invoke('trackers:dockList'),
  dockRestore: (id) => ipcRenderer.invoke('trackers:dockRestore', id),
  onState: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('trackers:popout-state', listener);
    return () => ipcRenderer.removeListener('trackers:popout-state', listener);
  },
  onDockList: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('trackers:dock-list', listener);
    return () => ipcRenderer.removeListener('trackers:dock-list', listener);
  },
});
