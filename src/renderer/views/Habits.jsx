import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import TagInput from '../components/TagInput';
import TagSearchInput from '../components/TagSearchInput';
import ConfirmDialog from '../components/ConfirmDialog';
import PromptDialog from '../components/PromptDialog';
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
import HabitColorField, { HabitColorDot } from '../components/HabitColorField';
import { NudgePreview, NudgeRow, todayKey } from '../components/NudgeRow';
import NudgeCustomDialog from '../components/NudgeCustomDialog';
import HabitCategoryManageDialog from '../components/HabitCategoryManageDialog';
import { DEFAULT_PRIORITY } from '../../utils/priority.js';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';
import { useSelectedCard } from '../hooks/useSelectedCard';
import { useVisibleSelection } from '../hooks/useVisibleSelection';
import { rowDblClick } from '../../utils/row-dblclick.js';
import { matchesEntitySearch } from '../../utils/entity-search.js';

const FREQS = ['daily', '3day', 'weekly', 'fortnightly', 'monthly'];
const FILTER_OPTS = ['all', 'daily', '3day', 'weekly', 'fortnightly', 'monthly'];
const CAT_NEW = '__new__';
const CAT_NONE = '';
const DEFAULT_NUDGE_TIME = '09:00';

/** Stored freq → UI label (3day is two words). */
function freqLabel(f) {
  if (f === 'all') return 'All';
  if (f === '3day') return '3 Day';
  return f.charAt(0).toUpperCase() + f.slice(1);
}

/** Local due check for create/edit nudge preview (mirrors habits.js isDueOn). */
function localDueOn(freq, createdAt, d) {
  if (freq === 'daily') return true;
  if (freq === '3day' || freq === 'fortnightly') {
    const start = createdAt ? new Date(createdAt) : d;
    const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((dMid - startMid) / 86400000);
    const step = freq === 'fortnightly' ? 14 : 3;
    return diff >= 0 && diff % step === 0;
  }
  if (freq === 'weekly') {
    const day = d.getDay();
    return day >= 1 && day <= 5;
  }
  if (freq === 'monthly') {
    const created = createdAt ? new Date(createdAt) : d;
    const dom = created.getDate();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(dom, last);
  }
  return true;
}

/** Next due yyyy-MM-dd on or after today. */
function nextDueKey(freq, createdAt) {
  let c = new Date();
  c = new Date(c.getFullYear(), c.getMonth(), c.getDate());
  const start = createdAt ? new Date(createdAt) : c;
  const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (c < startMid) c = startMid;
  for (let i = 0; i < 400; i += 1) {
    if (localDueOn(freq, createdAt, c)) return format(c, 'yyyy-MM-dd');
    c = addDays(c, 1);
  }
  return format(c, 'yyyy-MM-dd');
}

/** Parse tags for create/update — drop system names from user field. */
function parseTagsInput(raw) {
  return normalizeUserTagNames(raw);
}

/**
 * Focus view: habits CRUD + check-in + streak + nudge + tags + archive mode.
 * @param {{
 *   editId?: number|null,
 *   onEditConsumed?: () => void,
 *   seedDate?: string|null,
 *   onSeedConsumed?: () => void,
 * }} props
 */
export default function HabitsView({
  editId = null,
  onEditConsumed,
  seedDate = null,
  onSeedConsumed,
}) {
  const { refresh } = useBrief();
  const [mode, setMode] = useState('edit'); // edit | archive
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [nudgeOn, setNudgeOn] = useState(false);
  const [nudgeMode, setNudgeMode] = useState('custom');
  const [nudgeTime, setNudgeTime] = useState(DEFAULT_NUDGE_TIME);
  const [tagsInput, setTagsInput] = useState('');
  const [priority, setPriority] = useState(DEFAULT_PRIORITY);
  const [details, setDetails] = useState('');
  const [showOnCalendar, setShowOnCalendar] = useState(false);
  const [color, setColor] = useState(null);
  const [category, setCategory] = useState(CAT_NONE);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const editRowRef = useScrollEditIntoView(editingId);
  const { selectedId, setSelectedId, listRef } = useSelectedCard();
  const [editName, setEditName] = useState('');
  const [editFreq, setEditFreq] = useState('daily');
  const [editNudgeOn, setEditNudgeOn] = useState(false);
  const [editNudgeMode, setEditNudgeMode] = useState('custom');
  const [editNudgeTime, setEditNudgeTime] = useState(DEFAULT_NUDGE_TIME);
  const [editTags, setEditTags] = useState('');
  const [editPriority, setEditPriority] = useState(DEFAULT_PRIORITY);
  const [editDetails, setEditDetails] = useState('');
  const [editOnCalendar, setEditOnCalendar] = useState(false);
  const [editColor, setEditColor] = useState(null);
  const [editCategory, setEditCategory] = useState(CAT_NONE);
  const [customOpen, setCustomOpen] = useState(null); // create | edit | null
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptFor, setPromptFor] = useState('create');
  const [manageOpen, setManageOpen] = useState(false);
  const [manageName, setManageName] = useState('');
  const catBeforeNew = useRef(CAT_NONE);
  const [freqFilter, setFreqFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const isArchive = mode === 'archive';

  async function load() {
    setRows(await window.api.listHabits({ archived: isArchive }));
  }

  async function loadCategories() {
    setCategories(await window.api.listHabitCategories());
  }

  useEffect(() => {
    load();
    loadCategories();
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when archive mode flips
  }, [mode]);

  const createDue = nextDueKey(frequency);
  const editingRow = rows.find((x) => x.id === editingId);
  const editDue = nextDueKey(editFreq, editingRow?.created_at);

  // Due today cannot use Day Before (would be yesterday).
  useEffect(() => {
    if (nudgeOn && nudgeMode === 'day_before' && createDue === todayKey()) {
      setNudgeMode('custom');
    }
  }, [nudgeOn, nudgeMode, createDue]);

  useEffect(() => {
    if (editNudgeOn && editNudgeMode === 'day_before' && editDue === todayKey()) {
      setEditNudgeMode('custom');
    }
  }, [editNudgeOn, editNudgeMode, editDue]);

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

  // Calendar RMB: land on create with Add to Calendar ticked (no due field to seed).
  useEffect(() => {
    if (!seedDate) return;
    setMode('edit');
    setShowOnCalendar(true);
    onSeedConsumed?.();
  }, [seedDate]);

  /** Frequency dropdown + name/details/#tag search (AND). */
  const filtered = useMemo(() => {
    return rows.filter((h) => {
      if (freqFilter !== 'all' && h.frequency !== freqFilter) return false;
      return matchesEntitySearch(h, search, {
        textKeys: ['name', 'description', 'category'],
      });
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
        nudge_time: nudgeOn ? nudgeTime || DEFAULT_NUDGE_TIME : null,
        nudge_mode: nudgeOn
          ? nudgeMode === 'day_before'
            ? 'day_before'
            : 'custom'
          : null,
        tags: parseTagsInput(tagsInput),
        priority,
        description: details.trim() || null,
        show_on_calendar: showOnCalendar,
        color,
        category: category || null,
      });
      setName('');
      setNudgeOn(false);
      setNudgeMode('custom');
      setNudgeTime(DEFAULT_NUDGE_TIME);
      setTagsInput('');
      setPriority(DEFAULT_PRIORITY);
      setDetails('');
      setShowOnCalendar(false);
      setColor(null);
      setCategory(CAT_NONE);
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
    setEditNudgeOn(Boolean(h.nudge_time));
    setEditNudgeMode(h.nudge_mode === 'day_before' ? 'day_before' : 'custom');
    setEditNudgeTime(h.nudge_time || DEFAULT_NUDGE_TIME);
    setEditTags(userTagsDisplay(h.tags));
    setEditPriority(h.priority ?? DEFAULT_PRIORITY);
    setEditDetails(h.description || '');
    setEditOnCalendar(Number(h.show_on_calendar) !== 0);
    setEditColor(h.color || null);
    setEditCategory(h.category || CAT_NONE);
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await window.api.updateHabit(editingId, {
        name: editName,
        frequency: editFreq,
        nudge_time: editNudgeOn ? editNudgeTime || DEFAULT_NUDGE_TIME : null,
        nudge_mode: editNudgeOn
          ? editNudgeMode === 'day_before'
            ? 'day_before'
            : 'custom'
          : null,
        tags: parseTagsInput(editTags),
        priority: editPriority,
        description: editDetails.trim() || null,
        show_on_calendar: editOnCalendar,
        color: editColor,
        category: editCategory || null,
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
    setEditingId(null);
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

  function applyNudgeOn(dueDate, setOn, setMode, setTime, currentTime) {
    setOn(true);
    if (!currentTime) setTime(DEFAULT_NUDGE_TIME);
    if (dueDate === todayKey()) setMode('custom');
    else setMode('day_before');
  }

  function onCatSelect(e, current, apply) {
    const v = e.target.value;
    if (v === CAT_NEW) {
      catBeforeNew.current = current;
      setPromptFor(apply);
      setPromptOpen(true);
      return;
    }
    if (apply === 'create') setCategory(v);
    else setEditCategory(v);
  }

  /** Open manage dialog; select stays on the Category Edit placeholder. */
  function onCategoryEditPick(name) {
    if (!name) return;
    setManageName(name);
    setManageOpen(true);
  }

  /** Retarget assignment dropdowns after rename / delete / merge. */
  function remapAssigned(prev, result) {
    if (!prev) return prev;
    if (result.action === 'rename' && prev === result.from) return result.to;
    if (result.action === 'delete' && prev === result.name) return CAT_NONE;
    if (result.action === 'merge' && prev === result.mergeAway) return result.keep;
    return prev;
  }

  async function onCategoryManaged(result) {
    setManageOpen(false);
    setManageName('');
    await loadCategories();
    await load();
    await refresh();
    setCategory((prev) => remapAssigned(prev, result));
    setEditCategory((prev) => remapAssigned(prev, result));
  }

  async function onNewCategory(name) {
    setPromptOpen(false);
    const created = await window.api.createHabitCategory(name);
    await loadCategories();
    if (promptFor === 'create') setCategory(created);
    else setEditCategory(created);
  }

  function cancelPrompt() {
    setPromptOpen(false);
    if (promptFor === 'create') setCategory(catBeforeNew.current || CAT_NONE);
    else setEditCategory(catBeforeNew.current || CAT_NONE);
  }

  function categoryRow(value, apply, ariaAssign, ariaEdit) {
    return (
      <div className="bill-cat-row">
        <select
          value={categories.includes(value) ? value : CAT_NONE}
          onChange={(e) => onCatSelect(e, value, apply)}
          aria-label={ariaAssign}
        >
          <option value={CAT_NONE}>Uncategorized</option>
          <option value={CAT_NEW}>NEW</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value=""
          onChange={(e) => onCategoryEditPick(e.target.value)}
          aria-label={ariaEdit}
        >
          <option value="">Category Edit (choose one below)</option>
          {categories.map((name) => (
            <option key={`manage-${name}`} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    );
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
              {freqLabel(f)}
            </option>
          ))}
        </select>
      </label>
      <label className="module-filter-bar__field module-filter-bar__field--grow">
        Search
        <TagSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Name, details, category, or #tag"
          aria-label="Search habits by name, details, category, or #tag"
        />
      </label>
      {isArchive ? (
        <button
          type="button"
          className="btn-primary module-filter-bar__action"
          onClick={() => setMode('edit')}
        >
          Back to Habits
        </button>
      ) : (
        <button
          type="button"
          className="module-filter-bar__action"
          title="View shelved habits (hidden from the active list, nudges, and calendar until you Activate them)"
          aria-label="View shelved habits (hidden from the active list, nudges, and calendar until you Activate them)"
          onClick={() => setMode('archive')}
        >
          Archive
        </button>
      )}
    </div>
  );

  return (
    <div className="module-view">
      <h1>{isArchive ? 'Habits (Archive)' : 'Habits'}</h1>
      <p className="module-view__hint">
        {isArchive
          ? 'Shelved habits. Activate restores them to the active list.'
          : 'Daily / 3 Day / weekly / fortnightly / monthly check-in. Optional nudge fires a #nudge popup.'}
      </p>

      {!isArchive && (
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
                {freqLabel(f)}
              </button>
            ))}
          </div>
          {categoryRow(category, 'create', 'Habit category', 'Category Edit (choose one below)')}
          <NudgeRow
            nudge={nudgeOn}
            mode={nudgeMode}
            dueDate={createDue}
            onNudgeChange={(on) => {
              if (!on) {
                setNudgeOn(false);
                return;
              }
              applyNudgeOn(
                createDue,
                setNudgeOn,
                setNudgeMode,
                setNudgeTime,
                nudgeTime
              );
            }}
            onDayBefore={() => {
              setNudgeOn(true);
              setNudgeMode('day_before');
              if (!nudgeTime) setNudgeTime(DEFAULT_NUDGE_TIME);
            }}
            onCustom={() => {
              setNudgeOn(true);
              setNudgeMode('custom');
              setCustomOpen('create');
            }}
          />
          <NudgePreview
            nudge={nudgeOn}
            mode={nudgeMode}
            dueDate={createDue}
            dueTime={nudgeTime || DEFAULT_NUDGE_TIME}
            customDate={createDue}
            customTime={nudgeTime || DEFAULT_NUDGE_TIME}
          />
          <label className="edit-label">
            Tags (optional)
            <TagInput
              value={tagsInput}
              onChange={setTagsInput}
              placeholder="#fitness, #health"
              aria-label="Habit tags"
            />
          </label>
          <div className="reminder-meta-row reminder-meta-row--habit-color reminder-meta-row--details-fill">
            <div className="reminder-meta-row__left">
              <PrioritySelect id="habit-priority" value={priority} onChange={setPriority} />
              <label className="cal-appt-check">
                <input
                  type="checkbox"
                  checked={showOnCalendar}
                  onChange={(e) => setShowOnCalendar(e.target.checked)}
                />
                Add to Calendar
              </label>
            </div>
            <HabitColorField value={color} onChange={setColor} />
            <DetailsInline
              value={details}
              onChange={setDetails}
              placeholder="Details (optional)"
              ariaLabel="Details"
              wordLimit={1000}
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
                      {freqLabel(f)}
                    </button>
                  ))}
                </div>
                {categoryRow(
                  editCategory,
                  'edit',
                  'Habit category',
                  'Category Edit (choose one below)'
                )}
                <NudgeRow
                  nudge={editNudgeOn}
                  mode={editNudgeMode}
                  dueDate={editDue}
                  onNudgeChange={(on) => {
                    if (!on) {
                      setEditNudgeOn(false);
                      return;
                    }
                    applyNudgeOn(
                      editDue,
                      setEditNudgeOn,
                      setEditNudgeMode,
                      setEditNudgeTime,
                      editNudgeTime
                    );
                  }}
                  onDayBefore={() => {
                    setEditNudgeOn(true);
                    setEditNudgeMode('day_before');
                    if (!editNudgeTime) setEditNudgeTime(DEFAULT_NUDGE_TIME);
                  }}
                  onCustom={() => {
                    setEditNudgeOn(true);
                    setEditNudgeMode('custom');
                    setCustomOpen('edit');
                  }}
                />
                <NudgePreview
                  nudge={editNudgeOn}
                  mode={editNudgeMode}
                  dueDate={editDue}
                  dueTime={editNudgeTime || DEFAULT_NUDGE_TIME}
                  customDate={editDue}
                  customTime={editNudgeTime || DEFAULT_NUDGE_TIME}
                />
                <label className="edit-label">
                  Tags
                  <TagInput
                    value={editTags}
                    onChange={setEditTags}
                    placeholder="#fitness"
                    aria-label="Edit habit tags"
                  />
                </label>
                <div className="reminder-meta-row reminder-meta-row--habit-color reminder-meta-row--details-fill">
                  <div className="reminder-meta-row__left">
                    <PrioritySelect
                      id={`edit-habit-priority-${h.id}`}
                      value={editPriority}
                      onChange={setEditPriority}
                    />
                    <label className="cal-appt-check">
                      <input
                        type="checkbox"
                        checked={editOnCalendar}
                        onChange={(e) => setEditOnCalendar(e.target.checked)}
                      />
                      Add to Calendar
                    </label>
                  </div>
                  <HabitColorField
                    id={`edit-habit-color-${h.id}`}
                    value={editColor}
                    onChange={setEditColor}
                  />
                  <DetailsInline
                    value={editDetails}
                    onChange={setEditDetails}
                    placeholder="Details (optional)"
                    ariaLabel="Details"
                    wordLimit={1000}
                  />
                </div>
                <div className="item-row__actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => remove(editingId)}
                  >
                    Delete
                  </button>
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
                        <HabitColorDot color={h.color} /> {h.name}
                      </strong>
                      <div className="module-list__meta">
                        {freqLabel(h.frequency)}
                        {h.category ? ` · ${h.category}` : ''}
                        {h.nudge_time
                          ? ` · nudge${h.nudge_mode === 'day_before' ? ' day before' : ''} ${h.nudge_time}`
                          : ''}
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
                        <button
                          type="button"
                          disabled={h.completed_today}
                          onClick={() => toggle(h.id)}
                        >
                          {h.completed_today ? 'Completed' : 'Not Completed'}
                        </button>
                        <button type="button" onClick={() => toggle(h.id)}>
                          Undo
                        </button>
                        <button
                          type="button"
                          title="Shelve this habit (hidden from the active list, nudges, and calendar until you Activate it)"
                          aria-label="Shelve this habit (hidden from the active list, nudges, and calendar until you Activate it)"
                          onClick={() => archive(h.id)}
                        >
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
      <PromptDialog
        open={promptOpen}
        title="New category"
        message="Name for this category."
        confirmLabel="Add"
        placeholder="e.g. Health"
        onConfirm={onNewCategory}
        onCancel={cancelPrompt}
      />
      <HabitCategoryManageDialog
        open={manageOpen}
        categoryName={manageName}
        categories={categories}
        onCancel={() => setManageOpen(false)}
        onDone={onCategoryManaged}
      />
      <NudgeCustomDialog
        open={Boolean(customOpen)}
        timeOnly
        dueDate={customOpen === 'edit' ? editDue : createDue}
        time={customOpen === 'edit' ? editNudgeTime : nudgeTime}
        prompt="Time of day for the check-in ping."
        onSave={(_date, clock) => {
          if (customOpen === 'edit') {
            setEditNudgeOn(true);
            setEditNudgeMode('custom');
            setEditNudgeTime(clock);
          } else {
            setNudgeOn(true);
            setNudgeMode('custom');
            setNudgeTime(clock);
          }
          setCustomOpen(null);
        }}
        onCancel={() => setCustomOpen(null)}
      />
    </div>
  );
}
