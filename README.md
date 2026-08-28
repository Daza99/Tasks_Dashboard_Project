# Personal Dashboard

Offline-first desktop dashboard (Electron + React + SQLite). Portable USB folder build.

## Spec

Full product blueprint (phases, schema, lifecycle, UI):  
[`docs/Master_Dashboard_blueprint_Lumo_v2.md`](docs/Master_Dashboard_blueprint_Lumo_v2.md)

## Phase 4 (current)

- Cleanup containers — 7+ Days Expired, Completed, Archive (restore / archive / delete, bulk + confirm)
- Padlock — per-item lock, `#locked`, excluded from bulk/auto-delete
- Lists — To-Do checklists, bullet notepads, MD notes; date filter, rename/merge, export stub
- Settings → General: retention days (1–30), archive years, auto-delete toggles (off), filesize warning

Phase 3 tracking modules remain (Habits, Bills, Calendar, Spending, Today brief).

## Dev

```bash
npm install
npm run dev
```

Quick Add examples:
- `buy milk` → 24hr task
- `todo open read book #later` → open task + tag
- `remind call mom at 5pm` → today reminder
- `remind dentist tomorrow` → tomorrow reminder
- `$12.50 coffee` / `spent 12.50 groceries lunch` → transaction
- `habit stretch daily` / `habit gym weekdays` → habit


## v1.08

Polish on existing features (no new modules).

## Portable build

```bash
npm run dist:portable
```

(`dist:dir` is an alias.) Output: `release/portable/win-unpacked/`. Copy that **entire** folder to a USB stick (NTFS or exFAT — not FAT32; SQLite WAL locking fails on FAT32).

First run creates `data/` beside the exe: `dashboard.db`, Chromium userData (`data/chromium/`), plus `wallpapers/`, `sounds/`, `exports/`, `themes/`, `backups/`. Nothing is written to `%APPDATA%`. Menubar: **V1.08 (Portable)**.

## Desktop install

```bash
npm run dist:desktop
```

Output: `release/desktop/Personal Dashboard Setup 1.0.8.exe` (per-user NSIS, no admin). Data default: `%APPDATA%\personal-dashboard\data`. Chromium cache stays in AppData. Settings → Data can move the data folder (copy + relaunch; old folder is left in place). Menubar: **V1.08 (Desktop)**.

To preview the data-folder picker in dev (PowerShell): `$env:DASHBOARD_FLAVOR='desktop'; npm run dev`.

## Layout

- **Compact** — left nav, Due Today brief, Archive/Completed rail
- **Focus** — full center panel for module work; **Compact** button restores glance mode
