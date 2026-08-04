# Personal Dashboard App — Master Design Blueprint

> A portable, offline-first desktop dashboard for Windows 11 (Linux later) with a "Today" pane at its core. Built with Cursor AI vibe-coding. Portable USB build with local data storage.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Data Architecture](#data-architecture)
5. [Core Layout & UI Architecture](#core-layout--ui-architecture)
6. [Tag Lifecycle System](#tag-lifecycle-system)
7. [Lists Management System](#lists-management-system)
8. [Cleanup Containers](#cleanup-containers)
9. [Wallpaper Background System](#wallpaper-background-system)
10. [Popup Notification System](#popup-notification-system)
11. [Deep Theming System](#deep-theming-system)
12. [Robust Search Specification](#robust-search-specification)
13. [Feature Modules & MVP Phases](#feature-modules--mvp-phases)
14. [Security & Network Design](#security--network-design)
15. [Export System](#export-system)
16. [Portability Requirements](#portability-requirements)
17. [Cursor AI Development Notes](#cursor-ai-development-notes)
18. [Decision Log](#decision-log)

---

## 1. Overview

**Purpose:** A personal desktop dashboard that solves the core problem of reminder/to-do apps losing context when items age or expire. The app treats time passing and user inaction as meaningful signals, not just "checked" vs "unchecked."

**North Star:** A single "Today" pane that aggregates all reminders, to-dos, bills, calendar events, habits, and finances into one glanceable daily/weekly brief. Everything else feeds into this view.

**Key Differentiators:**
- Tag lifecycle system: Items automatically transition through states based on time and user action (or inaction)
- Anti-habituation notifications: Randomized colors and sounds fight notification blindness
- Filing cabinet Lists system: Expired items moved to named lists with date citation
- Three-container cleanup: 7+ Days Expired, Completed, Archive — each with bulk/individual management
- Lock feature: Per-item "never delete" protection
- Offline-first, USB-portable, privacy-focused

**Platform:** Windows 11 primary, Linux later. Fully offline except optional weather API (inbound-only).

---

## 2. Tech Stack (Recommended)

| Layer | Technology | Reason |
|---|---|---|
| Framework | Electron + React | Massive ecosystem, excellent Cursor AI familiarity, portable builds proven |
| Database | SQLite (better-sqlite3) | Single file, queryable, synchronous (fast), no server needed |
| Charts | Recharts | React-native, lightweight, good for spending/habit graphs |
| Date Handling | date-fns | Lighter than moment.js, well-supported |
| Styling | CSS Custom Properties | Lightweight theming, no heavy library needed |
| Build Tool | electron-builder | Configured for `target: ["dir"]` portable folder |

**Alternatives Considered:**
- **Tauri + Rust:** Smaller binary (~10MB), stronger security, but less Cursor AI familiarity with Rust backend
- **Python + CustomTkinter/PyQt:** Simpler to prototype, but fewer charting libraries and harder modern UI

**Recommendation:** Stick with Electron + React + SQLite. Binary size (~150MB) acceptable given user's hardware (32GB RAM) and USB stick use case.

---

## 3. Project Structure

personal-dashboard/
│
├── src/
│   ├── main/
│   │   ├── index.js
│   │   ├── database.js
│   │   ├── ipc-handlers.js
│   │   ├── portable-paths.js
│   │   ├── exporters.js
│   │   └── notification-window.js
│   │
│   ├── renderer/
│   │   ├── index.html
│   │   ├── App.jsx
│   │   │
│   │   ├── views/
│   │   │   ├── Today.jsx
│   │   │   ├── Week.jsx
│   │   │   ├── Calendar.jsx
│   │   │   ├── Tasks.jsx
│   │   │   ├── Habits.jsx
│   │   │   ├── Finances.jsx
│   │   │   ├── Bills.jsx
│   │   │   ├── Notes.jsx
│   │   │   ├── Search.jsx
│   │   │   └── Settings.jsx
│   │   │
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── QuickAddBar.jsx
│   │   │   ├── GlobalSearch.jsx
│   │   │   ├── WidgetWeather.jsx
│   │   │   ├── HabitCheckinStrip.jsx
│   │   │   ├── MoneySnapshot.jsx
│   │   │   ├── DueTodayGroup.jsx
│   │   │   ├── ThisWeekSummary.jsx
│   │   │   ├── ChartSpending.jsx
│   │   │   ├── ChartHabits.jsx
│   │   │   ├── TagManager.jsx
│   │   │   ├── Modal.jsx
│   │   │   └── ConfirmDialog.jsx
│   │   │
│   │   ├── settings-tabs/
│   │   │   ├── SettingsGeneral.jsx
│   │   │   ├── SettingsTheme.jsx
│   │   │   ├── SettingsWallpaper.jsx
│   │   │   ├── SettingsNotifications.jsx
│   │   │   ├── SettingsExport.jsx
│   │   │   └── SettingsLists.jsx
│   │   │
│   │   ├── lists-view/
│   │   │   ├── ListsPanel.jsx
│   │   │   ├── ListItemView.jsx
│   │   │   ├── ListEditor.jsx
│   │   │   └── ListFilter.jsx
│   │   │
│   │   ├── notification/
│   │   │   ├── NotificationPopup.jsx
│   │   │   ├── SnoozeDialog.jsx
│   │   │   └── notification.html
│   │   │
│   │   ├── containers/
│   │   │   ├── Expired7Plus.jsx
│   │   │   ├── Completed.jsx
│   │   │   ├── Archive.jsx
│   │   │   └── ContainerActions.jsx
│   │   │
│   │   ├── inspection/
│   │   │   ├── TagInspector.jsx
│   │   │   └── TagAuditLog.jsx
│   │   │
│   │   ├── styles/
│   │   │   ├── theme-variables.css
│   │   │   ├── base.css
│   │   │   └── components.css
│   │   │
│   │   └── context/
│   │       ├── ThemeContext.jsx
│   │       └── DatabaseContext.jsx
│   │
│   ├── services/
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   ├── tasks.js
│   │   │   ├── reminders.js
│   │   │   ├── habits.js
│   │   │   ├── transactions.js
│   │   │   ├── bills.js
│   │   │   ├── events.js
│   │   │   ├── notes.js
│   │   │   ├── tags.js
│   │   │   ├── themes.js
│   │   │   ├── lists.js
│   │   │   ├── list_items.js
│   │   │   ├── wallpapers.js
│   │   │   ├── sounds.js
│   │   │   ├── settings.js
│   │   │   └── search.js
│   │   │
│   │   ├── wallpaper.js
│   │   ├── notifications.js
│   │   ├── color-utils.js
│   │   ├── snooze-parser.js
│   │   ├── sound-manager.js
│   │   ├── tag-auditor.js
│   │   ├── container-manager.js
│   │   ├── list-manager.js
│   │   ├── export-markdown.js
│   │   ├── export-pdf.js
│   │   └── weather-api.js
│   │
│   └── utils/
│       ├── date-helpers.js
│       ├── tag-helpers.js
│       ├── id-generator.js
│       └── search-parser.js
│
├── data/
│   ├── dashboard.db
│   ├── wallpapers/
│   ├── sounds/
│   ├── exports/
│   └── themes/
│
├── assets/
│   ├── icons/
│   └── defaults/
│
├── package.json
├── electron-builder.yml
├── .cursorrules
└── README.md

4. Data Architecture
SQLite Tables
-- TASKS TABLE
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_datetime DATETIME,
    completed_at DATETIME,
    priority INTEGER, -- 1-5
    list_locked BOOLEAN DEFAULT 0,
    archived BOOLEAN DEFAULT 0,
    archived_date DATETIME
);

-- REMINDERS TABLE
CREATE TABLE reminders (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    datetime DATETIME NOT NULL,
    recurrence TEXT, -- 'daily', 'weekly', 'monthly', 'yearly', null
    dismissed BOOLEAN DEFAULT 0,
    snooze_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    archived BOOLEAN DEFAULT 0,
    archived_date DATETIME
);

-- HABITS TABLE
CREATE TABLE habits (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL, -- 'daily', 'weekdays', 'custom'
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- HABIT LOGS TABLE
CREATE TABLE habit_logs (
    id INTEGER PRIMARY KEY,
    habit_id INTEGER NOT NULL,
    date DATE NOT NULL,
    completed BOOLEAN DEFAULT 0,
    FOREIGN KEY(habit_id) REFERENCES habits(id)
);

-- TRANSACTIONS TABLE
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- BILLS TABLE
CREATE TABLE bills (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    due_date DATE NOT NULL,
    recurrence TEXT, -- 'monthly', 'quarterly', 'yearly'
    paid_status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'overdue'
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- EVENTS TABLE
CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- NOTES TABLE
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TAGS TABLE
CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    color TEXT, -- Hex color
    is_system BOOLEAN DEFAULT 0, -- True for lifecycle tags like todo_24, rem_ignored
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ITEM_TAGS JUNCTION TABLE
CREATE TABLE item_tags (
    id INTEGER PRIMARY KEY,
    item_type TEXT NOT NULL, -- 'task', 'reminder', 'note', 'event', 'transaction'
    item_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY(tag_id) REFERENCES tags(id)
);

-- LISTS TABLE (Named containers)
CREATE TABLE lists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'todo', 'reminder', 'mixed'
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    parent_id INTEGER -- For future nesting capability
);

-- LIST_ITEMS JUNCTION TABLE
CREATE TABLE list_items (
    id INTEGER PRIMARY KEY,
    list_id INTEGER NOT NULL,
    item_type TEXT NOT NULL, -- 'task', 'reminder'
    item_id INTEGER NOT NULL,
    added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(list_id) REFERENCES lists(id)
);

-- WALLPAPER_LIBRARY TABLE
CREATE TABLE wallpaper_library (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    eligible_for_random BOOLEAN DEFAULT 1
);

-- SOUND_LIBRARY TABLE
CREATE TABLE sound_library (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    eligible_for_random BOOLEAN DEFAULT 1
);

-- THEMES TABLE
CREATE TABLE themes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    theme_json TEXT NOT NULL, -- Full JSON blob of CSS variables
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_default BOOLEAN DEFAULT 0
);

-- SETTINGS TABLE (Key-value store)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

Settings Key-Value Pairs
Key	Value	Default
wallpaper_mode	'color' | 'image' | 'random'	'color'
wallpaper_color	Hex code	'#ffffff'
wallpaper_image_path	Relative path	null
wallpaper_fit	'fill'|'fit'|'stretch'|'center'	'fill'
wallpaper_dim	Integer 0-80 (%)	0
notif_position	'br'|'bl'|'tr'|'tl'	'br'
notif_timeout_seconds	Integer	15
notif_text_color	Hex code	'#ffffff'
notif_random_bg	Boolean	false
notif_random_sfx	Boolean	false
notif_volume	Integer 0-100	50
notif_grace_period_hours	Integer	1
retention_days_expired	Integer	7
archive_retention_years	Integer	3
auto_delete_archive	Boolean	false
archive_filesize_limit_mb	Integer	500
list_naming_templates	JSON array	['Current Date', 'Project', 'Other']
theme_base	'light'|'dark'|'custom'	'dark'
active_theme_id	Integer (FK to themes)	1
Tag Lifecycle Schema
System Tags (is_system = true):

Tag Name	Item Type	Triggers When
todo_24	Task	User creates with 24hr priority
todo_open	Task	User creates as open/no-deadline
todo_completed	Task	User marks complete
todo_expired	Task	24hr window passes without completion
rem_today	Reminder	Scope set to "today"
rem_tomorrow	Reminder	Scope set to "tomorrow"
rem_dated	Reminder	Scope set to specific date
rem_open	Reminder	No due datetime
rem_pending	Reminder	Not yet reached due time
rem_fired	Reminder	Due datetime arrives, popup appears
rem_grace	Reminder	Popup dismissed, grace period active
rem_ignored	Reminder	Grace period expires without action
rem_completed	Reminder	User completes
rem_snoozed	Reminder	User snoozes
locked	Any	User locks item
archived	Any	Item moved to archive container
5. Core Layout & UI Architecture
Main Window Division
┌─────────────────────────────────────────────────────────┐
│                     TOOLBAR                             │
│  [Logo]  Global Search Bar (Ctrl+K)  [Quick Add Bar]   │
├──────┬──────────────────────────────────────────────────┤
│      │                                                  │
│ SIDEBAR│                MAIN CONTENT AREA               │
│      │                                                  │
│  • Today          [Selected View Renders Here]         │
│  • Week          - Could be Today pane                 │
│  • Calendar      - Could be Tasks list                 │
│  • Tasks         - Could be Lists panel (expanded)     │
│  • Habits        - Could be Search results             │
│  • Finances      - Could be Settings                   │
│  • Bills                                                 │
│  • Notes         (Collapsible sidebar toggle)          │
│  • Lists         (Full-screen expand available)        │
│  • 7+ Days Expired                                     │
│  • Completed                                           │
│  • Archive                                             │
│  • Settings                                            │
│      │                                                  │
├──────┴──────────────────────────────────────────────────┤
│                     STATUS BAR                          │
│  [Connection: OFFLINE] [Sync: N/A] [Last Backup: ...]  │
└─────────────────────────────────────────────────────────┘

The "Today" Pane (Primary Landing View)
Header Section:

Date header: "Wednesday 5 August 2026"
Greeting: "Good afternoon, [Name]" (if name stored in settings)
Weather widget (if enabled): Current condition + 3-day mini-forecast
Content Sections (stacked vertically):

Section	Content	Behavior
Due Today	Bills due today, tasks due today, reminders due today, events today	Grouped by type, color-coded urgency
Expired	Collapsed section. Expired todo_24 items and rem_ignored items	Expandable. Shows count. RMB context menu on items
Snoozed	Reminders with active rem_snoozed tag showing upcoming snooze times	Collapsed by default
This Week	7-day forward summary of upcoming items (folded view)	Expandable, shows items due within next 6 days
Habit Check-in Strip	Today's habits as toggle chips	Tap to mark done instantly
Money Snapshot	Today's spending + month-to-date total	Small graph or numeric summary
Quick Add Bar:

Always visible at top of Today pane
Single input field: type a task, reminder, note, or transaction
Auto-routing: natural language parser sends to correct module
Tag assignment via typing #tagname in the same field
6. Tag Lifecycle System
To-Do Lifecycle
CREATION (mandatory choice)
    │
    ├── todo_24 ──→ (24hr passes without complete) ──→ todo_expired ──→ (7 days passes) ──→ 7+ Days Expired Container
    │                       │                                               │
    │                       ├─ (user action: RMB context menu)              ├─ (user action: restore, archive, delete)
    │                       │  - Move to list                               │
    │                       │  - Re-activate (new 24hr)                     │
    │                       │  - Convert to todo_open                       │
    │                       │  - Complete                                   │
    │                       │                                               │
    │                       └─ (user completes) ──→ todo_completed ──→ Completed Container
    │                                                                   │
    │                                                                   └─ (after X days) ──→ Archive Container
    │
    └── todo_open ──→ (no deadline, stays active indefinitely)

Reminder Lifecycle
CREATION (mandatory scope choice)
    │
    ├── rem_today / rem_tomorrow / rem_dated / rem_open
    │       │
    │       └─→ (due time arrives) ──→ rem_fired ──→ popup appears
    │                                         │
    │                                         ├─ (user completes) ──→ rem_completed ──→ Completed Container
    │                                         │
    │                                         ├─ (user snoozes) ──→ rem_snoozed ──→ re-fires after snooze duration
    │                                         │                                         │
    │                                         │                                         └─ (if not acted upon) ──→ rem_ignored
    │                                         │
    │                                         └─ (popup dismissed) ──→ rem_grace ──→ (grace period: 1 hour)
    │                                                                        │
    │                                                                        ├─ (user completes within grace) ──→ rem_completed
    │                                                                        │
    │                                                                        └─ (grace expires) ──→ rem_ignored ──→ Expired Section in Today pane

Tag Inspector
Audit Checks Run on Launch + Manual Trigger:

Find rem_grace items past grace period → retag to rem_ignored
Find todo_24 items past 24 hours without completion → retag to todo_expired
Find todo_expired items past retention days → move to "7+ Days Expired" container
Find rem_snoozed items past snooze time → re-fire or tag rem_ignored
Check for orphaned tags (tags applied to deleted items, duplicates)
Report anomalies in log panel
7. Lists Management System
List Creation Experience
When creating a new to-do or reminder list:

Naming Dialog:

Default name field pre-populated with today's date and day (e.g., "Wednesday 5 August 2026")
User can append a name (e.g., "Wednesday 5 August 2026 — House Projects") or clear and write their own
Naming template selector:
Current Date — auto-fills today's day + date
Project — prompts "Enter project name:" → optionally appends date
Custom defaults — user-defined templates
Below the name: creation date citation (small muted text: "Created 5 Aug 2026")
Hotkey to insert current date (Ctrl+;)
Lists Panel (Sidebar Navigation Item: "Lists")
Two View Modes:

Side Panel (default): Compact view, lists displayed like folders in file explorer — icon + name + creation date + item count
Full-Screen/Expand: Click expand icon, opens Lists view into main content area with larger grid
Features:

Clicking a list opens it in main content area
Lists organized into two categories: To-Do Lists and Reminder Lists (toggle tabs at top)
Filter bar: filter list headers by week date range, month, year, custom date range
Right-click on list: rename, delete, merge, export items as .md
Drag-and-drop items onto lists from any view
Data Model for Lists
lists table:

id, name, type (todo/reminder), created_date, parent_id
list_items table:

id, list_id, item_type (task/reminder), item_id, added_date
8. Cleanup Containers
Three-Container Flow
Active Items
    │
    ├─ (completed) ──────→ "Completed" Container
    │                          │
    │                          ├─ (archive) ──→ "Archive" (Trash Can)
    │                          │                    │
    │                          │                    └─ (permanent delete or auto-delete after 3+ years)
    │                          │
    │                          └─ (restore) ──→ back to Active
    │
    └─ (expired 7+ days) ──→ "7+ Days Expired" Container
                                 │
                                 ├─ (archive) ──→ "Archive"
                                 ├─ (restore)  ──→ back to Active Expired in Today pane
                                 └─ (delete)   ──→ permanent delete (or archive first)

Container 1: 7+ Days Expired
Auto-move after configurable period (default 7 days, range 1–30)
Features:
Select all / delete all
Individual deletion
Restore (moves back to active expired state in Today pane)
Move to a named list
Auto-delete toggle: Off by default. When on, user defines retention period before permanent deletion. When off, user is prompted with "OK to delete all?" confirmation dialog
Bulk move to archive option
Container 2: Completed
All completed tasks and reminders flow here
Separate from expired items
Features:
Bulk archive or delete (individually or all)
Filter by date, type, tag
Restore (un-completes the item, returns to active state)
Container 3: Archive (Trash Can)
Final holding area before permanent deletion
Items arrive via:
Manual "Archive" action from any container
Auto-archive from Completed after configurable period
Retention limit: User defines in Settings → General → Archive. Default: items 3+ years old flagged for deletion
Auto-delete toggle (off by default)
Filesize warning: if archive database grows beyond threshold (e.g., 500 MB), app displays warning suggesting cleanup
Items here can be restored or permanently deleted
Permanent delete removes the record from SQLite database
Padlock / Lock Feature
Every individual to-do item has a padlock icon (unlocked by default)
Toggle lock to "Never delete" status
Locked items:
Auto-tagged locked
Excluded from bulk delete operations
Excluded from auto-delete timers
Searchable via tag search (#locked)
Visually indicated with small locked padlock icon
Unlocking restores normal deletion behavior
9. Wallpaper Background System
Color Mode
Native color picker (hex input + visual picker)
Adjustable sliders: Hue, Saturation, Brightness/Lightness
Live preview as adjustments are made
Apply button commits the color to settings
Preset palette — user can save favorite colors for quick switching
Image Mode
Browse and select a PNG from disk
Selected image is copied into /data/wallpapers/ (not referenced externally)
Display options: Fill (cover), Fit (contain), Stretch, Center
Dim/overlay slider — applies semi-transparent black overlay (0–80%) so UI text remains readable
Wallpaper Library
All imported images stored in /data/wallpapers/
Thumbnail grid in Settings → Wallpapers showing all imported images
Delete from library (removes file from disk)
Rename within library
Mark images as "eligible for random rotation" via toggle
Random Mode
Toggle in settings: "Random wallpaper on launch"
Pulls from all images marked eligible in the library
If no images marked eligible, falls back to last manually selected wallpaper
No repeats within a session (tracks last-used during runtime)
Data Storage
settings table: wallpaper_mode, wallpaper_color, wallpaper_image_path, wallpaper_fit, wallpaper_dim
wallpaper_library table: id, filename, added_date, eligible_for_random
10. Popup Notification System

> **Engineering note (debug + extend):** [`docs/notification-popup-system.md`](notification-popup-system.md) — scheduler order, task vs reminder tags, shared `showItemNotification` contract for bills/habits/etc.

Why Custom Windows (Not OS-Native Toasts)
OS-native notifications are filtered by Windows notification center, styled by the OS, and can't host interactive elements like "remind me in X." These must be custom Electron BrowserWindows.

Notification Window Specs
Small borderless BrowserWindow (approx 340×180px) with custom chrome
Taskbar presence (skipTaskbar: false) + Windows flashFrame attention until handled
Positionable — bottom-right by default, configurable corner (TR, BR, BL, TL)
Always-on-top; stays open until Done / Snooze / X (no auto-dismiss while waiting for action)
Minimize — hides to taskbar only (no DB change); restore re-flashes
Close (X) / window close — rem_ignored immediately (treated as ignored, no snooze)
Done — rem_completed
Snooze — rem_snoozed for notif_default_snooze_minutes (default 10, Settings → General); re-fires via scheduler
"Remind me in…" NL dialog (later enhancement) — opens inline dialog on the popup:
Text input field accepting natural language (e.g., "30 min", "1 hour", "tomorrow 9am")
Parses input → schedules new reminder → closes popup
Fallback to quick-pick dropdown if parse fails: 5 min / 15 min / 30 min / 1 hour / Tomorrow
Display flags: Debut_mode (settings, default 1 while testing) OR show_tags_always → show tags on Expired/Ignored rows
Anti-Habituation Randomization Engine
Background Color Randomization:

Toggle: "Random notification background color"
Algorithm generates random color from curated HSL range:
Hue: full random (0–360°)
Saturation: 25–70% (avoids neon/eye-searing)
Lightness: locked based on text color choice:
If text is light/white: background L = 20–45% (dark tones)
If text is dark/black: background L = 55–80% (light tones)
Text color is user-configured (default white)
WCAG contrast check runs silently — if generated color fails contrast ratio against text color, regenerates (max 3 attempts)
Sound Effects (SFX):

Toggle: "Random notification sound"
User drops .wav or .mp3 files into /data/sounds/
Sound library managed in Settings → Notifications → Sounds (add/remove/preview)
On notification trigger, random sound plays from eligible pool
Volume slider (0–100%)
If no sounds in library or toggle off → silent notification
If random toggle is off → user picks a single default sound
Notification Trigger Sources
Reminders (time-based) — implemented (`rem_*` + popup)
Tasks with due_datetime — implemented (`todo_24` alert before expire; `todo_alerted`)
Bill due alerts (1 day before, day of) — same popup pipeline when added
Habit nudges (if configured per habit — "remind me to check in at 8am") — same pipeline
Custom manual triggers from the quick-add bar (`remind` / `!` → reminder; bare text → task)
Data Storage
settings table: notif_position, notif_timeout_seconds, notif_text_color, notif_random_bg, notif_random_sfx, notif_volume, notif_grace_period_hours, notif_default_snooze_minutes, notif_default_sound, Debut_mode, show_tags_always
sound_library table: id, filename, added_date, eligible_for_random
11. Deep Theming System
Theme Architecture
Base theme: Light / Dark / Custom (starting point — sets sensible defaults)
Theme overrides: Individual component properties that override the base
Customizable Elements
Category	Properties
Buttons	Background color, hover background, text color, border color, border radius, border width
Borders	Color, width, style (solid/dashed/dotted), radius
Cards/Panels	Background, header background, shadow (on/off), border color
Text	Primary text color, secondary/muted text color, accent text color, link color
Inputs/Fields	Background, border, focus border, text color, placeholder color
Sidebar	Background, active item background, active item text, inactive text
Progress bars	Bar fill color, track color, height
Tags	Per-tag color (assignable in tag manager), tag background opacity
Checkbox/Toggle	Checked color, unchecked color
Today pane accents	Section header colors, divider lines, highlight color for "due today" items
Theme Management
Save current theme as a named preset (stored in settings as JSON)
Load previously saved presets
Export theme as .json file (shareable, backup-able)
Import theme from .json
Reset to default button per category
Themes stored in /data/themes/ and tracked in themes table
Implementation Notes for Cursor AI
Use CSS custom properties (CSS variables) as the theming backbone
Define all customizable values as --button-bg, --border-color, --text-primary, etc. in a root theme object
React context provides the theme object to all components
Theme overrides applied by setting CSS variable values dynamically via a <style> tag or document.documentElement.style.setProperty() calls
Theme JSON structure mirrors the variable names — straightforward serialize/deserialize
No heavy theming library needed — vanilla CSS variables with React-managed state layer
12. Robust Search Specification
Search Input Behavior
Multiple terms separated by spaces = flexible word matching
Order-independent: "food dog" matches "Dog Food"
Partial word matching (substring): "food" matches "Food", "Foods", "Foodstuff"
Case-insensitive
Search Modes (toggle in search bar)
Mode	Behavior	Example
Any Match (default)	Returns items matching ANY of the search terms	"dog food" → matches "Dog Food", "Dog Toys", "Food Processor"
Strict (All Match)	Returns items matching ALL search terms	"dog food" → matches "Dog Food" only
Mixed Strict	Parentheses or quotes group terms as required units	"dog food + 2026" → must contain "dog food" as a phrase AND "2026" somewhere
Exact Phrase	Quoted string matches that exact sequence	""Dog Food"" → matches only "Dog Food" exactly
Filter Options (sidebar within search results)
By date range (calendar picker or "last 7 days," "this month," "this year," custom)
By type (checkboxes: Tasks, Reminders, Notes, Events, Transactions)
By tag (multi-select tag chips — selecting multiple tags applies Any/Strict logic matching the search mode)
Implementation Notes for Cursor AI
SQLite FTS5 (Full-Text Search) supports most of this natively
FTS5 MATCH operator handles word-level matching and ranking
For mixed strict queries, the app parses the input client-side and constructs appropriate FTS5 query syntax
Substring matching may require supplementary LIKE '%term%' queries layered on top of FTS5 for partial matches
Search results grouped by type with icons
Supports tag filtering (e.g., #urgent, #groceries)
Fuzzy matching for typo tolerance
13. Feature Modules & MVP Phases
Phase 1 — Foundation
Scope:

App shell, sidebar navigation, settings storage
SQLite data layer with basic CRUD
Wallpaper system (color mode only)
Theme infrastructure (CSS variables + theme context)
Deliverables:

Functional Electron app with navigation
Settings persistence in SQLite
Basic wallpaper color picker
Light/dark mode toggle
Phase 2 — Today Pane MVP
Scope:

Tasks (create, edit, complete, delete, prioritize 1–5)
Reminders (datetime-triggered, dismissible via popup Done/Snooze/X)
Quick-add bar (natural language entry → routes to correct module; task `p1`–`p5`)
Daily brief aggregation logic pulling from tasks + reminders (priority-sorted)
Basic notification windows (taskbar + flash; Done/Snooze/Min/X — no randomization yet)
Deliverables:

Landing Today pane working
Task and reminder creation/editing
Basic popup notifications
Phase 3 — Expanded Tracking
Scope:

Calendar view (month grid, event creation)
Bills tracker (due dates, recurrence, paid/unpaid status)
Money/expenditure logging (manual entry, categories, tags)
Habit tracker (create habits, daily check-in, streak visualization)
Notification triggers for bills and habits
Deliverables:

All five core tracking modules functional
Integration into Today pane
Phase 4 — Widgets, Lists & Anti-Habituation
Scope:

Spending graphs (monthly breakdown by category)
Habit consistency graphs (weekly/monthly heatmap or bar chart)
Weather widget (optional, API-fed, toggle in settings)
Lists management system (full implementation with panel, fullscreen expand, filter)
Notification randomization engine (random bg + random SFX)
Deep theme customization UI
Tag Inspector (auto-run on launch + manual trigger)
Cleanup containers (7+ Days Expired, Completed, Archive)
Padlock/lock feature
Deliverables:

All differentiating features live
Full tag lifecycle system operational
Lists filing cabinet working
Phase 5 — Polish & Export
Scope:

Robust search across all data types (with mixed strict mode)
Tag system (create, assign, filter, color-code)
Export to Markdown (.md) — per module or full dump
Export to PDF — formatted print of selected views
Portable build configuration (electron-builder target: ["dir"])
Tag naming templates system
Container auto-archive/delete timers
Deliverables:

Production-ready portable build
All export functionality working
Search robust enough to handle complex queries
App ready for regular daily use
14. Security & Network Design
Security Principles
Offline-first: All core features work with zero internet connection
Inbound-only: Only optional weather API makes outbound requests; all other data stays local
No telemetry, no analytics, no cloud sync — nothing leaves the machine
Data at rest: SQLite file sits in the app directory alongside the exe — user controls it physically (USB stick = full ownership)
Future option: Encrypt the SQLite database with SQLCipher for at-rest encryption (low effort to add later)
Weather API: If implemented, API key stored locally in settings, request goes to provider only, no data sent outbound beyond city name/query
Threat Model
Physical device theft: Data encrypted? No — but user owns physical control (USB stick)
Malware infection: No network calls except weather API (which can be disabled)
User error: Container system prevents accidental mass deletion (confirm dialogs, restore options)
15. Export System
Markdown Export
Each module can export its data as structured .md (headers, tables, checkboxes for tasks)
Batch export: "Export everything" creates a timestamped folder with .md files per module + a combined PDF
Export location: Defaults to /data/exports/ in the app directory; user can choose alternate path
PDF Export
Uses the rendered UI (print-to-PDF via Electron's built-in print API)
User selects a view, hits export, gets a clean PDF
Export File Structure
/data/exports/
└── 2026-08-05_full_export/
    ├── tasks.md
    ├── reminders.md
    ├── habits.md
    ├── bills.md
    ├── finances.md
    ├── calendar_events.md
    ├── notes.md
    └── combined_report.pdf

16. Portability Requirements
Build Configuration
Build target: target: ["dir"] in electron-builder.yml — produces an unpacked folder containing the .exe and all assets
Better option than portable target (which extracts to temp): dir allows direct copy-paste to USB stick
App detects its own executable directory at startup and creates/reads the data/ folder there
No registry entries, no AppData dependencies — everything self-contained
User copies folder to USB → plugs into another Windows 11 machine → runs the exe → full data persists
Portable Folder Structure
/personal-dashboard-portable/
├── personal-dashboard.exe
├── resources/
│   ├── app.asar
│   └── ... (all app assets)
├── data/
│   ├── dashboard.db
│   ├── wallpapers/
│   ├── sounds/
│   ├── exports/
│   └── themes/
├── package.json
└── README.md

Copy entire folder to USB stick. Works on any Windows 11 machine with no installation required.

17. Cursor AI Development Notes
Starting Points for Vibe-Coding Sessions
First Milestone: Scaffold Phase 1 — get the shell, SQLite layer, and wallpaper color picker working before moving forward
Use React with functional components and hooks throughout
SQLite access: better-sqlite3 (synchronous, fast, well-suited for Electron main process)
IPC bridge: Main process handles all database reads/writes; renderer requests via Electron IPC
Keep all file I/O in the main process — never let the renderer touch the filesystem directly
Date handling: date-fns throughout for consistency
Charting: recharts for graphs (spending, habits)
Styling: CSS custom properties in theme-variables.css as the theming backbone
Build config: electron-builder with target: ["dir"] for the portable folder build
Cursor Rules File (.cursorrules)
Create a .cursorrules file at project root with:

# Personal Dashboard Project Rules

## Code Style
- Use React functional components with hooks
- Use async/await for all async operations
- Use ES6+ syntax (arrow functions, template literals, destructuring)
- Comment public functions explaining purpose and params
- No console.log() in production code — use a simple logger utility

## File Organization
- All database logic in /src/main/database.js
- All IPC handlers in /src/main/ipc-handlers.js
- All renderer UI in /src/renderer
- All services in /src/services (business logic)
- All utilities in /src/utils (pure functions)

## Database Patterns
- Use better-sqlite3 for all SQLite operations
- Wrap all DB operations in try/catch blocks
- Log errors to file (not console) with timestamp
- Never expose raw SQL to the renderer — all queries through main process

## Theme System
- All themeable values in CSS custom properties (root element)
- Theme changes applied via React context + DOM API
- Persist theme JSON to settings table

## Build Process
- Target is portable folder (`dir`), not single exe
- Test build locally with `electron-builder --dir` before publishing

18. Decision Log
Item	Decision	Status
Tech stack	Electron + React + SQLite	✅ Locked
Data storage	Single SQLite file in app directory	✅ Locked
Core view	"Today" pane as landing screen	✅ Locked
Build format	Unpacked folder (target: ["dir"])	✅ Locked
Security model	Offline-first, inbound-only, no telemetry	✅ Locked
Export	.md + PDF via Electron print API	✅ Locked
To-do creation	Mandatory choice: 24hr or Open	✅ Locked
To-do expiry	Auto-tag todo_expired after 24hr window	✅ Locked
Expired handling	Stays in Today pane "Expired" section, nag visually, RMB context menu	✅ Locked
List management system	Lists pane with folder-style UI, fullscreen expand, date filtering	✅ Locked
List naming	Default templates (Current Date, Project, Other), user-extensible	✅ Locked
Reminder creation	Mandatory choice: Today / Tomorrow / Choose Date / Open	✅ Locked
Reminder lifecycle	fired → ignored (if not completed) → stays in data, tagged	✅ Locked
Reminder grace period	1-hour grace window with rem_grace tag	✅ Locked
Daily lists	Tag-based — no rigid daily containers	✅ Locked
7+ Days Expired	Auto-move after configurable period, select all/delete all, auto-delete toggle (off by default)	✅ Locked
Completed container	Separate from expired, bulk/individual archive or delete, restore option	✅ Locked
Archive (trash can)	Final holding area, retention limit configurable (default 3 years), filesize warnings	✅ Locked
Padlock/lock feature	Per-item lock, auto-tagged locked, excluded from bulk/auto deletes, searchable	✅ Locked
Tag inspector	Runs on launch + manual trigger, checks lifecycle tag transitions, logs changes	✅ Locked
Search modes	Any Match (default), Strict (All), Mixed Strict (parentheses), Exact Phrase (quotes)	✅ Locked
FTS5 implementation	SQLite full-text search + LIKE fallback for substring matching	✅ Locked
Wallpaper images	Copied into /data/wallpapers/ (not referenced externally)	✅ Locked
Random wallpaper	Toggle + per-image eligibility flag	✅ Locked
Notifications	Custom Electron BrowserWindows with taskbar entry + flashFrame (not OS toasts)	✅ Locked
Notification randomization	HSL-constrained random bg + random SFX pool	✅ Locked
Snooze mechanism	Default minutes (Settings) now; NL input + dropdown later	✅ Locked
Popup close (X)	Immediate rem_ignored (no grace / no snooze)	✅ Locked
Tag visibility	Debut_mode=1 OR show_tags_always setting	✅ Locked
Theming	CSS custom properties + React context	✅ Locked
Theme persistence	JSON blobs in SQLite + import/export	✅ Locked
Phasing	5 phases, foundation → Today pane → tracking → widgets/lists/notifications → polish/export	✅ Locked
End of Master Blueprint Document — Version 1.0

Generated: 05 August 2026

