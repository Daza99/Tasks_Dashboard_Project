import React, { useEffect, useState } from 'react';
import { useBrief } from '../context/BriefContext';
import { useDatabase } from '../context/DatabaseContext';
import ConfirmDialog from '../components/ConfirmDialog';
import LockButton from '../components/LockButton';
import { formatTagsDisplay, userTagsOnly } from '../../utils/tag-helpers.js';
import ContainerActions, { asRef, dayStamp, itemKey } from './ContainerActions';
import { useDateFormat } from '../hooks/useDateFormat';

/**
 * Archive (trash can) — restore or permanent delete. Retention default 3 years.
 */
export default function Archive() {
  const { refresh } = useBrief();
  const { settings } = useDatabase();
  const { dateFormat, methodHint } = useDateFormat();
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null);

  const years = settings?.archive_retention_years || '3';
  const autoDel = settings?.auto_delete_archive === 'true';

  async function load() {
    const [list, c] = await Promise.all([
      window.api.listArchive(),
      window.api.containerCounts(),
    ]);
    setRows(list);
    setCounts(c);
    setSelected(new Set());
  }

  useEffect(() => {
    load();
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
    await window.api.bulkRestore({ items: picked(), from: 'archive' });
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

  const size = counts?.size;

  return (
    <div className="module-view">
      <h1>Archive</h1>
      <p className="module-view__hint">
        Trash can. Restore or permanent delete. Retention {years} year(s).
        Auto-delete is {autoDel ? 'ON' : 'OFF'} (default off). Dates: (date method:
        {methodHint}).
      </p>
      {size?.overLimit && (
        <p className="archive-size-warn">
          Database is {size.mb} MB (threshold {size.limitMb} MB). Clean up archive
          items.
        </p>
      )}
      {notice && <p className="stub-empty">{notice}</p>}

      <ContainerActions
        allCount={rows.length}
        selectedCount={selected.size}
        onSelectAll={() => setSelected(new Set(rows.map(itemKey)))}
        onClear={() => setSelected(new Set())}
        onRestore={restore}
        onDelete={() => setConfirm('delete')}
        deleteLabel="Delete forever"
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
                  <button
                    type="button"
                    onClick={async () => {
                      await window.api.restoreItem(r.item_type, r.id, 'archive');
                      await load();
                      await refresh();
                    }}
                  >
                    Restore
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
                archived {dayStamp(r.archived_date, dateFormat)}
                {r.completed_at ? ` · completed ${dayStamp(r.completed_at, dateFormat)}` : ''}
                {userTagsOnly(r.tags).length
                  ? ` · ${formatTagsDisplay(userTagsOnly(r.tags))}`
                  : ''}
              </div>
            </li>
          );
        })}
        {!rows.length && <p className="stub-empty">Archive is empty.</p>}
      </ul>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete forever?"
        message="Removes the record from SQLite. Locked items are skipped."
        confirmLabel="Delete forever"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => doDelete(picked())}
      />
    </div>
  );
}
