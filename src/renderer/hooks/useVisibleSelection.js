import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Checkbox selection scoped to currently visible (filtered) row ids.
 * Optional selectableIds omits locked rows from Select all / bulk delete.
 * @param {number[]} visibleIds
 * @param {{ selectableIds?: number[] }} [opts]
 */
export function useVisibleSelection(visibleIds, opts = {}) {
  const [selected, setSelected] = useState(() => new Set());
  const selectAllRef = useRef(null);
  const rawSelectable = opts.selectableIds ?? visibleIds;
  const selectableKey = rawSelectable.join(',');
  const selectableIds = useMemo(
    () => rawSelectable,
    // Identity follows id list, not a new array each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectableKey]
  );

  // Drop ids that are no longer selectable (filters, deletes, lock)
  useEffect(() => {
    const keep = new Set(selectableIds);
    setSelected((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (keep.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectableIds]);

  const selectedVisibleCount = useMemo(() => {
    let n = 0;
    for (const id of selectableIds) if (selected.has(id)) n += 1;
    return n;
  }, [selectableIds, selected]);

  const allVisibleSelected =
    selectableIds.length > 0 && selectedVisibleCount === selectableIds.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate =
      selectedVisibleCount > 0 && selectedVisibleCount < selectableIds.length;
  }, [selectedVisibleCount, selectableIds.length]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSelectAllChange(checked) {
    if (checked) setSelected(new Set(selectableIds));
    else setSelected(new Set());
  }

  function clear() {
    setSelected(new Set());
  }

  /** Selected ids that are still selectable (safe for bulk delete). */
  function selectedList() {
    return selectableIds.filter((id) => selected.has(id));
  }

  return {
    selected,
    selectAllRef,
    selectedVisibleCount,
    allVisibleSelected,
    selectableCount: selectableIds.length,
    toggle,
    onSelectAllChange,
    clear,
    selectedList,
  };
}
