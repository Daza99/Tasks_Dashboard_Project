import React, { useEffect, useState } from 'react';
import { useBrief } from '../context/BriefContext';
import ConfirmDialog from '../components/ConfirmDialog';
import LockButton from '../components/LockButton';
import { formatTagsDisplay, userTagsOnly } from '../../utils/tag-helpers.js';
import ContainerActions, { asRef, dayStamp, itemKey } from './ContainerActions';
import { useDateFormat } from '../hooks/useDateFormat';

/**
 * Completed container — un-complete, archive, or delete. Filter by date/type/tag.
 */
export default function Completed() {
  const { refresh } = useBrief();
  const { dateFormat, methodHint } = useDateFormat();
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [type, setType] = useState('all');
  const [tag, setTag] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  async function load() {
    const list = await window.api.listCompleted({
      type,
      tag,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    setRows(list);
    setSelected(new Set());
  }

  useEffect(() => {
    load();
  }, [type, tag, dateFrom, dateTo]);

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
    await window.api.bulkRestore({ items: picked(), from: 'completed' });
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
      <h1>Completed</h1>
      <p className="module-view__hint">
        Completed tasks and reminders. Restore un-completes. Filter dates
        (date method: {methodHint}).
      </p>
      {notice && <p className="stub-empty">{notice}</p>}

      <div className="module-filter-bar glass-inset">
        <label className="bills-history-filters__field">
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All</option>
            <option value="task">Tasks</option>
            <option value="reminder">Reminders</option>
          </select>
        </label>
        <label className="bills-history-filters__field">
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="bills-history-filters__field">
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label className="bills-history-filters__field bills-history-filters__field--grow">
          Tag
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="#tag"
          />
        </label>
      </div>

      <ContainerActions
        allCount={rows.length}
        selectedCount={selected.size}
        onSelectAll={() => setSelected(new Set(rows.map(itemKey)))}
        onClear={() => setSelected(new Set())}
        onRestore={restore}
        onArchive={archive}
        onDelete={() => setConfirm('delete')}
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
                      await window.api.restoreItem(r.item_type, r.id, 'completed');
                      await load();
                      await refresh();
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await window.api.archiveItem(r.item_type, r.id);
                      if (res.skippedLocked) setNotice('Locked — skipped.');
                      await load();
                      await refresh();
                    }}
                  >
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
                completed {dayStamp(r.completed_at, dateFormat)}
                {userTagsOnly(r.tags).length
                  ? ` · ${formatTagsDisplay(userTagsOnly(r.tags))}`
                  : ''}
              </div>
            </li>
          );
        })}
        {!rows.length && <p className="stub-empty">No completed items.</p>}
      </ul>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete selected?"
        message="Permanent delete. Locked items are skipped."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => doDelete(picked())}
      />
    </div>
  );
}
