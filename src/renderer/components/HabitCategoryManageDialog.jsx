import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Rename or delete a habit category. Delete offers merge when other
 * categories exist; decline merge → Uncategorized. Solid #fff/#111 shell.
 * @param {{
 *   open: boolean,
 *   categoryName: string,
 *   categories: string[],
 *   onCancel: () => void,
 *   onDone: (result: object) => void,
 * }} props
 */
export default function HabitCategoryManageDialog({
  open,
  categoryName,
  categories = [],
  onCancel,
  onDone,
}) {
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // { kind: 'empty'|'uncategorize'|'choose', count }
  const [deleteStep, setDeleteStep] = useState(null);
  const [mergeDest, setMergeDest] = useState('');

  useEffect(() => {
    if (!open) return;
    setRenameValue(categoryName || '');
    setError('');
    setBusy(false);
    setDeleteStep(null);
    setMergeDest('');
  }, [open, categoryName]);

  if (!open) return null;

  const others = categories.filter((n) => n !== categoryName);

  async function doRename(e) {
    e.preventDefault();
    const dest = renameValue.trim();
    if (!dest || busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await window.api.renameHabitCategory(categoryName, dest);
      onDone({ action: 'rename', ...result });
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  }

  async function askDelete() {
    if (busy) return;
    setError('');
    try {
      const count = await window.api.countHabitsWithCategory(categoryName);
      if (count === 0) {
        setDeleteStep({ kind: 'empty', count: 0 });
      } else if (!others.length) {
        setDeleteStep({ kind: 'uncategorize', count });
      } else {
        setMergeDest('');
        setDeleteStep({ kind: 'choose', count });
      }
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function doUncategorize() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.api.deleteHabitCategory(categoryName);
      setDeleteStep(null);
      onDone({ action: 'delete', ...result });
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(false);
      setDeleteStep(null);
    }
  }

  async function doMerge() {
    if (busy || !mergeDest) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.api.mergeHabitCategories(mergeDest, categoryName);
      setDeleteStep(null);
      onDone({ action: 'merge', ...result });
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(false);
      setDeleteStep(null);
    }
  }

  const n = deleteStep?.count ?? 0;
  const habitWord = n === 1 ? 'habit' : 'habits';

  return createPortal(
    <>
      <div
        className="confirm-overlay"
        role="presentation"
        onClick={() => {
          if (!deleteStep) onCancel();
        }}
      >
        <div
          className="confirm-dialog bill-cat-manage"
          role="dialog"
          aria-modal="true"
          aria-labelledby="habit-cat-manage-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="habit-cat-manage-title">Edit category</h2>
          <p>
            Working on <strong>{categoryName}</strong>.
          </p>

          <form className="bill-cat-manage__block" onSubmit={doRename}>
            <label className="edit-label">
              Rename
              <input
                type="text"
                className="confirm-dialog__input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                aria-label="New category name"
              />
            </label>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || !renameValue.trim()}
            >
              Rename
            </button>
          </form>

          <div className="bill-cat-manage__block">
            <span className="edit-label">Delete</span>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={askDelete}
            >
              Delete
            </button>
          </div>

          {error ? <p className="bill-cat-manage__error">{error}</p> : null}

          <div className="confirm-dialog__actions">
            <button type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      {deleteStep ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => {
            if (!busy) setDeleteStep(null);
          }}
        >
          <div
            className="confirm-dialog bill-cat-manage"
            role="dialog"
            aria-modal="true"
            aria-labelledby="habit-cat-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="habit-cat-delete-title">Delete category?</h2>
            {deleteStep.kind === 'empty' ? (
              <p>
                Delete empty category &quot;{categoryName}&quot;?
              </p>
            ) : null}
            {deleteStep.kind === 'uncategorize' ? (
              <p>
                {n} {habitWord} will become Uncategorized. Delete &quot;
                {categoryName}&quot;?
              </p>
            ) : null}
            {deleteStep.kind === 'choose' ? (
              <>
                <p>
                  {n} {habitWord} {n === 1 ? 'is' : 'are'} in &quot;{categoryName}
                  &quot;. Merge them into another category, or leave them
                  Uncategorized.
                </p>
                <div className="bill-cat-manage__block">
                  <label className="edit-label">
                    Move to
                    <select
                      value={mergeDest}
                      onChange={(e) => setMergeDest(e.target.value)}
                      aria-label="Merge into category"
                    >
                      <option value="">Select…</option>
                      {others.map((name) => (
                        <option key={`dest-${name}`} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            ) : null}

            <div className="confirm-dialog__actions">
              <button
                type="button"
                onClick={() => setDeleteStep(null)}
                disabled={busy}
              >
                Cancel
              </button>
              {deleteStep.kind === 'choose' ? (
                <>
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={doUncategorize}
                  >
                    Uncategorized
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || !mergeDest}
                    onClick={doMerge}
                  >
                    Merge
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={doUncategorize}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body
  );
}
