# Dev note: Notification RNG looked like “always white + same dull-blue border”

**Date:** 2026-08-20  
**Symptom:** Every popup was cream/off-white with black text and the same slate-blue border. Random fill + random border never appeared.

## Root cause

`pickNotifTheme(randomize)` only randomizes when `settings.notif_random_bg === 'true'`. That key was seeded `'false'` in `DEFAULT_SETTINGS`. `seedSettings()` is `INSERT OR IGNORE`, so flipping the JS default later does **not** update existing DBs.

The picker then always returned the fixed theme:

- bg `#F4F1EA` (reads as white)
- border `#4A5A6A` (the dull blue)
- text `#111111` (locked)

Settings → General had a checkbox, but it originally persisted only on **Save**. Checking the box without Save left SQLite at `'false'`. Runtime logs on four consecutive popups: `rawRandom: "false"`, query `bgColor=F4F1EA` / `borderColor=4A5A6A`.

Secondary: `transparent: true` BrowserWindow on Windows. A 2px CSS `border` computed ~1.4px and was easy to miss; cream fill + missing stroke = “all white”.

`notif_text_color` is unused by the popup (text is locked `#111`). Do not wire it back as white — that would break the light cards.

## Fix

- Default `notif_random_bg` to `'true'`.
- One-time migrate `migrateNotifRandomDefault()` keyed by `notif_random_bg_enable_v1`. Flips stored `'false'` → `'true'` once; later opt-out via the checkbox is kept.
- Checkbox writes SQLite immediately on toggle (Save still writes it too).
- Popup chrome: CSS vars `--notif-bg` / `--notif-border` / `--notif-text`. Hex in `loadFile` query **without `#`**. Opaque light fill. **3px border + `box-shadow: 0 0 0 3px var(--notif-border)`** so the stroke paints on transparent windows.
- Engine: [`src/utils/notif-colors.cjs`](../src/utils/notif-colors.cjs) — curated light pastels + darker borders, hue-family matching.

## If it reoccurs

1. All popups identical cream + slate → `notif_random_bg` is not the string `'true'` (checkbox off, migrate skipped, or value type mismatch).
2. Colors in query/computed style but look white on screen → transparent window not painting fill/border; keep the box-shadow ring; do not go back to 1px neon on a light card.
3. Do **not** restore dark card + `#fff` text. Black text is locked; fills must stay light.
4. Adding a new default setting: `INSERT OR IGNORE` will not change rows that already exist — add a one-time migrate key.

## Related files

- `src/utils/notif-colors.cjs` — palettes + `pickNotifTheme`
- `src/main/notification-window.js` — reads flag, passes query hex
- `src/main/notification.html` — CSS vars, outline actions, `#111` text
- `src/main/database.js` — default + `migrateNotifRandomDefault`
- `src/renderer/settings-tabs/SettingsGeneral.jsx` — toggle
- `docs/DEV_REMINDER.md` — standing rule
