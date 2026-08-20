# Dev note: Lists vanish after tab switch (hashtag filter empty)

**Date:** 2026-08-20  
**Symptom:** Newly created To-Do / Bullet / MD lists appeared under `#list`, then vanished after switching list-type tabs (or after ~tens of seconds). Rows were still in `lists`; the left rail showed “No lists in this filter.” Range **All** was fine — the **hashtag** filter was empty.

## Root cause

List hashtags use the shared `item_tags` table with `item_type = 'list'`.

Tag Inspector’s `repairOrphans()` deletes any `item_tags` whose `item_type` is **not** in `TAGGED_TYPES`. That set was only:

`task | reminder | habit | transaction | tracker`

So every inspector run (app launch + scheduler ticks) treated list tags as unknown and **deleted them**.

Runtime evidence (same session):

1. `createList` → id tagged `list`; `listLists({ type, tag: 'list' })` returned that id.
2. Minutes/switches later: `listLists` → `filteredCount: 0` while `SELECT id FROM lists WHERE type = ?` still included the same ids.

Creates were fine; the filter looked broken because tags had been wiped.

## Fix

1. Register lists in Tag Inspector and the tags catalog:
   - `TAGGED_TYPES` includes `'list'`
   - `PARENT_TABLE.list = 'lists'` (orphan check: tag row must still have a parent list)
2. One-time migrate `migrateListsHashtagRetagAfterInspector()` keyed by `lists_hashtag_retag_v2`: re-attach `#list` to any list that has no user tag (covers rows wiped before the inspector fix).

Earlier migrate `lists_hashtag_backfill_v1` only ran once and did not re-run after the wipe.

## If it reoccurs

1. Rail empty under `#list` but `lists` table still has rows → check `item_tags` for `item_type = 'list'`. Empty = orphan repair or missing create-path `addTag`.
2. Adding a **new** `item_type` to `item_tags` → also add it to:
   - [`src/services/db/tag-inspector.js`](../src/services/db/tag-inspector.js) `TAGGED_TYPES` + `PARENT_TABLE`
   - [`src/services/db/tags.js`](../src/services/db/tags.js) `TAGGED_TYPES` (and `listTagItems` UNION / hydrate if the Tags view should show those items)
3. Do **not** “fix” empty rails by dropping the hashtag filter without checking inspector — lists will look fine until the next tick deletes tags again.
4. Tag Inspector audit log / “orphan item_tags removed (`list#N`)” is the smoking gun.

## Related files

- `src/services/db/tag-inspector.js` — `repairOrphans`, `TAGGED_TYPES`
- `src/services/db/lists.js` — `createList` + `listLists` tag filter
- `src/services/db/tags.js` — `addTag`, catalog `TAGGED_TYPES`
- `src/main/database.js` — `lists_hashtag_backfill_v1`, `lists_hashtag_retag_v2`
- `src/services/list-hashtags.js` — file whitelist (`data/list-hashtags.txt`)
- `src/renderer/lists-view/ListsPanel.jsx` — hashtag filter bar
