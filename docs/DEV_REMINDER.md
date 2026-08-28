# Dev reminder — read before planning

Standing don’t-break list. Product decisions: [`Master_Dashboard_blueprint_Lumo_v2.md`](Master_Dashboard_blueprint_Lumo_v2.md). Code layout / IPC / dates: [`.cursorrules`](../.cursorrules). Confirm the change with the user before writing code.

## Dialog / native-chrome contrast

Dark Glass `--text-primary` is `#f2f5f8`. Windows native buttons, date/time, and `<select>` option lists are **white**. Nested `.glass-panel` + `backdrop-filter` also washes modals milky white.

- Shared modal shell (`.confirm-dialog`): **solid `#fff` + text `#111`**. Portal overlays to `document.body` (escape nested glass). Do not revert to themed light text on that shell.
- Unclassed `<button>` (no parent action styles) = Win32 white chrome + inherited light text. Class it (`.btn-light` / `.btn-primary` / `.danger`).
- Unclassed Cancel in `.confirm-dialog__actions`: `#111`. Leave `.btn-primary` / `.danger` / `.btn-nudge-cancel` alone.
- Native fields inside a light surface: force `color: #111` (see `.nudge-custom-fields`). Filter/search `select option`: black on white.
- Do **not** blanket `select { color: #111 }` — themed selects use dark `--input-bg` and would invert.

Incident: [`dev-note-dialog-contrast.md`](dev-note-dialog-contrast.md).

## Notification random colors

Popup text is locked `#111`. Fills stay light pastels. `notif_random_bg` must be the string `'true'` or every popup is cream `#F4F1EA` + slate `#4A5A6A` (looks like “white + dull blue”). `seedSettings()` is `INSERT OR IGNORE` — changing a JS default does not update existing rows; use a migrate key.

Transparent Electron windows often drop a thin CSS border; keep the 3px stroke + `box-shadow` ring. Do not restore dark card + white text.

Incident: [`dev-note-notif-random-colors.md`](dev-note-notif-random-colors.md).

## Lists hashtags / Tag Inspector

List tags use `item_tags` with `item_type = 'list'`. Tag Inspector orphan repair **deletes** any `item_type` not in `TAGGED_TYPES` + `PARENT_TABLE`. When adding a new tagged entity type, register it there (and in `tags.js`) or tags vanish on the next scheduler/launch tick and Lists filters look empty.

Incident: [`dev-note-lists-hashtag-orphan.md`](dev-note-lists-hashtag-orphan.md).

## Tag ghost autocomplete (do not re-break)

Grey remainder + Tab complete is a **transparent input over an opaque `.tag-input` wrapper**. The ghost layer is behind the field. An opaque `#28374f` (or any solid fill) on `.tag-input__field` hides `.tag-input__ghost-rest` even when `matchTagPrefix` works. Keep `!important` transparent field bg vs `.create-form input[type=text]`. Do not “fix Light Glass wash” by filling the input.

Incident: [`dev-note-tag-ghost-autocomplete.md`](dev-note-tag-ghost-autocomplete.md).

## Dates

Storage and display: `yyyy-mm-dd` only. Module hints that mention dates get `(date method: yyyy-mm-dd)`.

## Layout

Compact = left nav + center brief + right rail. Focus = full center; Compact restores. No decorative corner brackets.

## Other

- DB only via main process IPC. No raw SQL in the renderer. No `console.log` in production (logger utility).
- Portable `dir` build, not a single exe.
