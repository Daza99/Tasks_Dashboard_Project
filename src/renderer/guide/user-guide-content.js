/**
 * Built-in Settings Guide copy. TOC + body both map over this list.
 * Keep bullets to non-obvious behavior; skip UI that is self-explanatory.
 */
export const USER_GUIDE_SECTIONS = [
  {
    id: 'guide-layout',
    title: 'Layout',
    bullets: [
      'Compact = left nav + This Week brief + right rail. Focus = full module. Compact / Home restores Compact.',
      'Launch always opens Focus Today once; Compact is manual after that.',
    ],
  },
  {
    id: 'guide-dates',
    title: 'Dates',
    bullets: [
      'Stored as yyyy-mm-dd. Settings display ymd vs dmy does not change storage. Native date pickers follow the OS.',
    ],
  },
  {
    id: 'guide-today',
    title: 'Today',
    bullets: [
      'Compact week brief: Mon–Sun tasks/reminders; bills overdue + due this week; collapsible Expired = expired 24hr tasks + ignored reminders.',
      'Focus Today is a tighter slice (due today). Overdue bills show on Compact, not Focus Today.',
      'Double-click a brief row (or notification VIEW) opens that item in Focus.',
    ],
  },
  {
    id: 'guide-tasks',
    title: 'Tasks',
    bullets: [
      'Kind is required: 24hr (no due → due = now+24h) or Open (no popup; Add to Calendar stays off until a due is set).',
      'No recurrence. Progress tags Started / Half done / Not started; Done keeps the 24hr/Open kind so Reset can restore it.',
      'Restore from Completed always comes back as Open, even if it was 24hr.',
      '24hr popup: Done completes; Snooze pushes due; X expires it and it will not re-fire until you edit due. After Settings retention days it auto-moves to 7+ Days Expired.',
      'Range filter is created date, not due. P1 = highest.',
    ],
  },
  {
    id: 'guide-reminders',
    title: 'Reminders',
    bullets: [
      'Repeating reminders store one due datetime; completing Daily/Monthly advances that date (notifications stay one-at-a-time). Calendar expands the series like habits for the month you’re viewing (Daily = every day from the first due, Monthly = that day-of-month, Fortnight = +14d, Quarterly/Yearly = month step; month lengths clamp, e.g. 31 Jan → 28/29 Feb).',
      'Open scope has no due, no popup, no recurrence.',
      'Today/Tomorrow with no time: Today → ~now+1h; Tomorrow → 09:00. Changing due resets snooze/dismiss so it can fire again.',
      'Add to Calendar = appointment flag; chips are generated for the viewed month, not extra DB rows. Completing a repeat keeps past chips as done/expired.',
      'Nudge is a separate popup from due. Day-before auto-switches to custom when due is today. Done on a nudge only marks the nudge, not the reminder.',
      'Popup X = ignored (not snooze). Ignored stay in Reminders until retention days, then 7+ Days Expired. Range filter is recurrence type or created date, not due.',
    ],
  },
  {
    id: 'guide-notes-lists',
    title: 'Notes vs Lists',
    bullets: [
      'Notes = titled MD + bullet pad, filtered by category / year-month. Lists = list-local checklists or bullet pads; they never feed Today.',
      'Lists require a hashtag to show (default #list). Empty tag-on-edit does not wipe tags. Markdown “lists” live in Notes, not Lists.',
      'Merge: same type only (todos append; bullets concat).',
    ],
  },
  {
    id: 'guide-calendar',
    title: 'Calendar',
    bullets: [
      'Chips are a view of Tasks/Reminders/Habits/Bills + manual events, synced for the month on screen.',
      'Click a linked chip → that module (completed reminder → Completed). Only manual events edit inline.',
      'Remove from Calendar unticks Add to Calendar on the source — whole series drops, not one day. Delete linked item deletes the source (locked items skipped).',
      'Hide All Habits vs Hide Elapsed Habits are mutually exclusive view filters. Persist vs reset is Settings → General.',
      'Grid shows 3 chips + “+N”. Ctrl+click multi-select. Habit check-in from the day list uses that day, not necessarily today. Bills/habits show no clock time.',
    ],
  },
  {
    id: 'guide-habits',
    title: 'Habits',
    bullets: [
      'Weekly = Mon–Fri. 3-day / fortnightly count from created date. Monthly = created day-of-month (clamped).',
      'Check-ins are per calendar day. Streak for 3-day/fortnightly is consecutive due days, not consecutive calendar days.',
      'Archive (#archived) hides from list, nudges, and calendar — not the Cleanup Archive trash. No lock on habits.',
      'Nudge: custom = due days at that time if not checked in; day-before = today if tomorrow is due. Once per day.',
    ],
  },
  {
    id: 'guide-trackers',
    title: 'Trackers',
    bullets: [
      'Count / scale / mood / energy / stopwatch / countdown. Periods: daily, weekly (Mon–Sun), monthly, bimonthly (from created month), as-needed.',
      'Count cannot go below 0. Record stamps numbered entries in the period.',
      'Stopwatch/countdown start on create. Countdown Once: popup Delete removes the tracker; X/Done leave it. Snooze is N/A on countdown popups.',
      'Reset wipes logs, keeps the tracker. List date filter is created date.',
    ],
  },
  {
    id: 'guide-bills',
    title: 'Bills',
    bullets: [
      'Empty recurrence = one-off (#once). Recurring paid advances due (monthly/q/yearly keep billing day, clamped; fortnight +14d). One-off paid stays in the list as paid.',
      'Watch date = due + offset (−14…+14). Overdue, Today, calendar, and alerts use watch, not raw due.',
      'Paid tags accumulate (#paid / #paidlate / #paidlatechange). Paid+date (recurring only) sets a new due; it does not run the formula.',
      'Calc Average needs ≥6 prior payments of the same name; you still enter actual on pay.',
      'Spending is not linked — bill pays go to bill history, not the Spending ledger.',
      'Separate alerts: N days before watch, due-day, plus optional nudge.',
    ],
  },
  {
    id: 'guide-spending',
    title: 'Spending',
    bullets: [
      'Own transactions table. Compact Money Snapshot = today + month-to-date from Spending only.',
      'Quick Add: $12.50 coffee (first word = category). Blank category → misc.',
    ],
  },
  {
    id: 'guide-tags',
    title: 'Tags',
    bullets: [
      'System tags (todo_*, rem_*, locked, archived, …) are hidden from tag fields unless Show tags always / Debut mode.',
      'Tag Inspector runs on launch and ~every 30s: expire 24hr tasks, ignore grace reminders, sweep 7+ Days, mark bills overdue, repair orphan tags.',
      'Orphan repair drops tags whose parent is gone. Bill pay tags accumulate on purpose.',
    ],
  },
  {
    id: 'guide-search',
    title: 'Search & Quick Add',
    bullets: [
      'Compact search = all modules. Focus search = current view only (Today = tasks+reminders). Off on Settings/Tags.',
      ', = OR, + = AND, #tag = tag filter. Cap 80 hits. Ctrl+K opens search (not remappable).',
      'Quick Add (Compact): bare text → 24hr task; remind / ! → reminder; $amount → spend; habit … → habit. #tags strip into tags.',
    ],
  },
  {
    id: 'guide-notifications',
    title: 'Notifications',
    bullets: [
      'Custom corner windows, not OS toasts — stay until Done / Snooze / X. Text is always dark; Random colors (Settings, saves immediately) randomize fill+border, otherwise cream + slate every time.',
      'Default snooze minutes from Settings; popup custom snooze max 72h. X is ignore/expire, not snooze.',
      'Same item will not popup twice in one session unless snoozed/rescheduled. Bill popup Done = mark paid.',
    ],
  },
  {
    id: 'guide-cleanup',
    title: 'Cleanup & lock',
    bullets: [
      '7+ Days Expired: auto-move after retention days (1–30, default 7) for expired 24hr tasks and ignored reminders. Restore returns them to active still expired/ignored (they can show in Compact Expired again).',
      'Completed: tasks + reminders with Done. Restore un-completes.',
      'Archive: #archived trash. Restore clears archive. Auto-delete (off by default) uses archive years / expired days from Settings. Filesize warning is whole DB size vs the MB limit, not row count.',
      'Lock (tasks/reminders): blocks delete, bulk archive, and auto-delete.',
    ],
  },
  {
    id: 'guide-settings',
    title: 'Settings',
    bullets: [
      'General Save is a batch; random notif colors and date format save on toggle.',
      'Data backup = DB + wallpapers + sounds + themes. Restore takes a safety snapshot then relaunches. Avoid OneDrive/synced folders for the data path.',
      'Hotkeys need Ctrl/Alt/Cmd; ignored while typing in a field.',
    ],
  },
];
