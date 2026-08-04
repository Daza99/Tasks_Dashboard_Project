# Personal Dashboard

Offline-first desktop dashboard (Electron + React + SQLite). Portable USB folder build.

## Spec

Full product blueprint (phases, schema, lifecycle, UI):  
[`docs/Master_Dashboard_blueprint_Lumo_v2.md`](docs/Master_Dashboard_blueprint_Lumo_v2.md)

## Phase 3 (current)

- Habits — create, check-in, streak, optional nudge popup
- Bills — due dates, recurrence, paid/overdue, day-before/day-of popups
- Calendar — month grid + event CRUD
- Spending — manual transactions + Money snapshot on Today brief
- Today brief integrates all four modules

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


## Portable build

```bash
npm run dist:dir
```

Output under `release/` — copy the unpacked folder to a USB stick. Data lives in `data/` beside the exe.

## Layout

- **Compact** — left nav, Due Today brief, Archive/Completed rail
- **Focus** — full center panel for module work; **Compact** button restores glance mode
