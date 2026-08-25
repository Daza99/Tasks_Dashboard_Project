import React from 'react';

/**
 * Select-all checkbox + bulk Delete, scoped to the currently listed rows.
 * @param {{
 *   selectAllRef: React.Ref,
 *   allVisibleSelected: boolean,
 *   selectableCount: number,
 *   selectedCount: number,
 *   onSelectAllChange: (checked: boolean) => void,
 *   onDelete: () => void,
 *   selectAllAriaLabel?: string,
 *   children?: React.ReactNode,
 * }} props
 */
export default function ListSelectToolbar({
  selectAllRef,
  allVisibleSelected,
  selectableCount,
  selectedCount,
  onSelectAllChange,
  onDelete,
  selectAllAriaLabel = 'Select all visible items',
  children,
}) {
  return (
    <div className="tracker-list-toolbar">
      <div>{children}</div>
      <div className="tracker-list-toolbar__right">
        <label className="bill-check">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleSelected}
            disabled={!selectableCount}
            onChange={(e) => onSelectAllChange(e.target.checked)}
            aria-label={selectAllAriaLabel}
          />
          Select all
        </label>
        <button
          type="button"
          className="danger"
          disabled={!selectedCount}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
