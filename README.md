# Personal Dashboard

Offline-first desktop dashboard (Electron + React + SQLite). Portable USB folder build.

## Spec

Full product blueprint (phases, schema, lifecycle, UI):  
[`docs/Master_Dashboard_blueprint_Lumo_v2.md`](docs/Master_Dashboard_blueprint_Lumo_v2.md)

## Phase 2 (current)
- Tasks / Reminders CRUD with mandatory creation choices
- Compact Due Today brief (live)
- Quick Add bar
- Basic reminder popup windows (dismiss / done)

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


## Portable build

```bash
npm run dist:dir
```

Output under `release/` — copy the unpacked folder to a USB stick. Data lives in `data/` beside the exe.

## Layout

- **Compact** — left nav, Due Today brief, Archive/Completed rail
- **Focus** — full center panel for module work; **Compact** button restores glance mode
