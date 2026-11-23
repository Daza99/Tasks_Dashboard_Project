import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isValid, parseISO } from 'date-fns';
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
import { useDateFormat } from '../hooks/useDateFormat';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';
import { useSelectedCard } from '../hooks/useSelectedCard';
import { useVisibleSelection } from '../hooks/useVisibleSelection';
import { rowDblClick } from '../../utils/row-dblclick.js';
import { matchesEntitySearch } from '../../utils/entity-search.js';

const SCOPES = ['today', 'tomorrow', 'dated'];
/** Fortnight stays stored as fortnightly. Quarterly tooltip matches bills (3 months). */
const HABIT_FREQS = [
  { id: 'daily', label: 'Daily' },
  { id: '3day', label: '3 Day' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'fortnightly', label: 'Fortnight' },
  { id: 'quarterly', label: 'Quarterly', title: '3 Months' },
  { id: 'monthly', label: 'Monthly' },
];
const FILTER_OPTS = ['all', ...HABIT_FREQS.map((f) => f.id)];
const CAT_NEW = '__new__';
const CAT_NONE = '';
const DEFAULT_NUDGE_TIME = '09:00';

/** Stored / legacy freq → a tick-box id. */
function uiFrequency(f) {
  if (f === 'weekdays') return 'weekly';
  if (f === 'custom') return 'monthly';
  if (f === 'fortnight') return 'fortnightly';
  return HABIT_FREQS.some((x) => x.id === f) ? f : 'daily';
}

/** Stored freq → UI label. */
function freqLabel(f) {
  if (f === 'all') return 'All';
  if (f === 'weekdays') return 'Weekly';
  if (f === 'custom') return 'Monthly';
  if (f === 'fortnight') return 'Fortnight';
  const hit = HABIT_FREQS.find((x) => x.id === f);
  if (hit) return hit.label;
  if (!f) return '';
  return f.charAt(0).toUpperCase() + f.slice(1);
}

/** Local midnight for a yyyy-mm-dd anchor. Invalid values fall back to today. */
function parseAnchor(anchor) {
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    const [y, m, d] = anchor.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
  }
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** yyyy-mm-dd for the Today / Tomorrow / Dated buttons. */
function anchorForScope(scope, dated) {
  if (scope === 'today') return todayKey();
  if (scope === 'tomorrow') return format(addDays(new Date(), 1), 'yyyy-MM-dd');
  return dated && /^\d{4}-\d{2}-\d{2}$/.test(dated) ? dated : todayKey();
}

/** today / tomorrow when the anchor is that day, otherwise dated. */
function scopeFromAnchor(anchor) {
  if (!anchor || anchor === todayKey()) return 'today';
  if (anchor === format(addDays(new Date(), 1), 'yyyy-MM-dd')) return 'tomorrow';
  return 'dated';
}

/** List label: today, tomorrow, or the stored yyyy-mm-dd. */
function anchorScopeLabel(anchor) {
  if (!anchor) return '';
  const scope = scopeFromAnchor(anchor);
  return scope === 'dated' ? anchor : scope;
}

/** Row start date: stored anchor, else created local day. */
function rowAnchor(h) {
  if (h?.anchor_date && /^\d{4}-\d{2}-\d{2}$/.test(h.anchor_date)) return h.anchor_date;
  if (h?.created_at) {
    const created = new Date(h.created_at);
    if (!Number.isNaN(created.getTime())) return format(created, 'yyyy-MM-dd');
  }
  return todayKey();
}

/**
 * Nudge-preview due check. Mirrors habits.js isDueOn:
 * count forward from the anchor. Weekly is +7 days, not Mon–Fri.
 */
function localDueOn(freq, anchor, d) {
  const start = parseAnchor(anchor);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor(
    (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
      86400000
  );
  if (diff < 0) return false;
  const f =
    freq === 'weekdays'
      ? 'weekly'
      : freq === 'custom'
        ? 'monthly'
        : freq === 'fortnight'
          ? 'fortnightly'
          : freq;
  if (f === 'daily') return true;
  if (f === '3day') return diff % 3 === 0;
  if (f === 'weekly') return diff % 7 === 0;
  if (f === 'fortnightly') return diff % 14 === 0;
  if (f === 'monthly' || f === 'quarterly') {
    const step = f === 'quarterly' ? 3 : 1;
    const months =
      (day.getFullYear() - start.getFullYear()) * 12 + (day.getMonth() - start.getMonth());
    if (months < 0 || months % step !== 0) return false;
    const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    return day.getDate() === Math.min(start.getDate(), last);
  }
  return false;
}

/** ISO from a local yyyy-MM-dd and HH:mm. */
function localToIso(date, time) {
  const base = parseISO(`${date}T${time || DEFAULT_NUDGE_TIME}:00`);
  return isValid(base) ? base.toISOString() : null;
}

/** Next due yyyy-MM-dd on or after today (or the anchor, if that is later). */
function nextDueKey(freq, anchor) {
  let c = new Date();
  c = new Date(c.getFullYear(), c.getMonth(), c.getDate());
  const start = parseAnchor(anchor);
  if (c < start) c = new Date(start);
  for (let i = 0; i < 400; i += 1) {
    if (localDueOn(freq, anchor, c)) return format(c, 'yyyy-MM-dd');
    c = addDays(c, 1);
  }
  return format(c, 'yyyy-MM-dd');
}

/** Exclusive frequency tick boxes. The active box stays on. */
function HabitFreqChecks({ value, onChange }) {
  return HABIT_FREQS.map((opt) => (
    <label key={opt.id} className="cal-appt-check" title={opt.title}>
      <input
        type="checkbox"
        checked={value === opt.id}
        onChange={() => {
          if (value !== opt.id) onChange(opt.id);
        }}
      />
      {opt.label}
    </label>
  ));
}

/** Today / Tomorrow / Dated. No Open — a habit always has a start date. */
function HabitScopeToggle({ value, onChange }) {
  return (
    <div className="kind-toggle" role="group" aria-label="Start date">
      {SCOPES.map((s) => (
        <button
          key={s}
          type="button"
          className={value === s ? 'active' : ''}
          onClick={() => onChange(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
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
  const { methodHint } = useDateFormat();
  const [mode, setMode] = useState('edit'); // edit | archive
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [scope, setScope] = useState('today');
  const [startDate, setStartDate] = useState(() => todayKey());
  const [nudgeOn, setNudgeOn] = useState(false);
  const [nudgeMode, setNudgeMode] = useState('custom');
  const [nudgeTime, setNudgeTime] = useState(DEFAULT_NUDGE_TIME);
  const [customDate, setCustomDate] = useState(() => todayKey());
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
  const [editScope, setEditScope] = useState('today');
  const [editStart, setEditStart] = useState(() => todayKey());
  const [editNudgeOn, setEditNudgeOn] = useState(false);
  const [editNudgeMode, setEditNudgeMode] = useState('custom');
  const [editNudgeTime, setEditNudgeTime] = useState(DEFAULT_NUDGE_TIME);
  const [editCustomDate, setEditCustomDate] = useState(() => todayKey());
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

  const createAnchor = anchorForScope(scope, startDate);
  const createDue = nextDueKey(frequency, createAnchor);
  const editAnchor = anchorForScope(editScope, editStart);
  const editDue = nextDueKey(editFreq, editAnchor);

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

  // Calendar RMB: land on create, Dated to that day, Add to Calendar ticked.
  useEffect(() => {
    if (!seedDate) return;
    setMode('edit');
    setShowOnCalendar(true);
    setScope('dated');
    setStartDate(seedDate);
    setCustomDate(nextDueKey(frequency, seedDate));
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
        anchor_date: createAnchor,
        nudge_time: nudgeOn ? nudgeTime || DEFAULT_NUDGE_TIME : null,
        nudge_mode: nudgeOn
          ? nudgeMode === 'day_before'
            ? 'day_before'
            : 'custom'
          : null,
        nudge_datetime:
          nudgeOn && nudgeMode === 'custom' && scope === 'dated'
            ? localToIso(customDate, nudgeTime || DEFAULT_NUDGE_TIME)
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
    setEditFreq(uiFrequency(h.frequency));
    const anchor = rowAnchor(h);
    setEditScope(scopeFromAnchor(anchor));
    setEditStart(anchor);
    setEditNudgeOn(Boolean(h.nudge_time));
    setEditNudgeMode(h.nudge_mode === 'day_before' ? 'day_before' : 'custom');
    setEditNudgeTime(h.nudge_time || DEFAULT_NUDGE_TIME);
    if (h.nudge_datetime) {
      const d = parseISO(h.nudge_datetime);
      setEditCustomDate(
        isValid(d) ? format(d, 'yyyy-MM-dd') : nextDueKey(uiFrequency(h.frequency), anchor)
      );
    } else {
      setEditCustomDate(nextDueKey(uiFrequency(h.frequency), anchor));
    }
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
        anchor_date: editAnchor,
        nudge_time: editNudgeOn ? editNudgeTime || DEFAULT_NUDGE_TIME : null,
        nudge_mode: editNudgeOn
          ? editNudgeMode === 'day_before'
            ? 'day_before'
            : 'custom'
          : null,
        nudge_datetime:
          editNudgeOn && editNudgeMode === 'custom' && editScope === 'dated'
            ? localToIso(editCustomDate, editNudgeTime || DEFAULT_NUDGE_TIME)
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
          : 'Today / Tomorrow / Dated start. Tick Daily, 3 Day, Weekly, Fortnight, Quarterly, or Monthly. Optional nudge fires a #nudge popup. (date method: yyyy-mm-dd)'}
      </p>

      {!isArchive && (
        <form className="create-form glass-inset" onSubmit={create}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Habit name"
          />
          <HabitScopeToggle
            value={scope}
            onChange={(s) => {
              setScope(s);
              if (s === 'today') setStartDate(todayKey());
              else if (s === 'tomorrow') setStartDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
              // Dated nudge date tracks the next due, including when that due is still today.
              if (s === 'dated') setCustomDate(nextDueKey(frequency, startDate));
            }}
          />
          {scope === 'dated' && (
            <input
              className="habit-dated-input"
              type="date"
              value={startDate}
              onChange={(e) => {
                const next = e.target.value;
                setStartDate(next);
                setCustomDate(nextDueKey(frequency, next));
              }}
              aria-label="Start date"
              required
            />
          )}
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
            customDate={scope === 'dated' ? customDate : createDue}
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
              <HabitFreqChecks
                value={frequency}
                onChange={(f) => {
                  setFrequency(f);
                  if (scope === 'dated') setCustomDate(nextDueKey(f, startDate));
                }}
              />
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
        {filtered.map((h) => {
          const dueToday = h.next_due_date === todayKey();
          return (
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
                <HabitScopeToggle
                  value={editScope}
                  onChange={(s) => {
                    setEditScope(s);
                    let start = editStart;
                    if (s === 'today') {
                      start = todayKey();
                      setEditStart(start);
                    } else if (s === 'tomorrow') {
                      start = format(addDays(new Date(), 1), 'yyyy-MM-dd');
                      setEditStart(start);
                    }
                    if (s === 'dated') setEditCustomDate(nextDueKey(editFreq, start));
                  }}
                />
                {editScope === 'dated' && (
                  <input
                    className="habit-dated-input"
                    type="date"
                    value={editStart}
                    onChange={(e) => {
                      const next = e.target.value;
                      setEditStart(next);
                      setEditCustomDate(nextDueKey(editFreq, next));
                    }}
                    aria-label="Start date"
                    required
                  />
                )}
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
                  customDate={editScope === 'dated' ? editCustomDate : editDue}
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
                    <HabitFreqChecks
                      value={editFreq}
                      onChange={(f) => {
                        setEditFreq(f);
                        if (editScope === 'dated') setEditCustomDate(nextDueKey(f, editStart));
                      }}
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
                        {anchorScopeLabel(rowAnchor(h))}
                        {` · ${freqLabel(h.frequency)}`}
                        {h.next_due_date ? ` · next ${h.next_due_date}` : ''}
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
                          disabled={!dueToday || h.completed_today}
                          title={dueToday ? undefined : `Next due ${h.next_due_date || ''}`}
                          onClick={() => toggle(h.id)}
                        >
                          {h.completed_today ? 'Completed' : 'Not Completed'}
                        </button>
                        <button
                          type="button"
                          disabled={!dueToday}
                          title={dueToday ? undefined : `Next due ${h.next_due_date || ''}`}
                          onClick={() => toggle(h.id)}
                        >
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
          );
        })}
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
        timeOnly={(customOpen === 'edit' ? editScope : scope) !== 'dated'}
        dueDate={customOpen === 'edit' ? editDue : createDue}
        time={customOpen === 'edit' ? editNudgeTime : nudgeTime}
        initialDate={customOpen === 'edit' ? editCustomDate : customDate}
        prompt={
          (customOpen === 'edit' ? editScope : scope) === 'dated'
            ? `When to ping before the next due (date method: ${methodHint}).`
            : 'Time of day for the check-in ping.'
        }
        onSave={(date, clock) => {
          const dated = (customOpen === 'edit' ? editScope : scope) === 'dated';
          if (customOpen === 'edit') {
            setEditNudgeOn(true);
            setEditNudgeMode('custom');
            setEditNudgeTime(clock);
            if (dated) setEditCustomDate(date);
          } else {
            setNudgeOn(true);
            setNudgeMode('custom');
            setNudgeTime(clock);
            if (dated) setCustomDate(date);
          }
          setCustomOpen(null);
        }}
        onCancel={() => setCustomOpen(null)}
      />
    </div>
  );
}
