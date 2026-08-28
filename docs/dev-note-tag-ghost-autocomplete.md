# Dev note: Tag ghost autocomplete “stopped working”

**Date:** 2026-08-28  
**Symptom:** Tags bar no longer showed the light-grey remainder of a matching tag. Tab-to-complete looked dead. It had worked before.

## Root cause

Logic was fine. `useTagCatalog` → `listTags({ userOnly: true })` returned real names. `matchTagPrefix` + `parseCurrentTagToken` produced a prediction (`#test` → `testroast`, suffix `roast`; `#cur` → `cursoraiproject`). `.tag-input__ghost-rest` was in the DOM (`display: block`, color `rgba(242, 245, 248, 0.35)`).

The ghost layer sits **behind** the `<input>` (`position: relative` on the field, later in DOM). A later CSS “fix” painted an **opaque** Dark Glass navy `#28374f` on `.tag-input input.tag-input__field` (`!important`) so Light Glass / wallpaper / `.create-form input[type=text]` could not wash the control. That fill covered the ghost. Tab never looked useful because there was nothing to accept visually; keydown still only fires if focus is in the field.

Runtime: `fieldBg: rgb(40, 55, 79)` with non-empty `ghostSuffix`.

## Fix

- Opaque navy + radius on **`.tag-input`** (wrapper). Wallpaper cannot show through.
- **`.tag-input__field`**: `background: transparent !important` so `.tag-input__ghost-rest` shows through. Typed text stays on the input (`color: #f2f5f8`). `.tag-input__ghost-typed` stays transparent.
- Ghost `z-index: 0`, field `z-index: 1`. Pointer-events none on the ghost.
- Keep `!important` on field bg/border/color — `.create-form input[type=text]` is (0,2,1) and previously won with Light Glass `rgba(255,255,255,0.9)`.

Same classes: `TagInput`, `TagSearchInput`, Quick Add (`.quick-add__field-wrap.tag-input`), Lists hashtag editors.

## If it reoccurs

1. Grey suffix missing but Tab still completes → CSS stacking. Do **not** put an opaque fill on the input. Check computed `background-color` on `.tag-input__field`; it must be transparent. Fill belongs on `.tag-input`.
2. Neither ghost nor Tab → catalog empty (`listTags` / `window.api`), or `bare` empty (`#` only), or prefix not in catalog (`#cus` does not match `cursoraiproject`). `matchTagPrefix` requires `n.startsWith(p) && n !== p`.
3. Ghost visible, Tab does nothing → focus not on the field, or another handler taking Tab. `TagInput` `preventDefault`s Tab only when `prediction` is set.
4. Do **not** “fix contrast” by restoring opaque `#28374f` on the field. Do **not** drop `!important` without re-checking `.create-form input[type=text]`.
5. Autofill `box-shadow: inset 1000px` on the field would hide the ghost again; tag fields use `autoComplete="off"`.

## Related files

- `src/renderer/styles/components.css` — `.tag-input` / `__ghost` / `__field`
- `src/renderer/components/TagInput.jsx` — multi-tag field, Tab accept
- `src/renderer/components/TagSearchInput.jsx` — filter/search `#…`
- `src/renderer/components/QuickAddBar.jsx` — `#` token in free text
- `src/renderer/lists-view/ListHashtagInput.jsx`, `ListHashtagEditor.jsx`
- `src/utils/tag-helpers.js` — `matchTagPrefix`, `parseCurrentTagToken`
- `src/renderer/hooks/useTagCatalog.js` — autocomplete names
- `docs/DEV_REMINDER.md` — standing rule
