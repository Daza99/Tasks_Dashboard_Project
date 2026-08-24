/**
 * LMB double-click on a list row opens edit.
 * Ignores action buttons and form controls so Done/Del/Paid/Check/Lock stay independent.
 * Generic `button` is not skipped — Calendar day titles are buttons; action clusters cover the rest.
 * @param {() => void} openEdit
 * @returns {(e: MouseEvent) => void}
 */
export function rowDblClick(openEdit) {
  return (e) => {
    const t = e.target;
    if (
      t?.closest?.(
        'a, input, textarea, select, label, .item-row__actions, .today-view__actions'
      )
    ) {
      return;
    }
    openEdit();
  };
}
