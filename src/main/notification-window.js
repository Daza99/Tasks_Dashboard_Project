/**

 * Custom reminder popup — BrowserWindow with taskbar presence (not OS toast).

 */

const { BrowserWindow, screen, ipcMain } = require('electron');

const path = require('path');

const { getAllSettings } = require('./database');

const {

  completeReminder,

  ignoreReminder,

  snoozeReminder,

} = require('../services/db/reminders');

const { logError } = require('./logger');



const openWindows = new Map(); // id → { win, resolved }

let handlersRegistered = false;



function registerNotificationIpc() {

  if (handlersRegistered) return;

  handlersRegistered = true;



  ipcMain.handle('notif:complete', (_e, reminderId) => {

    try {

      markResolved(reminderId);

      completeReminder(reminderId);

      closeNotif(reminderId);

      return true;

    } catch (err) {

      logError('notif:complete', err);

      throw err;

    }

  });



  ipcMain.handle('notif:snooze', (_e, reminderId, minutes) => {

    try {

      markResolved(reminderId);

      snoozeReminder(reminderId, minutes);

      // Lazy require avoids circular dep with scheduler.js

      const { clearFiredSession } = require('./scheduler');

      clearFiredSession(reminderId);

      closeNotif(reminderId);

      return true;

    } catch (err) {

      logError('notif:snooze', err);

      throw err;

    }

  });



  ipcMain.handle('notif:ignore', (_e, reminderId) => {

    try {

      markResolved(reminderId);

      ignoreReminder(reminderId);

      closeNotif(reminderId);

      return true;

    } catch (err) {

      logError('notif:ignore', err);

      throw err;

    }

  });



  ipcMain.handle('notif:minimize', (_e, reminderId) => {

    const entry = openWindows.get(reminderId);

    if (entry?.win && !entry.win.isDestroyed()) {

      entry.win.minimize();

    }

    return true;

  });

}



function markResolved(reminderId) {

  const entry = openWindows.get(reminderId);

  if (entry) entry.resolved = true;

}



function closeNotif(reminderId) {

  const entry = openWindows.get(reminderId);

  if (entry?.win && !entry.win.isDestroyed()) entry.win.close();

  openWindows.delete(reminderId);

}



function cornerBounds(position, width, height) {

  const display = screen.getPrimaryDisplay();

  const { workArea } = display;

  const margin = 16;

  const pos = position || 'br';

  let x = workArea.x + workArea.width - width - margin;

  let y = workArea.y + workArea.height - height - margin;

  if (pos === 'bl') {

    x = workArea.x + margin;

  } else if (pos === 'tr') {

    y = workArea.y + margin;

  } else if (pos === 'tl') {

    x = workArea.x + margin;

    y = workArea.y + margin;

  }

  return { x, y, width, height };

}



/**

 * Show always-on-top popup with taskbar entry + flash until action.

 * @param {{ id: number, title: string }} reminder

 */

function showReminderNotification(reminder) {

  try {

    registerNotificationIpc();

    if (openWindows.has(reminder.id)) return;



    const settings = getAllSettings();

    const textColor = settings.notif_text_color || '#ffffff';

    const snoozeMins = settings.notif_default_snooze_minutes || '10';

    const bounds = cornerBounds(settings.notif_position, 340, 180);



    const win = new BrowserWindow({

      ...bounds,

      frame: false,

      transparent: true,

      alwaysOnTop: true,

      skipTaskbar: false,

      resizable: false,

      minimizable: true,

      closable: true,

      focusable: true,

      show: false,

      title: `Reminder: ${reminder.title || 'Reminder'}`,

      webPreferences: {

        preload: path.join(__dirname, 'notif-preload.js'),

        contextIsolation: true,

        nodeIntegration: false,

        sandbox: false,

      },

    });



    openWindows.set(reminder.id, { win, resolved: false });



    const htmlPath = path.join(__dirname, 'notification.html');

    win.loadFile(htmlPath, {

      query: {

        id: String(reminder.id),

        title: reminder.title || 'Reminder',

        textColor,

        snoozeMins: String(snoozeMins),

      },

    });



    const flash = () => {

      if (!win.isDestroyed()) win.flashFrame(true);

    };



    win.once('ready-to-show', () => {

      win.show();

      flash();

    });



    win.on('restore', flash);

    win.on('show', flash);



    // X / Alt+F4 / taskbar close without Done/Snooze → ignored

    win.on('close', () => {

      const entry = openWindows.get(reminder.id);

      if (!entry || entry.resolved) return;

      entry.resolved = true;

      try {

        ignoreReminder(reminder.id);

      } catch (err) {

        logError('notif close→ignore', err);

      }

    });



    win.on('closed', () => {

      openWindows.delete(reminder.id);

    });

  } catch (err) {

    logError('showReminderNotification', err);

  }

}



module.exports = { showReminderNotification, registerNotificationIpc };


