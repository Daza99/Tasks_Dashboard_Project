# Notification Popup System — Engineering Note

> **Symptom if broken:** Due item hits Expired / lifecycle change but no corner BrowserWindow + taskbar flash.  
> **First check:** Was the item a **task with `due_datetime`**, a **reminder** (`rem_pending` / `rem_snoozed`), or something else that never calls `showItemNotification`?

Custom Electron popups (not OS toasts) are the shared alert surface for time-based events. Use this note when debugging “no popup” regressions or wiring a new trigger source (bills, habits, etc.).

## Architecture (main process only)

```
scheduler tick (~30s)
  ├─ pollDueTasks()      → listDueTasksForAlert() → markTaskAlerted → showItemNotification({ itemType:'task' })
  ├─ pollDueReminders()  → listDuePending/Snoozed → markFired → showItemNotification({ itemType:'reminder' })
  ├─ pollDueBills()      → listDueBillAlerts() → markBillAlerted → showItemNotification({ itemType:'bill' })
  ├─ pollHabitNudges()   → listDueNudges() → markHabitNudged → showItemNotification({ itemType:'habit' })
  └─ runTagAudit()       → expireStaleTodo24, expireGraceReminders, markOverdueBills
```

| Piece | Path | Role |
|-------|------|------|
| Scheduler | `src/main/scheduler.js` | Poll + session de-dupe (`task:id` / `reminder:id` / `bill:id:kind` / `habit:id`) |
| Window | `src/main/notification-window.js` | `showItemNotification`, IPC Done/Snooze/Ignore/Min |
| HTML / preload | `src/main/notification.html`, `notif-preload.js` | Chrome + `notifApi` — **must pass through full `itemType`** |
| Reminder DB | `src/services/db/reminders.js` | `rem_*` lifecycle |
| Task DB | `src/services/db/tasks.js` | `todo_*` + `todo_alerted` |
| Bill DB | `src/services/db/bills.js` | due / overdue + `alerted_before` / `alerted_due` |
| Habit DB | `src/services/db/habits.js` | check-in + `nudge_time` / `last_nudge_date` |

Renderer never opens popups — only main does, after DB queries.

## Item types today

### Reminders
- **Due query:** `rem_pending` with `datetime <= now`, or `rem_snoozed` with `snooze_until <= now`
- **On fire:** → `rem_fired`
- **Done / Snooze / X:** `rem_completed` / `rem_snoozed` / `rem_ignored`
- **Reschedule:** updating `datetime` → `rem_pending` + `clearFiredSession('reminder', id)`

### Tasks (due alert)
- **Due query:** still `todo_24`, `due_datetime <= now`, **no** `todo_alerted`
- **Order matters:** alert **before** `expireStaleTodo24`, or the task becomes `todo_expired` and never matches the due query
- **On fire:** add `todo_alerted` (blocks re-spam after restart)
- **Done / Snooze / X:** complete / push `due_datetime` + clear alerted + stay `todo_24` / expire + keep alerted
- **Reschedule:** updating `due_datetime` clears `todo_alerted`, revives `todo_expired` → `todo_24`, clears session key

### Quick Add gotcha
- Bare text → **task** (`todo_24`)
- `remind …` / `!…` / `remind me` → **reminder**
- Editing a task’s due time will popup; editing a completed reminder will not until it is pending again

## Shared popup contract

`showItemNotification({ id, title, itemType: 'reminder' | 'task' | 'bill' | 'habit' })`

- Window map key: `` `${itemType}:${id}` `` — **must match** the `itemType` sent back on Done/Snooze/Min/X
- IPC payload: `{ id, itemType }` (legacy bare id = reminder)
- Settings: `notif_position`, `notif_text_color`, `notif_default_snooze_minutes`, …
- Always-on-top, `skipTaskbar: false`, `flashFrame`, stays until Done / Snooze / X (Min = hide only)

### Critical: `notification.html` must not coerce `itemType`

Main loads the popup with `query.itemType`. The inline script builds `{ id, itemType }` for every chrome action and for `closeNotif` / minimize lookups.

**If HTML only accepts `task` | `reminder` (old bug):** habit/bill popups still *appear*, but every button silently fails:

| Symptom | Why |
|---------|-----|
| Done / Snooze / ✕ “do nothing” (hover still works) | Payload becomes `itemType:'reminder'` → wrong DB handler; `closeNotif('reminder', id)` misses map key `habit:id` / `bill:id` so window never closes |
| Minimize no-op | Looks up `reminder:id` while openWindows has `habit:id` |

**When hooking a new `itemType`:**

1. Add to `VALID_TYPES` in `notification-window.js` (`parsePayload` + `showItemNotification` + IPC Done/Snooze/Ignore branches + `win.on('close')`)
2. Add to the `VALID` set in `notification.html` (same strings — keep both lists in sync)
3. Pass `itemType` in `loadFile(..., { query: { itemType, ... } })`
4. Smoke-test: open popup → Done closes window + correct DB side effect; Min finds the window

Allowed values today: `reminder` | `task` | `bill` | `habit`.

## Extending to other notifications (bills, habits, …)

Reuse the same window — do **not** invent a second BrowserWindow stack.

1. **DB query** — “due now, not yet alerted” (tag or column, e.g. `bill_alerted`)
2. **Poller** in `scheduler.js` (or shared `pollDueAlerts()` that concatenates sources)
3. **Mark alerted** before/when showing (idempotent; survive restart)
4. Call `showItemNotification({ id, title, itemType: 'bill' })` — extend `itemType` in **both** `notification-window.js` **and** `notification.html` (see contract above)
5. **Reschedule / snooze** must clear alerted + session key (`clearFiredSession('bill', id)`)
6. Keep audit/expire **after** alert poll if expire would remove the row from the due query

`itemType` values: `reminder` | `task` | `bill` | `habit`.

### Bills (Phase 3)
- **Due query:** pending/overdue, `due_date` = tomorrow (`alerted_before=0`) or today (`alerted_due=0`), snooze elapsed
- **On fire:** set `alerted_before` / `alerted_due`
- **Done / Snooze / X:** markPaid / clear alerted + snooze_until / dismissBillAlert

### Habits (Phase 3)
- **Due query:** `nudge_time` set, due today by frequency, not checked in, `last_nudge_date` not today, snooze elapsed
- **On fire:** set `last_nudge_date`
- **Done / Snooze / X:** markCheckin / clear last_nudge + snooze_until / dismissHabitNudge (skip today)

## Debug checklist (“popup was working, now isn’t”)

1. Confirm item type + tags in SQLite (`data/dashboard.db`)
2. Is scheduler running? (`startScheduler` from `app.whenReady`)
3. Does the due query return the row? (tag state, `datetime('now')` vs stored ISO)
4. Already alerted / `firedThisSession` / `todo_alerted` / `rem_fired` / bill alerted flags / habit `last_nudge_date`?
5. Was expire/audit run **before** the alert poll? (task regression pattern)
6. Did `showItemNotification` run but window fail (`ready-to-show`, transparent window)?
7. **Popup shows but Done/Snooze/Min/X do nothing?** → `itemType` mismatch (see contract + historical note below). Check openWindows key vs IPC payload.

## Historical regressions (2026-08)

### Task due alert skipped by expire
Tasks with due times were expired to `todo_expired` with **no** popup. Only reminders used `showReminderNotification`. Fixed by polling due `todo_24` tasks first, tagging `todo_alerted`, then expiring — same UI as reminders via `showItemNotification`.

### Habit/bill chrome dead (itemType coerced in HTML)
**Symptom:** Habit (or bill) popup appears and flashes; Done / Snooze / Minimize / ✕ appear clickable (hover styles work) but nothing happens — window stays open.  
**Cause:** `notification.html` used `params.get('itemType') === 'task' ? 'task' : 'reminder'`, so `habit`/`bill` became `reminder`. Main stored the window as `habit:1`; IPC called reminder handlers and `closeNotif`/`minimize` looked up `reminder:1` → miss.  
**Fix:** HTML validates against the same set as main (`reminder` | `task` | `bill` | `habit`). When adding a new type, update **both** files.
