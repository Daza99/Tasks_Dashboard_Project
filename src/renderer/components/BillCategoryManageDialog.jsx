import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from './ConfirmDialog';

/**
 * Rename, delete, or merge a bill category. Solid #fff/#111 shell.
 * @param {{
 *   open: boolean,
 *   categoryName: string,
 *   categories: string[],
 *   onCancel: () => void,
 *   onDone: (result: object) => void,
 * }} props
 */
export default function BillCategoryManageDialog({
  open,
  categoryName,
  categories = [],
  onCancel,
  onDone,
}) {
  const [renameValue, setRenameValue] = useState('');
  const [keep, setKeep] = useState('');
  const [mergeAway, setMergeAway] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: 'delete'|'merge', count }

  useEffect(() => {
    if (!open) return;
    setRenameValue(categoryName || '');
    setKeep(categoryName || '');
    setMergeAway('');
    setError('');
    setBusy(false);
    setConfirm(null);
  }, [open, categoryName]);

  if (!open) return null;

  const mergeReady = Boolean(keep && mergeAway && keep !== mergeAway);

  async function doRename(e) {
    e.preventDefault();
    const dest = renameValue.trim();
    if (!dest || busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await window.api.renameBillCategory(categoryName, dest);
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
      const count = await window.api.countBillsWithCategory(categoryName);
      setConfirm({ kind: 'delete', count });
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function askMerge() {
    if (!mergeReady || busy) return;
    setError('');
    try {
      const count = await window.api.countBillsWithCategory(mergeAway);
      setConfirm({ kind: 'merge', count });
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function onConfirm() {
    if (!confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      if (confirm.kind === 'delete') {
        const result = await window.api.deleteBillCategory(categoryName);
        setConfirm(null);
        onDone({ action: 'delete', ...result });
      } else {
        const result = await window.api.mergeBillCategories(keep, mergeAway);
        setConfirm(null);
        onDone({ action: 'merge', ...result });
      }
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(false);
      setConfirm(null);
    }
  }

  const n = confirm?.count ?? 0;
  const billWord = n === 1 ? 'bill' : 'bills';
  const confirmTitle =
    confirm?.kind === 'delete' ? 'Delete category?' : 'Merge categories?';
  const confirmMessage =
    confirm?.kind === 'delete'
      ? `${n} ${billWord} will become Uncategorized. Delete "${categoryName}"?`
      : `Move ${n} ${billWord} from "${mergeAway}" into "${keep}", then delete "${mergeAway}"?`;

  return createPortal(
    <>
      <div className="confirm-overlay" role="presentation" onClick={() => {
        if (!confirm) onCancel();
      }}>
        <div
          className="confirm-dialog bill-cat-manage"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bill-cat-manage-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="bill-cat-manage-title">Edit category</h2>
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

          <div className="bill-cat-manage__block">
            <label className="edit-label">
              Keep
              <select
                value={keep}
                onChange={(e) => setKeep(e.target.value)}
                aria-label="Keep category"
              >
                <option value="">Select…</option>
                {categories.map((name) => (
                  <option key={`keep-${name}`} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="edit-label">
              Merge away
              <select
                value={mergeAway}
                onChange={(e) => setMergeAway(e.target.value)}
                aria-label="Merge away category"
              >
                <option value="">Select…</option>
                {categories.map((name) => (
                  <option key={`away-${name}`} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !mergeReady}
              onClick={askMerge}
            >
              Merge
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
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Merge'}
        danger={confirm?.kind === 'delete'}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>,
    document.body
  );
}
