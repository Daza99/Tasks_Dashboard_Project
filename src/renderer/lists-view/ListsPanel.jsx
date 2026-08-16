import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO, startOfYear, startOfMonth, subDays } from 'date-fns';
import { useDatabase } from '../context/DatabaseContext';
import ConfirmDialog from '../components/ConfirmDialog';
import LockButton from '../components/LockButton';
import ListEditor from './ListEditor';
import { dayStamp } from '../containers/ContainerActions';

function createdLabel(iso) {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return String(iso).slice(0, 10);
  }
}

/**
 * Focus Lists view — folder list + open list items.
 */
export default function ListsPanel() {
  const { settings } = useDatabase();
  const templates = useMemo(() => {
    try {
      const raw = settings?.list_naming_templates;
      const arr = raw ? JSON.parse(raw) : null;
      return Array.isArray(arr) && arr.length ? arr : ['Current Date', 'Project', 'Other'];
    } catch {
      return ['Current Date', 'Project', 'Other'];
    }
  }, [settings]);

  const [type, setType] = useState('todo');
  const [range, setRange] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lists, setLists] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editor, setEditor] = useState(null); // 'create' | { rename: list } | null
  const [menu, setMenu] = useState(null); // { x, y, list }
  const [mergeTarget, setMergeTarget] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState('');
  const [addId, setAddId] = useState('');
  const [candidates, setCandidates] = useState([]);

  const dateFilter = useMemo(() => {
    const today = new Date();
    if (range === 'week') {
      return { dateFrom: format(subDays(today, 6), 'yyyy-MM-dd'), dateTo: format(today, 'yyyy-MM-dd') };
    }
    if (range === 'month') {
      return { dateFrom: format(startOfMonth(today), 'yyyy-MM-dd'), dateTo: format(today, 'yyyy-MM-dd') };
    }
    if (range === 'year') {
      return { dateFrom: format(startOfYear(today), 'yyyy-MM-dd'), dateTo: format(today, 'yyyy-MM-dd') };
    }
    if (range === 'custom') {
      return { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };
    }
    return {};
  }, [range, dateFrom, dateTo]);

  async function loadLists() {
    const rows = await window.api.listLists({ type, ...dateFilter });
    setLists(rows);
    if (selectedId && !rows.some((l) => l.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
    }
  }

  async function openList(id) {
    setSelectedId(id);
    const data = await window.api.listListItems(id);
    setDetail(data);
    const itemType = data.list.type === 'todo' ? 'task' : 'reminder';
    const pool =
      itemType === 'task' ? await window.api.listTasks() : await window.api.listReminders();
    const memberIds = new Set(data.items.map((i) => i.id));
    setCandidates(pool.filter((i) => !memberIds.has(i.id)));
    setAddId('');
  }

  useEffect(() => {
    loadLists();
  }, [type, dateFilter]);

  useEffect(() => {
    function close() {
      setMenu(null);
    }
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  async function create(name) {
    const list = await window.api.createList({ name, type });
    setEditor(null);
    await loadLists();
    await openList(list.id);
  }

  async function rename(name) {
    await window.api.renameList(editor.rename.id, name);
    setEditor(null);
    await loadLists();
    if (selectedId === editor.rename.id) await openList(selectedId);
  }

  async function removeList() {
    await window.api.deleteList(confirm.id);
    setConfirm(null);
    if (selectedId === confirm.id) {
      setSelectedId(null);
      setDetail(null);
    }
    await loadLists();
  }

  async function doMerge() {
    const target = Number(mergeTarget);
    if (!target) return;
    await window.api.mergeLists(menu.list.id, target);
    setMenu(null);
    setMergeTarget('');
    await loadLists();
    await openList(target);
  }

  async function doExport() {
    const res = await window.api.exportList(menu.list.id);
    setNotice(res.message || 'Export is Phase 5.');
    setMenu(null);
  }

  async function addExisting() {
    if (!addId || !detail) return;
    const itemType = detail.list.type === 'todo' ? 'task' : 'reminder';
    await window.api.addListItem(detail.list.id, itemType, Number(addId));
    await openList(detail.list.id);
    await loadLists();
  }

  async function dropItem(membershipId) {
    await window.api.removeListItem(membershipId);
    if (detail) await openList(detail.list.id);
    await loadLists();
  }

  return (
    <div className="module-view lists-view">
      <h1>Lists</h1>
      <p className="module-view__hint">
        Filing cabinet for tasks and reminders. Filter by created date (date method:
        yyyy-mm-dd). Export is Phase 5.
      </p>
      {notice && <p className="stub-empty">{notice}</p>}

      <div className="kind-toggle" role="tablist">
        <button
          type="button"
          className={type === 'todo' ? 'active' : ''}
          onClick={() => {
            setType('todo');
            setSelectedId(null);
            setDetail(null);
          }}
        >
          To-Do lists
        </button>
        <button
          type="button"
          className={type === 'reminder' ? 'active' : ''}
          onClick={() => {
            setType('reminder');
            setSelectedId(null);
            setDetail(null);
          }}
        >
          Reminder lists
        </button>
      </div>

      <div className="module-filter-bar glass-inset">
        <label className="bills-history-filters__field">
          Range
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="all">All</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {range === 'custom' && (
          <>
            <label className="bills-history-filters__field">
              From
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="bills-history-filters__field">
              To
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </>
        )}
        <button type="button" className="btn-primary" onClick={() => setEditor('create')}>
          New list
        </button>
      </div>

      {editor === 'create' && (
        <ListEditor
          mode="create"
          type={type}
          templates={templates}
          onSave={create}
          onCancel={() => setEditor(null)}
        />
      )}
      {editor?.rename && (
        <ListEditor
          mode="rename"
          type={editor.rename.type}
          initialName={editor.rename.name}
          templates={templates}
          onSave={rename}
          onCancel={() => setEditor(null)}
        />
      )}

      <div className="lists-split">
        <ul className="module-list lists-folder">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={`lists-folder__row glass-inset${selectedId === l.id ? ' lists-folder__row--on' : ''}`}
                onClick={() => openList(l.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, list: l });
                  setMergeTarget('');
                }}
              >
                <span>
                  <strong>☰ {l.name}</strong>
                  <div className="module-list__meta">
                    {createdLabel(l.created_date)} · {l.item_count} item
                    {l.item_count === 1 ? '' : 's'}
                  </div>
                </span>
              </button>
            </li>
          ))}
          {!lists.length && <p className="stub-empty">No lists in this filter.</p>}
        </ul>

        <div className="lists-detail">
          {!detail && <p className="stub-empty">Select a list, or create one.</p>}
          {detail && (
            <>
              <h2>{detail.list.name}</h2>
              <p className="module-list__meta">
                Created {createdLabel(detail.list.created_date)}
              </p>
              <div className="lists-add">
                <select value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">Add existing…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={!addId} onClick={addExisting}>
                  Add
                </button>
              </div>
              <ul className="module-list">
                {detail.items.map((it) => (
                  <li key={it.membership_id} className="module-list__item glass-inset">
                    <div>
                      <strong>{it.title}</strong>
                      {it.locked ? ' 🔒' : ''}
                      <div className="module-list__meta">
                        added {dayStamp(it.added_date)}
                      </div>
                    </div>
                    <div className="item-row__actions">
                      <LockButton
                        itemType={it.item_type}
                        id={it.id}
                        locked={it.locked}
                        onChanged={() => openList(detail.list.id)}
                      />
                      <button type="button" onClick={() => dropItem(it.membership_id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
                {!detail.items.length && <p className="stub-empty">Empty list.</p>}
              </ul>
            </>
          )}
        </div>
      </div>

      {menu && (
        <div
          className="lists-menu glass-panel"
          style={{ top: menu.y, left: menu.x }}
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              setEditor({ rename: menu.list });
              setMenu(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirm({ id: menu.list.id, name: menu.list.name });
              setMenu(null);
            }}
          >
            Delete
          </button>
          <div className="lists-menu__merge">
            <select
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">Merge into…</option>
              {lists
                .filter((l) => l.id !== menu.list.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
            <button type="button" disabled={!mergeTarget} onClick={doMerge}>
              Merge
            </button>
          </div>
          <button type="button" onClick={doExport}>
            Export .md (Phase 5)
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete list?"
        message={`Delete “${confirm?.name}”? Items stay in Tasks/Reminders; only the folder is removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={removeList}
      />
    </div>
  );
}
