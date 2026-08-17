# Dev note: White dialog + white text (confirm shell)

**Date:** 2026-08-17  
**Symptom:** Settings > Data “Restore backup?” (and other confirm/details/nudge modals) showed a white/milky panel with unreadable light text. Unclassed Cancel was white-on-white.

## Root cause

Two stacked contrast failures on Dark Glass:

1. **Nested glass.** `.confirm-dialog` uses `glass-panel` (`backdrop-filter`) inside the focus host, which also has `backdrop-filter`. Chromium washes the inner panel milky **white** while title/body stay `--text-primary` (`#f2f5f8`).
2. **Native chrome.** [`base.css`](../src/renderer/styles/base.css) sets `button, input, select { color: inherit }`. Windows Cancel / date / time / `<select>` option lists are **white**, so inherited theme text disappears.

Same family: `ConfirmDialog`, `DetailsDialog`, `NudgeCustomDialog` (all `.confirm-dialog`).

## Fix

In [`src/renderer/styles/components.css`](../src/renderer/styles/components.css):

- `.confirm-dialog`: `background: #fff; color: #111`
- `h2` / `p`: `#111` (body no longer `--text-secondary`)
- Unclassed actions only:  
  `.confirm-dialog__actions button:not(.btn-primary):not(.danger):not(.btn-nudge-cancel) { color: #111 }`

Leave `.btn-primary`, `.danger`, `.btn-nudge-cancel` as-is.

Already patched elsewhere (do not undo): `.nudge-custom-fields input/select { color: #111 }`; filter/search `select option { color: #000; background: #fff }`.

## If it reoccurs

1. New overlay using `glass-panel` inside `.focus-host` without a solid light bg + dark text.
2. Unclassed `<button>` / native `input[type=date|time]` / `<select>` inheriting `--text-primary` on Windows light chrome.
3. Do **not** fix with a global `select { color: #111 }` — themed selects sit on dark `--input-bg`.

## Related files

- `src/renderer/components/ConfirmDialog.jsx`
- `src/renderer/components/DetailsDialog.jsx`
- `src/renderer/components/NudgeCustomDialog.jsx`
- `src/renderer/styles/glass.css` — `.glass-panel`
- `docs/DEV_REMINDER.md` — standing rule
