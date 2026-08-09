# Dev note: Blank blue window / Boot error (tag-helpers)

**Date:** 2026-08-09  
**Symptom:** Electron window opens with native menu (File / Edit / View) but content area is blank blue (`#0a1628`). No dashboard UI.

## Root cause

After adding shared tag helpers, the Vite renderer imported CommonJS via:

```js
import helpers from './tag-helpers.cjs'; // BROKEN under Vite
```

Vite/ESM expects a **default export**. A plain `module.exports = { … }` `.cjs` file does **not** provide `default`, so module evaluation fails with:

```
SyntaxError: The requested module '.../tag-helpers.cjs?import'
does not provide an export named 'default'
```

That aborts the React boot graph before `App` mounts → only the BrowserWindow background shows.

## Fix

Split by runtime:

| Consumer | File | Format |
|----------|------|--------|
| Vite renderer | [`src/utils/tag-helpers.js`](../src/utils/tag-helpers.js) | Pure **ESM** (`export function …`) |
| Electron main / services | [`src/utils/tag-helpers.cjs`](../src/utils/tag-helpers.cjs) | **CommonJS** (`module.exports = …`) |

Renderer imports **only** from `tag-helpers.js`. Main process `require`s **only** `tag-helpers.cjs`. Do **not** re-export CJS into ESM with `import x from './….cjs'`.

## If it reoccurs

1. Look for a **Boot error** overlay or DevTools console (`Ctrl+Shift+I`) for `does not provide an export named 'default'` (or similar ESM/CJS interop errors).
2. Search renderer for `from '….cjs'` / `import … from` of Node-style modules.
3. Prefer: pure ESM for anything Vite bundles; keep `.cjs` for main-only `require`.
4. Confirm Vite is up (`npm run dev` → both Vite `:5173` and Electron). A dead Vite URL also yields a blank window, but **without** this SyntaxError.

## Related files

- `src/renderer/main.jsx` — React entry
- `src/utils/tag-helpers.js` / `tag-helpers.cjs`
- `src/main/index.js` — `backgroundColor: '#0a1628'` (the blank blue)
