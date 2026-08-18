import React, { useEffect, useState } from 'react';
import { useBrief } from '../context/BriefContext';
import { useDatabase } from '../context/DatabaseContext';
import ConfirmDialog from '../components/ConfirmDialog';
import LockButton from '../components/LockButton';
import { formatTagsDisplay, userTagsOnly } from '../../utils/tag-helpers.js';
import ContainerActions, { asRef, dayStamp, itemKey } from './ContainerActions';

/**
 * 7+ Days Expired — auto-moved after retention; restore / archive / delete.
 */
export default function Expired7Plus() {
  const { refresh } = useBrief();
  const { settings } = useDatabase();
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null); // 'delete' | 'deleteAll' | null

  const days = settings?.retention_days_expired || '7';
  const autoDel = settings?.auto_delete_expired7 === 'true';

  async function load() {
    setError('');
    const list = await window.api.listExpired7();
    setRows(list);
    setSelected(new Set());
  }

  useEffect(() => {
    (async () => {
      await window.api.sweepContainers();
      await load();
      await refresh();
    })();
  }, []);

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function picked() {
    return rows.filter((r) => selected.has(itemKey(r))).map(asRef);
  }

  async function restore() {
    await window.api.bulkRestore({ items: picked(), from: 'expired7' });
    await load();
    await refresh();
  }

  async function archive() {
    const res = await window.api.bulkArchive({ items: picked() });
    if (res.skippedLocked) setNotice(`Skipped ${res.skippedLocked} locked item(s).`);
    await load();
    await refresh();
  }

  async function doDelete(items) {
    const res = await window.api.bulkDelete({ items });
    if (res.skippedLocked) setNotice(`Skipped ${res.skippedLocked} locked item(s).`);
    setConfirm(null);
    await load();
    await refresh();
  }

  return (
    <div className="module-view">
      <h1>7+ Days Expired</h1>
      <p className="module-view__hint">
        Auto-moved after {days} days (range 1–30 in Settings). Restore returns to
        Today Expired. Auto-delete is {autoDel ? 'ON' : 'OFF'} (default off).
        Dates: (date method: yyyy-mm-dd).
      </p>
      {notice && <p className="stub-empty">{notice}</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <ContainerActions
        allCount={rows.length}
        selectedCount={selected.size}
        onSelectAll={() => setSelected(new Set(rows.map(itemKey)))}
        onClear={() => setSelected(new Set())}
        onRestore={restore}
        onArchive={archive}
        onDelete={() => setConfirm(selected.size === rows.length ? 'deleteAll' : 'delete')}
        deleteLabel="Delete"
      />

      <ul className="module-list">
        {rows.map((r) => {
          const key = itemKey(r);
          return (
            <li key={key} className="module-list__item glass-inset module-list__item--col">
              <div className="module-list__row">
                <label className="bill-check">
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => toggle(key)}
                  />
                  <span>
                    <strong>
                      {r.item_type === 'task' ? 'Task' : 'Rem'} · {r.title}
                    </strong>
                    {r.locked ? ' 🔒' : ''}
                  </span>
                </label>
                <div className="item-row__actions">
                  <LockButton
                    itemType={r.item_type}
                    id={r.id}
                    locked={r.locked}
                    onChanged={load}
                  />
                  <button type="button" onClick={async () => {
                    await window.api.restoreItem(r.item_type, r.id, 'expired7');
                    await load();
                    await refresh();
                  }}>
                    Restore
                  </button>
                  <button type="button" onClick={async () => {
                    const res = await window.api.archiveItem(r.item_type, r.id);
                    if (res.skippedLocked) setNotice('Locked — skipped.');
                    await load();
                    await refresh();
                  }}>
                    Archive
                  </button>
                  {!r.locked && (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setSelected(new Set([key]));
                        setConfirm('delete');
                      }}
                    >
                      Del
                    </button>
                  )}
                </div>
              </div>
              <div className="module-list__meta">
                due {dayStamp(r.due_datetime || r.datetime)}
                {userTagsOnly(r.tags).length
                  ? ` · ${formatTagsDisplay(userTagsOnly(r.tags))}`
                  : ''}
              </div>
            </li>
          );
        })}
        {!rows.length && <p className="stub-empty">Nothing in 7+ Days Expired.</p>}
      </ul>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'deleteAll' ? 'Delete all?' : 'Delete selected?'}
        message="Permanent delete. Locked items are skipped. OK to delete?"
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          doDelete(confirm === 'deleteAll' ? rows.map(asRef) : picked())
        }
      />
    </div>
  );
}
