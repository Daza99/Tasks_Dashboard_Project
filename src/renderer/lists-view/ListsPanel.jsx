import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO, startOfYear, startOfMonth, subDays } from 'date-fns';
import { useDatabase } from '../context/DatabaseContext';
import ConfirmDialog from '../components/ConfirmDialog';
import ListSelectToolbar from '../components/ListSelectToolbar';
import ListEditor from './ListEditor';
import ListHashtagEditor from './ListHashtagEditor';
import ListHashtagInput from './ListHashtagInput';
import TodoChecklist from './TodoChecklist';
import BulletPad from './BulletPad';
import { useDateFormat } from '../hooks/useDateFormat';
import { formatTagDisplay, normalizeTagName } from '../../utils/tag-helpers.js';
import { invalidateListHashtagWhitelist } from '../hooks/useListHashtagWhitelist';
import { useVisibleSelection } from '../hooks/useVisibleSelection';

const TABS = [
  { id: 'todo', label: 'To-Do lists' },
  { id: 'bullet', label: 'Bullet lists' },
];

function createdLabel(iso) {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return String(iso).slice(0, 10);
  }
}

/**
 * Focus Lists view — folder rail + type-specific editor.
 */
export default function ListsPanel() {
  const { settings } = useDatabase();
  const { methodHint } = useDateFormat();
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
  const [hashtag, setHashtag] = useState('#list');
  const [lists, setLists] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editor, setEditor] = useState(null); // 'create' | { rename: list } | null
  const [menu, setMenu] = useState(null); // { x, y, list }
  const [mergeTarget, setMergeTarget] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const tagDebounce = useRef(null);

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

  const bareTag = useMemo(() => normalizeTagName(hashtag), [hashtag]);

  async function loadLists() {
    const rows = await window.api.listLists({ type, tag: bareTag, ...dateFilter });
    setLists(rows);
    if (selectedId && !rows.some((l) => l.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
    }
  }

  async function openList(id) {
    setSelectedId(id);
    setDetail(await window.api.listListItems(id));
  }

  useEffect(() => {
    clearTimeout(tagDebounce.current);
    tagDebounce.current = setTimeout(() => {
      loadLists();
    }, 150);
    return () => clearTimeout(tagDebounce.current);
  }, [type, dateFilter, bareTag]);

  useEffect(() => {
    function close() {
      setMenu(null);
    }
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  async function create(name) {
    const list = await window.api.createList({ name, type, tag: bareTag || 'list' });
    invalidateListHashtagWhitelist();
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

  const visibleIds = useMemo(() => lists.map((l) => l.id), [lists]);
  const {
    selected,
    selectAllRef,
    selectedVisibleCount,
    allVisibleSelected,
    selectableCount,
    toggle,
    onSelectAllChange,
    clear: clearSelected,
    selectedList,
  } = useVisibleSelection(visibleIds);

  async function removeSelected() {
    const ids = selectedList();
    if (!ids.length) {
      setBulkDeleteOpen(false);
      return;
    }
    await window.api.deleteLists(ids);
    if (selectedId != null && ids.includes(selectedId)) {
      setSelectedId(null);
      setDetail(null);
    }
    clearSelected();
    setBulkDeleteOpen(false);
    invalidateListHashtagWhitelist();
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

  function onTodoChanged(data) {
    setDetail(data);
    loadLists();
  }

  function onDocSaved(list) {
    setDetail((prev) => (prev ? { ...prev, list } : { list, items: [] }));
    loadLists();
  }

  async function saveListTags(listId, names) {
    const list = await window.api.setListTags(listId, names);
    invalidateListHashtagWhitelist();
    setDetail((prev) =>
      prev && prev.list.id === listId ? { ...prev, list } : prev
    );
    await loadLists();
  }

  return (
    <div className="module-view lists-view">
      <h1>Lists</h1>
      <p className="module-view__hint">
        Checklists and bullet notes. Filter by created date (date
        method: {methodHint}).
      </p>
      {notice && <p className="stub-empty">{notice}</p>}

      <div className="kind-toggle" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={type === t.id ? 'active' : ''}
            onClick={() => {
              setType(t.id);
              setSelectedId(null);
              setDetail(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="module-filter-bar glass-inset">
        <label className="module-filter-bar__field">
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
            <label className="module-filter-bar__field">
              From
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="module-filter-bar__field">
              To
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </>
        )}
        <label className="module-filter-bar__field module-filter-bar__field--hashtag">
          Hashtag
          <ListHashtagInput value={hashtag} onChange={setHashtag} />
        </label>
        <button type="button" className="btn-primary" onClick={() => setEditor('create')}>
          New list
        </button>
      </div>

      <ListSelectToolbar
        selectAllRef={selectAllRef}
        allVisibleSelected={allVisibleSelected}
        selectableCount={selectableCount}
        selectedCount={selectedVisibleCount}
        onSelectAllChange={onSelectAllChange}
        onDelete={() => setBulkDeleteOpen(true)}
        selectAllAriaLabel="Select all visible lists"
      />

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
            <li key={l.id} className="lists-folder__pick">
              <label className="bill-check tracker-list__check">
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                  aria-label={`Select ${l.name}`}
                />
              </label>
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
                    {l.tags?.length
                      ? ` · ${l.tags.map((t) => formatTagDisplay(t)).join(' ')}`
                      : ''}
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
              <div className="lists-detail__head">
                <div className="lists-detail__title">
                  <h2>{detail.list.name}</h2>
                  <div className="module-list__meta">
                    Created {createdLabel(detail.list.created_date)}
                  </div>
                </div>
                <ListHashtagEditor
                  key={detail.list.id}
                  listId={detail.list.id}
                  tags={detail.list.tags}
                  onCommit={saveListTags}
                />
              </div>
              {detail.list.type === 'todo' && (
                <TodoChecklist
                  listId={detail.list.id}
                  items={detail.items}
                  onChanged={onTodoChanged}
                />
              )}
              {detail.list.type === 'bullet' && (
                <BulletPad list={detail.list} onSaved={onDocSaved} />
              )}
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
            <button type="button" className="btn-primary" disabled={!mergeTarget} onClick={doMerge}>
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
        message={`Delete “${confirm?.name}” and its contents? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={removeList}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`Delete ${selectedVisibleCount} list${selectedVisibleCount === 1 ? '' : 's'}?`}
        message="Removes the selected lists and their contents. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={removeSelected}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}
