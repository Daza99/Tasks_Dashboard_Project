import React from 'react';

/**
 * Shared select-all + bulk actions for cleanup containers.
 * @param {{
 *   allCount: number,
 *   selectedCount: number,
 *   onSelectAll: () => void,
 *   onClear: () => void,
 *   onRestore?: () => void,
 *   onArchive?: () => void,
 *   onDelete: () => void,
 *   deleteLabel?: string,
 * }} props
 */
export default function ContainerActions({
  allCount,
  selectedCount,
  onSelectAll,
  onClear,
  onRestore,
  onArchive,
  onDelete,
  deleteLabel = 'Delete',
}) {
  const none = selectedCount === 0;
  return (
    <div className="container-actions">
      <label className="bill-check">
        <input
          type="checkbox"
          checked={allCount > 0 && selectedCount === allCount}
          onChange={(e) => (e.target.checked ? onSelectAll() : onClear())}
          disabled={!allCount}
        />
        Select all ({selectedCount}/{allCount})
      </label>
      <div className="item-row__actions">
        {onRestore && (
          <button type="button" disabled={none} onClick={onRestore}>
            Restore
          </button>
        )}
        {onArchive && (
          <button type="button" disabled={none} onClick={onArchive}>
            Archive
          </button>
        )}
        <button type="button" className="danger" disabled={none} onClick={onDelete}>
          {deleteLabel}
        </button>
      </div>
    </div>
  );
}

/** Stable key for a task/reminder row. */
export function itemKey(row) {
  return `${row.item_type}:${row.id}`;
}

/** Payload item from a row. */
export function asRef(row) {
  return { item_type: row.item_type, id: row.id };
}

/** ISO → yyyy-mm-dd for container rows. */
export function dayStamp(iso) {
  if (!iso || String(iso).startsWith('9999')) return '—';
  return String(iso).slice(0, 10);
}
