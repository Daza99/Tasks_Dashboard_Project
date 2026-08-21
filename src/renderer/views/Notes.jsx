import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import ConfirmDialog from '../components/ConfirmDialog';
import PromptDialog from '../components/PromptDialog';
import TagInput from '../components/TagInput';
import NotePad from '../notes-view/NotePad';
import { invalidateTagCatalog } from '../hooks/useTagCatalog';
import {
  formatTagsDisplay,
  normalizeUserTagNames,
  userTagsDisplay,
} from '../../utils/tag-helpers.js';

const CAT_NEW = '__new__';
const CAT_NONE = '';

function createdLabel(iso) {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return String(iso).slice(0, 10);
  }
}

/**
 * Focus Notes — folder rail + combined MD/bullet pad.
 * @param {{ editId?: number|null, onEditConsumed?: () => void }} props
 */
export default function NotesView({ editId = null, onEditConsumed }) {
  const [notes, setNotes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filterCat, setFilterCat] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [category, setCategory] = useState(CAT_NONE);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptFor, setPromptFor] = useState('create'); // create | header
  const [poppedIds, setPoppedIds] = useState([]);
  const [headerTags, setHeaderTags] = useState('');
  const [returningId, setReturningId] = useState(null);
  const catBeforeNew = useRef(CAT_NONE);
  const headerCatBeforeNew = useRef(CAT_NONE);
  const selectedIdRef = useRef(selectedId);
  const prevPoppedRef = useRef(new Set());
  const pendingClosedRef = useRef([]);
  selectedIdRef.current = selectedId;

  const popped = useMemo(() => new Set(poppedIds.map(Number)), [poppedIds]);
  const selectedPopped =
    selectedId != null &&
    (popped.has(Number(selectedId)) || returningId === Number(selectedId));

  async function loadCategories() {
    setCategories(await window.api.listNoteCategories());
  }

  async function loadNotes() {
    const rows = await window.api.listNotes({
      category: filterCat === 'all' ? undefined : filterCat,
    });
    setNotes(rows);
    if (selectedId && !rows.some((n) => n.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
    }
  }

  async function openNote(id) {
    setSelectedId(id);
    const row = await window.api.getNote(id);
    setDetail(row);
    setHeaderTags(userTagsDisplay(row?.tags));
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadNotes();
  }, [filterCat]);

  /** Diff popout ids; hold the in-app pad until getNote if the selected note returned. */
  function applyPopoutIds(raw) {
    const nextArr = Array.isArray(raw) ? raw.map(Number) : [];
    const next = new Set(nextArr);
    const prev = prevPoppedRef.current;
    const closed = [...prev].filter((id) => !next.has(id));
    prevPoppedRef.current = next;
    pendingClosedRef.current = closed;
    const selected = Number(selectedIdRef.current);
    if (Number.isFinite(selected) && closed.includes(selected)) {
      setReturningId(selected);
    }
    setPoppedIds(nextArr);
  }

  useEffect(() => {
    window.api.listNotePopouts?.().then((ids) => applyPopoutIds(ids));
    if (!window.api?.onNotePopouts) return undefined;
    return window.api.onNotePopouts((ids) => applyPopoutIds(ids));
  }, []);

  useEffect(() => {
    const closed = pendingClosedRef.current;
    pendingClosedRef.current = [];
    if (!closed.length) return undefined;
    let cancelled = false;
    const idToReload = returningId;
    (async () => {
      if (idToReload != null) {
        try {
          const row = await window.api.getNote(idToReload);
          if (!cancelled && row) {
            setDetail(row);
            setHeaderTags(userTagsDisplay(row.tags));
          }
        } finally {
          if (!cancelled) setReturningId(null);
        }
      }
      if (!cancelled) await loadNotes();
    })();
    return () => {
      cancelled = true;
    };
  }, [poppedIds]);

  useEffect(() => {
    if (editId == null) return;
    setFilterCat('all');
    openNote(editId);
    onEditConsumed?.();
  }, [editId]);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const note = await window.api.createNote({
        title,
        tags: normalizeUserTagNames(tagsInput),
        category: category || null,
      });
      invalidateTagCatalog();
      setCreating(false);
      setTitle('');
      setTagsInput('');
      setCategory(CAT_NONE);
      await loadCategories();
      await loadNotes();
      await openNote(note.id);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function onCreateCatChange(e) {
    const v = e.target.value;
    if (v === CAT_NEW) {
      catBeforeNew.current = category;
      setPromptFor('create');
      setPromptOpen(true);
      return;
    }
    setCategory(v);
  }

  function onHeaderCatChange(e) {
    const v = e.target.value;
    if (v === CAT_NEW) {
      headerCatBeforeNew.current = detail?.category || CAT_NONE;
      setPromptFor('header');
      setPromptOpen(true);
      return;
    }
    void saveHeader({ category: v || null });
  }

  async function onNewCategory(name) {
    setPromptOpen(false);
    const created = await window.api.createNoteCategory(name);
    await loadCategories();
    if (promptFor === 'create') setCategory(created);
    else void saveHeader({ category: created });
  }

  function cancelPrompt() {
    setPromptOpen(false);
    if (promptFor === 'create') setCategory(catBeforeNew.current);
  }

  async function saveHeader(fields) {
    if (!detail) return;
    const saved = await window.api.updateNote(detail.id, {
      title: fields.title !== undefined ? fields.title : detail.title,
      category: fields.category !== undefined ? fields.category : detail.category,
      tags: fields.tags !== undefined ? fields.tags : normalizeUserTagNames(headerTags),
    });
    invalidateTagCatalog();
    setDetail(saved);
    setHeaderTags(userTagsDisplay(saved.tags));
    await loadNotes();
    await loadCategories();
  }

  async function removeNote() {
    await window.api.deleteNote(confirmDel.id);
    setConfirmDel(null);
    if (selectedId === confirmDel.id) {
      setSelectedId(null);
      setDetail(null);
    }
    await loadNotes();
  }

  function onDocSaved(note) {
    setDetail(note);
    loadNotes();
  }

  const categorySelect = (value, onChange) => (
    <select value={value} onChange={onChange}>
      <option value={CAT_NEW}>NEW</option>
      <option value={CAT_NONE}>Uncategorized</option>
      {categories.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="module-view lists-view">
      <h1>Notes</h1>
      <p className="module-view__hint">
        Combined markdown and bullet notepad. Filter by category. Search from the
        top bar.
      </p>
      {error ? <p className="stub-empty">{error}</p> : null}

      <div className="module-filter-bar glass-inset">
        <label className="module-filter-bar__field">
          Category
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="all">All</option>
            <option value="uncategorized">Uncategorized</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setCreating(true);
            setError('');
          }}
        >
          New note
        </button>
      </div>

      {creating && (
        <form className="create-form glass-inset" onSubmit={create}>
          <label>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Tags
            <TagInput value={tagsInput} onChange={setTagsInput} />
          </label>
          <label>
            Category
            {categorySelect(category, onCreateCatChange)}
          </label>
          <div className="item-row__actions">
            <button type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create
            </button>
          </div>
        </form>
      )}

      <div className="lists-split">
        <ul className="module-list lists-folder">
          {notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`lists-folder__row glass-inset${selectedId === n.id ? ' lists-folder__row--on' : ''}`}
                onClick={() => openNote(n.id)}
              >
                <span>
                  <strong>{n.title}</strong>
                  <div className="module-list__meta">
                    {createdLabel(n.created_at)}
                    {n.category ? ` · ${n.category}` : ' · Uncategorized'}
                    {n.tags?.length ? ` · ${formatTagsDisplay(n.tags)}` : ''}
                    {popped.has(n.id) ? ' · window' : ''}
                  </div>
                </span>
              </button>
            </li>
          ))}
          {!notes.length && <p className="stub-empty">No notes in this filter.</p>}
        </ul>

        <div className="lists-detail">
          {!detail && <p className="stub-empty">Select a note, or create one.</p>}
          {detail && (
            <>
              <div className="note-header">
                <input
                  type="text"
                  className="note-header__title"
                  value={detail.title}
                  onChange={(e) => setDetail({ ...detail, title: e.target.value })}
                  onBlur={(e) => saveHeader({ title: e.target.value })}
                />
                <div className="item-row__actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setConfirmDel({ id: detail.id, title: detail.title })}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="note-header__meta">
                <label>
                  Tags
                  <TagInput
                    value={headerTags}
                    onChange={setHeaderTags}
                    onBlur={() => saveHeader({ tags: normalizeUserTagNames(headerTags) })}
                  />
                </label>
                <label>
                  Category
                  {categorySelect(detail.category || CAT_NONE, onHeaderCatChange)}
                </label>
              </div>
              <p className="module-list__meta">
                Created {createdLabel(detail.created_at)}
              </p>
              {selectedPopped ? (
                <p className="stub-empty">
                  Editing in a window.{' '}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => window.api.focusNotePopout(detail.id)}
                  >
                    Focus window
                  </button>
                </p>
              ) : (
                <NotePad
                  key={detail.id}
                  note={detail}
                  onSaved={onDocSaved}
                />
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDel)}
        title="Delete note?"
        message={`Delete “${confirmDel?.title}”? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={removeNote}
      />
      <PromptDialog
        open={promptOpen}
        title="New category"
        message="Name for this category."
        confirmLabel="Add"
        placeholder="e.g. Work"
        onConfirm={onNewCategory}
        onCancel={cancelPrompt}
      />
    </div>
  );
}
