import React, { useEffect, useMemo, useState } from 'react';
import { useBrief } from '../context/BriefContext';
import TagInput from '../components/TagInput';
import TagSearchInput from '../components/TagSearchInput';
import ConfirmDialog from '../components/ConfirmDialog';
import ListSelectToolbar from '../components/ListSelectToolbar';
import { invalidateTagCatalog } from '../hooks/useTagCatalog';
import {
  formatTagsDisplay,
  normalizeUserTagNames,
  userTagsDisplay,
} from '../../utils/tag-helpers.js';
import DetailsInline from '../components/DetailsInline';
import DetailsPreview from '../components/DetailsPreview';
import PrioritySelect from '../components/PrioritySelect';
import { DEFAULT_PRIORITY } from '../../utils/priority.js';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';
import { useSelectedCard } from '../hooks/useSelectedCard';
import { useVisibleSelection } from '../hooks/useVisibleSelection';
import { rowDblClick } from '../../utils/row-dblclick.js';
import { matchesEntitySearch } from '../../utils/entity-search.js';

const FREQS = ['daily', 'weekly', 'monthly'];
const FILTER_OPTS = ['all', 'daily', 'weekly', 'monthly'];

/** Parse tags for create/update — drop system names from user field. */
function parseTagsInput(raw) {
  return normalizeUserTagNames(raw);
}

/**
 * Focus view: habits CRUD + check-in + streak + nudge + tags + archive mode.
 * @param {{ editId?: number|null, onEditConsumed?: () => void }} props
 */
export default function HabitsView({ editId = null, onEditConsumed }) {
  const { refresh } = useBrief();
  const [mode, setMode] = useState('edit'); // edit | archive
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [nudge, setNudge] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [priority, setPriority] = useState(DEFAULT_PRIORITY);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const editRowRef = useScrollEditIntoView(editingId);
  const { selectedId, setSelectedId, listRef } = useSelectedCard();
  const [editName, setEditName] = useState('');
  const [editFreq, setEditFreq] = useState('daily');
  const [editNudge, setEditNudge] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editPriority, setEditPriority] = useState(DEFAULT_PRIORITY);
  const [editDetails, setEditDetails] = useState('');
  const [freqFilter, setFreqFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const isArchive = mode === 'archive';

  async function load() {
    setRows(await window.api.listHabits({ archived: isArchive }));
  }

  useEffect(() => {
    load();
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when archive mode flips
  }, [mode]);

  useEffect(() => {
    if (editId == null) return;
    setMode('edit');
    setFreqFilter('all');
    setSearch('');
    const h = rows.find((x) => x.id === editId);
    if (!h) return;
    beginEdit(h);
    onEditConsumed?.();
  }, [editId, rows]);

  /** Frequency dropdown + name/details/#tag search (AND). */
  const filtered = useMemo(() => {
    return rows.filter((h) => {
      if (freqFilter !== 'all' && h.frequency !== freqFilter) return false;
      return matchesEntitySearch(h, search, { textKeys: ['name', 'description'] });
    });
  }, [rows, freqFilter, search]);

  const visibleIds = useMemo(() => filtered.map((h) => h.id), [filtered]);
  const {
    selected,
    selectAllRef,
    selectedVisibleCount,
    allVisibleSelected,
    selectableCount,
    toggle: toggleSelected,
    onSelectAllChange,
    clear: clearSelected,
    selectedList,
  } = useVisibleSelection(visibleIds);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createHabit({
        name,
        frequency,
        nudge_time: nudge || null,
        tags: parseTagsInput(tagsInput),
        priority,
        description: details.trim() || null,
      });
      setName('');
      setNudge('');
      setTagsInput('');
      setPriority(DEFAULT_PRIORITY);
      setDetails('');
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function beginEdit(h) {
    setEditingId(h.id);
    setSelectedId(h.id);
    setEditName(h.name);
    setEditFreq(h.frequency);
    setEditNudge(h.nudge_time || '');
    setEditTags(userTagsDisplay(h.tags));
    setEditPriority(h.priority ?? DEFAULT_PRIORITY);
    setEditDetails(h.description || '');
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await window.api.updateHabit(editingId, {
        name: editName,
        frequency: editFreq,
        nudge_time: editNudge || null,
        tags: parseTagsInput(editTags),
        priority: editPriority,
        description: editDetails.trim() || null,
      });
      setEditingId(null);
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function toggle(id) {
    await window.api.toggleCheckin(id);
    await load();
    await refresh();
  }

  async function remove(id) {
    await window.api.deleteHabit(id);
    await load();
    await refresh();
  }

  async function removeSelected() {
    const ids = selectedList();
    if (!ids.length) {
      setBulkDeleteOpen(false);
      return;
    }
    await window.api.deleteHabits(ids);
    clearSelected();
    setBulkDeleteOpen(false);
    await load();
    await refresh();
  }

  async function archive(id) {
    await window.api.archiveHabit(id);
    await load();
    await refresh();
  }

  async function activate(id) {
    await window.api.activateHabit(id);
    await load();
    await refresh();
  }

  const filterBar = (
    <div className="module-filter-bar glass-inset">
      <label className="module-filter-bar__field">
        Filter
        <select
          value={freqFilter}
          onChange={(e) => setFreqFilter(e.target.value)}
          aria-label="Frequency filter"
        >
          {FILTER_OPTS.map((f) => (
            <option key={f} value={f}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="module-filter-bar__field module-filter-bar__field--grow">
        Search
        <TagSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Name, details, or #tag"
          aria-label="Search habits by name, details, or #tag"
        />
      </label>
    </div>
  );

  return (
    <div className="module-view">
      <h1>{isArchive ? 'Habits (Archive)' : 'Habits'}</h1>
      <p className="module-view__hint">
        {isArchive
          ? 'Shelved habits. Activate restores them to the active list.'
          : 'Daily / weekly / monthly check-in. Optional nudge fires a #nudge popup.'}
      </p>

      {isArchive ? (
        <div className="create-form glass-inset">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setMode('edit')}
          >
            Back to Habits
          </button>
        </div>
      ) : (
        <form className="create-form glass-inset" onSubmit={create}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Habit name"
          />
          <div className="kind-toggle" role="group" aria-label="Frequency">
            {FREQS.map((f) => (
              <button
                key={f}
                type="button"
                className={frequency === f ? 'active' : ''}
                onClick={() => setFrequency(f)}
              >
                {f}
              </button>
            ))}
            <button type="button" onClick={() => setMode('archive')}>
              ARCHIVE
            </button>
          </div>
          <label className="edit-label">
            Nudge time (optional)
            <input
              type="time"
              value={nudge}
              onChange={(e) => setNudge(e.target.value)}
            />
          </label>
          <label className="edit-label">
            Tags (optional)
            <TagInput
              value={tagsInput}
              onChange={setTagsInput}
              placeholder="#fitness, #health"
              aria-label="Habit tags"
            />
          </label>
          <div className="reminder-meta-row">
            <div className="reminder-meta-row__left">
              <PrioritySelect id="habit-priority" value={priority} onChange={setPriority} />
            </div>
            <DetailsInline
              value={details}
              onChange={setDetails}
              placeholder="Details (optional)"
              ariaLabel="Details"
            />
          </div>
          <button type="submit" className="btn-primary">
            Create
          </button>
          {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        </form>
      )}

      {filterBar}

      <ListSelectToolbar
        selectAllRef={selectAllRef}
        allVisibleSelected={allVisibleSelected}
        selectableCount={selectableCount}
        selectedCount={selectedVisibleCount}
        onSelectAllChange={onSelectAllChange}
        onDelete={() => setBulkDeleteOpen(true)}
        selectAllAriaLabel="Select all visible habits"
      />

      <ul className="module-list" ref={listRef}>
        {filtered.map((h) => (
          <li
            key={h.id}
            ref={editingId === h.id ? editRowRef : null}
            onClick={() => setSelectedId(h.id)}
            className={`module-list__item glass-inset module-list__item--col${
              editingId === h.id ? ' module-list__item--editing' : ''
            }${selectedId === h.id || editingId === h.id ? ' module-list__item--selected' : ''}`}
          >
            {editingId === h.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <div className="kind-toggle">
                  {FREQS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={editFreq === f ? 'active' : ''}
                      onClick={() => setEditFreq(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <label className="edit-label">
                  Nudge
                  <input
                    type="time"
                    value={editNudge}
                    onChange={(e) => setEditNudge(e.target.value)}
                  />
                </label>
                <label className="edit-label">
                  Tags
                  <TagInput
                    value={editTags}
                    onChange={setEditTags}
                    placeholder="#fitness"
                    aria-label="Edit habit tags"
                  />
                </label>
                <div className="reminder-meta-row">
                  <div className="reminder-meta-row__left">
                    <PrioritySelect
                      id={`edit-habit-priority-${h.id}`}
                      value={editPriority}
                      onChange={setEditPriority}
                    />
                  </div>
                  <DetailsInline
                    value={editDetails}
                    onChange={setEditDetails}
                    placeholder="Details (optional)"
                    ariaLabel="Details"
                  />
                </div>
                <div className="item-row__actions">
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div
                  className="module-list__row"
                  onDoubleClick={rowDblClick(() => beginEdit(h))}
                >
                  <div className="tracker-list__main">
                    <label className="bill-check tracker-list__check">
                      <input
                        type="checkbox"
                        checked={selected.has(h.id)}
                        onChange={() => toggleSelected(h.id)}
                        aria-label={`Select ${h.name}`}
                      />
                    </label>
                    <div>
                      <strong>
                        <span className="priority-badge" data-p={h.priority ?? DEFAULT_PRIORITY}>
                          P{h.priority ?? DEFAULT_PRIORITY}
                        </span>{' '}
                        {h.name}
                      </strong>
                      <div className="module-list__meta">
                        {h.frequency}
                        {h.nudge_time ? ` · nudge ${h.nudge_time}` : ''}
                        {` · streak ${h.streak || 0}`}
                        {!isArchive && h.completed_today ? ' · done today' : ''}
                      </div>
                      {h.tags?.length > 0 && (
                        <div className="item-row__tags">{formatTagsDisplay(h.tags)}</div>
                      )}
                      <DetailsPreview text={h.description} />
                    </div>
                  </div>
                  <div className="item-row__actions">
                    {isArchive ? (
                      <>
                        <button type="button" onClick={() => activate(h.id)}>
                          Activate
                        </button>
                        <button type="button" onClick={() => beginEdit(h)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => remove(h.id)}
                        >
                          Del
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => toggle(h.id)}>
                          {h.completed_today ? 'Undo' : 'Check in'}
                        </button>
                        <button type="button" onClick={() => archive(h.id)}>
                          Archive
                        </button>
                        <button type="button" onClick={() => beginEdit(h)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => remove(h.id)}
                        >
                          Del
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </li>
        ))}
        {!filtered.length && (
          <p className="stub-empty">
            {isArchive
              ? 'No archived habits.'
              : !rows.length
                ? 'No habits yet.'
                : 'No habits match these filters.'}
          </p>
        )}
      </ul>

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`Delete ${selectedVisibleCount} habit${selectedVisibleCount === 1 ? '' : 's'}?`}
        message="Removes the selected habits and their logs. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={removeSelected}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}
