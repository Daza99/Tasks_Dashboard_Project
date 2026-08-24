import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TagInput from '../components/TagInput';
import TagSearchInput from '../components/TagSearchInput';
import { invalidateTagCatalog } from '../hooks/useTagCatalog';
import {
  formatTagsDisplay,
  normalizeUserTagNames,
  userTagsDisplay,
} from '../../utils/tag-helpers.js';
import DetailsInline from '../components/DetailsInline';
import DetailsPreview from '../components/DetailsPreview';
import ConfirmDialog from '../components/ConfirmDialog';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';
import { useDateFormat } from '../hooks/useDateFormat';
import { rowDblClick } from '../../utils/row-dblclick.js';

const KINDS = ['count', 'scale', 'mood', 'energy', 'stopwatch', 'countdown'];
const PERIODS = ['daily', 'weekly', 'monthly', 'bimonthly', 'as_needed'];
const KIND_LABEL = {
  count: 'Count',
  scale: 'Scale',
  mood: 'Mood',
  energy: 'Energy',
  stopwatch: 'Stopwatch',
  countdown: 'Countdown',
};
const PERIOD_LABEL = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  bimonthly: 'Bi-monthly',
  as_needed: 'As needed',
};
const MOOD_FACES = ['😫', '😕', '😐', '🙂', '😄'];
const ENERGY_FACES = ['😩', '😪', '😐', '🙂'];
const MOOD_LABELS = ['Very bad', 'Bad', 'Neutral', 'Good', 'Great'];
const ENERGY_LABELS = ['Very tired', 'Tired', 'Neutral', 'Normal'];

function parseTagsInput(raw) {
  return normalizeUserTagNames(raw);
}

/** mm:ss or h:mm:ss → ms. */
function parseDuration(str) {
  const parts = String(str || '')
    .trim()
    .split(':')
    .map((p) => Number(p));
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000);
  if (parts.length === 3) {
    return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
  }
  return null;
}

function formatDurationInput(ms) {
  const n = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatMs(ms) {
  const n = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Wall-clock display for timers (renderer tick; main owns remaining). */
function liveDisplayMs(t, now) {
  const base = Number(t.elapsed_ms) || 0;
  let elapsed = base;
  if (t.status === 'running' && t.started_at) {
    const start = Date.parse(t.started_at);
    if (Number.isFinite(start)) elapsed = base + Math.max(0, now - start);
  }
  if (t.kind === 'countdown') {
    const dur = Number(t.config?.duration_ms) || 0;
    return Math.max(0, dur - elapsed);
  }
  return elapsed;
}

function fmtWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Local yyyy-mm-dd. */
function localDateKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** created_at / logged_at → local yyyy-mm-dd. */
function isoToDateKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : localDateKey(d);
}

/** Monday of the local week containing d. */
function mondayOf(d) {
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + mondayOffset);
  return today;
}

function addDaysLocal(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Inclusive created_at window for the date filter, or null for Any.
 * @returns {{ start: string, end: string }|null}
 */
function dateFilterWindow(filter, customFrom, customTo, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === 'this_week') {
    const start = mondayOf(today);
    return { start: localDateKey(start), end: localDateKey(addDaysLocal(start, 6)) };
  }
  if (filter === 'last_week') {
    const start = addDaysLocal(mondayOf(today), -7);
    return { start: localDateKey(start), end: localDateKey(addDaysLocal(start, 6)) };
  }
  if (filter === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: localDateKey(start), end: localDateKey(today) };
  }
  if (filter === 'last_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: localDateKey(start), end: localDateKey(end) };
  }
  if (filter === 'custom') {
    if (!customFrom && !customTo) return null;
    return { start: customFrom || '0000-01-01', end: customTo || '9999-12-31' };
  }
  return null;
}

/** (TODAY) while created locally today, else display-format date. */
function createdBadge(iso, nowMs, formatDate) {
  const k = isoToDateKey(iso);
  if (!k) return '';
  return k === localDateKey(new Date(nowMs)) ? 'TODAY' : formatDate(k);
}

/**
 * Custom created-date range. Same solid #fff/#111 shell as ConfirmDialog.
 */
function DateRangeDialog({
  open,
  from,
  to,
  methodHint,
  onChangeFrom,
  onChangeTo,
  onApply,
  onCancel,
}) {
  if (!open) return null;
  return createPortal(
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracker-range-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="tracker-range-title">Custom date range</h2>
        <p>Filter by created date ({methodHint}).</p>
        <div className="tracker-date-range">
          <label className="edit-label">
            From
            <input type="date" value={from} onChange={(e) => onChangeFrom(e.target.value)} />
          </label>
          <label className="edit-label">
            To
            <input type="date" value={to} onChange={(e) => onChangeTo(e.target.value)} />
          </label>
        </div>
        <div className="confirm-dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onApply}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function emptyKindFields(kind) {
  if (kind === 'count') return { step: '1', unit: '', target: '' };
  if (kind === 'scale') return { min: '1', max: '10' };
  if (kind === 'countdown') return { duration: '5:00', keep: true };
  return {};
}

function configFromFields(kind, fields) {
  if (kind === 'count') {
    return {
      step: Number(fields.step) || 1,
      unit: fields.unit || '',
      target: fields.target === '' || fields.target == null ? null : Number(fields.target),
    };
  }
  if (kind === 'scale') return { min: Number(fields.min), max: Number(fields.max) };
  if (kind === 'countdown') {
    const duration_ms = parseDuration(fields.duration);
    if (duration_ms == null) throw new Error('Duration must be mm:ss or h:mm:ss');
    return { duration_ms };
  }
  return {};
}

/**
 * Focus view: tracker CRUD + inline log/timer controls + PopOut.
 */
export default function TrackersView({ editId = null, onEditConsumed }) {
  const { formatDate, methodHint } = useDateFormat();
  const [rows, setRows] = useState([]);
  const [due, setDue] = useState([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('count');
  const [period, setPeriod] = useState('daily');
  const [kindFields, setKindFields] = useState(() => emptyKindFields('count'));
  const [tagsInput, setTagsInput] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const editRowRef = useScrollEditIntoView(editingId);
  const [editName, setEditName] = useState('');
  const [editPeriod, setEditPeriod] = useState('daily');
  const [editFields, setEditFields] = useState({});
  const [editTags, setEditTags] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [resetId, setResetId] = useState(null);
  const [dateFilter, setDateFilter] = useState('any');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraftFrom, setCustomDraftFrom] = useState('');
  const [customDraftTo, setCustomDraftTo] = useState('');
  /** Newest first by created_at */
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(() => new Set());
  const selectAllRef = useRef(null);
  const [now, setNow] = useState(() => Date.now());
  const settlingRef = useRef(new Set());

  async function load() {
    const [list, dueRows] = await Promise.all([
      window.api.listTrackers(),
      window.api.listTrackersDue(),
    ]);
    setRows(Array.isArray(list) ? list : []);
    setDue(Array.isArray(dueRows) ? dueRows : []);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!window.api?.onTrackersChanged) return undefined;
    return window.api.onTrackersChanged(() => {
      load();
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Countdown hitting 0 → main settles (Keep=done, Once=delete)
  useEffect(() => {
    for (const t of rows) {
      if (t.kind !== 'countdown' || t.status !== 'running') continue;
      if (liveDisplayMs(t, now) > 0) continue;
      if (settlingRef.current.has(t.id)) continue;
      settlingRef.current.add(t.id);
      timerPause(t.id).finally(() => settlingRef.current.delete(t.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick-driven settle
  }, [now, rows]);

  useEffect(() => {
    if (editId == null) return;
    const t = rows.find((x) => x.id === editId);
    if (!t) return;
    beginEdit(t);
    onEditConsumed?.();
  }, [editId, rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tagQuery = q.startsWith('#') ? q.slice(1) : null;
    const win = dateFilterWindow(dateFilter, customFrom, customTo);
    const list = rows.filter((t) => {
      if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
      if (periodFilter !== 'all' && t.period !== periodFilter) return false;
      if (win) {
        const k = isoToDateKey(t.created_at);
        if (!k || k < win.start || k > win.end) return false;
      }
      if (!q) return true;
      if (tagQuery != null) {
        return (t.tags || []).some((tag) => tag.toLowerCase() === tagQuery);
      }
      return String(t.name || '')
        .toLowerCase()
        .includes(q);
    });
    // Sort by created_at (+ id tiebreak); desc = newest on top
    const mul = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const ca = String(a.created_at || '');
      const cb = String(b.created_at || '');
      if (ca !== cb) return ca < cb ? -mul : mul;
      return (a.id - b.id) * mul;
    });
    return list;
  }, [rows, kindFilter, periodFilter, search, dateFilter, customFrom, customTo, sortDir]);

  const visibleIds = useMemo(() => filtered.map((t) => t.id), [filtered]);

  // Drop selection for rows no longer visible (filters / deletes)
  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelected((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleIds]);

  const selectedVisibleCount = useMemo(() => {
    let n = 0;
    for (const id of visibleIds) if (selected.has(id)) n += 1;
    return n;
  }, [visibleIds, selected]);

  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate =
      selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  }, [selectedVisibleCount, visibleIds.length]);

  function setKindAndFields(next) {
    setKind(next);
    setKindFields(emptyKindFields(next));
  }

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const config = configFromFields(kind, kindFields);
      await window.api.createTracker({
        name,
        kind,
        period,
        config,
        keep: kind === 'countdown' ? Boolean(kindFields.keep) : true,
        tags: parseTagsInput(tagsInput),
        description: details.trim() || null,
      });
      setName('');
      setKindFields(emptyKindFields(kind));
      setTagsInput('');
      setDetails('');
      invalidateTagCatalog();
      await load();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function beginEdit(t) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditPeriod(t.period);
    setEditTags(userTagsDisplay(t.tags));
    setEditDetails(t.description || '');
    if (t.kind === 'count') {
      setEditFields({
        step: String(t.config?.step ?? 1),
        unit: t.config?.unit || '',
        target: t.config?.target == null ? '' : String(t.config.target),
      });
    } else if (t.kind === 'scale') {
      setEditFields({
        min: String(t.config?.min ?? 1),
        max: String(t.config?.max ?? 10),
      });
    } else if (t.kind === 'countdown') {
      setEditFields({
        duration: formatDurationInput(t.config?.duration_ms),
        keep: Boolean(t.keep),
      });
    } else {
      setEditFields({});
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    const t = rows.find((x) => x.id === editingId);
    if (!t) return;
    try {
      const config = configFromFields(t.kind, editFields);
      await window.api.updateTracker(editingId, {
        name: editName,
        period: editPeriod,
        config,
        keep: t.kind === 'countdown' ? Boolean(editFields.keep) : true,
        tags: parseTagsInput(editTags),
        description: editDetails.trim() || null,
      });
      setEditingId(null);
      invalidateTagCatalog();
      await load();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function remove(id) {
    await window.api.deleteTracker(id);
    setDeleteId(null);
    await load();
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSelectAllChange(checked) {
    if (checked) {
      setSelected(new Set(visibleIds));
    } else {
      setSelected(new Set());
    }
  }

  async function removeSelected() {
    const ids = visibleIds.filter((id) => selected.has(id));
    if (!ids.length) {
      setBulkDeleteOpen(false);
      return;
    }
    await window.api.deleteTrackers(ids);
    setSelected(new Set());
    setBulkDeleteOpen(false);
    await load();
  }

  async function log(id, value) {
    await window.api.logTracker(id, value);
    await load();
  }

  async function undo(id) {
    await window.api.undoTrackerLog(id);
    await load();
  }

  async function timerStart(id) {
    await window.api.trackerTimerStart(id);
    await load();
  }

  async function timerPause(id) {
    await window.api.trackerTimerPause(id);
    await load();
  }

  async function timerReset(id) {
    await window.api.trackerTimerReset(id);
    await load();
  }

  async function resetAll(id) {
    await window.api.resetTracker(id);
    setResetId(null);
    await load();
  }

  function openCustomRange() {
    setCustomDraftFrom(customFrom);
    setCustomDraftTo(customTo);
    setCustomOpen(true);
  }

  function onDateFilterChange(v) {
    if (v === 'custom') {
      openCustomRange();
      return;
    }
    setDateFilter(v);
  }

  function kindFieldsUi(fields, setFields, forKind) {
    if (forKind === 'count') {
      return (
        <div className="tracker-kind-fields">
          <label className="edit-label">
            Step
            <input
              type="number"
              min="1"
              value={fields.step}
              onChange={(e) => setFields({ ...fields, step: e.target.value })}
            />
          </label>
          <label className="edit-label">
            Unit
            <input
              type="text"
              value={fields.unit}
              onChange={(e) => setFields({ ...fields, unit: e.target.value })}
              placeholder="glasses"
            />
          </label>
          <label className="edit-label">
            Target (optional)
            <input
              type="number"
              min="0"
              value={fields.target}
              onChange={(e) => setFields({ ...fields, target: e.target.value })}
            />
          </label>
        </div>
      );
    }
    if (forKind === 'scale') {
      return (
        <div className="tracker-kind-fields">
          <label className="edit-label">
            Min
            <input
              type="number"
              value={fields.min}
              onChange={(e) => setFields({ ...fields, min: e.target.value })}
            />
          </label>
          <label className="edit-label">
            Max
            <input
              type="number"
              value={fields.max}
              onChange={(e) => setFields({ ...fields, max: e.target.value })}
            />
          </label>
        </div>
      );
    }
    if (forKind === 'countdown') {
      return (
        <div className="tracker-kind-fields">
          <label className="edit-label">
            Duration
            <input
              type="text"
              value={fields.duration}
              onChange={(e) => setFields({ ...fields, duration: e.target.value })}
              placeholder="5:00"
              aria-label="Duration mm:ss"
            />
          </label>
          <div className="kind-toggle kind-toggle--labels" role="group" aria-label="Keep or Once">
            <button
              type="button"
              className={fields.keep ? 'active' : ''}
              onClick={() => setFields({ ...fields, keep: true })}
            >
              Keep
            </button>
            <button
              type="button"
              className={!fields.keep ? 'active' : ''}
              onClick={() => setFields({ ...fields, keep: false })}
            >
              Once
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  function inlineControls(t) {
    if (t.kind === 'count') {
      const step = t.config?.step || 1;
      return (
        <div className="tracker-controls">
          <button type="button" onClick={() => log(t.id, -step)}>
            −
          </button>
          <span className="tracker-controls__value">{t.period_total || 0}</span>
          <button type="button" onClick={() => log(t.id, step)}>
            +
          </button>
          <button type="button" onClick={() => undo(t.id)}>
            Undo
          </button>
        </div>
      );
    }
    if (t.kind === 'scale') {
      const min = t.config.min;
      const max = t.config.max;
      const span = max - min + 1;
      if (span > 12) {
        return (
          <div className="tracker-controls">
            <select
              value={t.last_value ?? min}
              aria-label="Scale value"
              onChange={(e) => log(t.id, Number(e.target.value))}
            >
              {Array.from({ length: span }, (_, i) => min + i).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        );
      }
      return (
        <div className="tracker-controls tracker-controls--wrap">
          {Array.from({ length: span }, (_, i) => min + i).map((v) => (
            <button
              key={v}
              type="button"
              className={t.last_value === v ? 'active' : ''}
              onClick={() => log(t.id, v)}
            >
              {v}
            </button>
          ))}
        </div>
      );
    }
    if (t.kind === 'mood' || t.kind === 'energy') {
      const faces = t.kind === 'energy' ? ENERGY_FACES : MOOD_FACES;
      const labels = t.kind === 'energy' ? ENERGY_LABELS : MOOD_LABELS;
      const todayKey = localDateKey(new Date(now));
      const logs = t.stamp_logs || [];
      return (
        <div className="tracker-face-row">
          <div className="tracker-controls">
            {faces.map((face, i) => {
              const v = i + 1;
              const label = labels[i] || face;
              return (
                <button
                  key={v}
                  type="button"
                  className={`tracker-controls__face${t.last_value === v ? ' active' : ''}`}
                  title={label}
                  aria-label={label}
                  onClick={() => log(t.id, v)}
                >
                  {face}
                </button>
              );
            })}
          </div>
          {logs.length > 0 && (
            <div className="tracker-stamps" aria-label="Logged changes">
              {logs.map((l) => {
                const frozen = isoToDateKey(l.logged_at) !== todayKey;
                const face = faces[Number(l.value) - 1] || String(l.value);
                return (
                  <span
                    key={l.id}
                    className={`tracker-stamps__chip${frozen ? ' tracker-stamps__chip--frozen' : ''}`}
                  >
                    {fmtWhen(l.logged_at)} {face}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    if (t.kind === 'stopwatch' || t.kind === 'countdown') {
      const remaining = liveDisplayMs(t, now);
      return (
        <div className="tracker-controls">
          <span className="tracker-controls__clock">{formatMs(remaining)}</span>
          <button
            type="button"
            onClick={() => (t.status === 'running' ? timerPause(t.id) : timerStart(t.id))}
          >
            {t.status === 'running' ? 'Pause' : t.status === 'done' ? 'Restart' : 'Start'}
          </button>
          <button type="button" onClick={() => timerReset(t.id)}>
            Reset
          </button>
        </div>
      );
    }
    return null;
  }

  function metaLine(t) {
    const parts = [PERIOD_LABEL[t.period] || t.period, KIND_LABEL[t.kind] || t.kind];
    if (t.kind === 'count') {
      const unit = t.config?.unit ? ` ${t.config.unit}` : '';
      const target = t.config?.target != null ? `/${t.config.target}` : '';
      parts.push(`this period ${t.period_total || 0}${target}${unit}`);
    } else if (t.kind === 'scale' || t.kind === 'mood' || t.kind === 'energy') {
      if (t.period_log_count) {
        const faces =
          t.kind === 'energy' ? ENERGY_FACES : t.kind === 'mood' ? MOOD_FACES : null;
        const shown = faces && t.last_value ? faces[t.last_value - 1] : t.last_value;
        parts.push(`last ${shown} · ${t.period_log_count} this period`);
      } else {
        parts.push('no logs this period');
      }
    } else if (t.kind === 'countdown') {
      parts.push(t.keep ? 'Keep' : 'Once');
      if (t.status === 'done') parts.push('done');
    }
    const when = fmtWhen(t.last_logged_at);
    if (when) parts.push(`last ${when}`);
    return parts.join(' · ');
  }

  return (
    <div className="module-view">
      <h1>Trackers</h1>
      <p className="module-view__hint">
        Log counts, ratings, mood, energy, or run a named clock. Periods: daily / weekly /
        monthly / bi-monthly. (date method: {methodHint})
      </p>

      <form className="create-form glass-inset" onSubmit={create}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tracker name"
        />
        <div className="kind-toggle kind-toggle--labels" role="group" aria-label="Kind">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? 'active' : ''}
              onClick={() => setKindAndFields(k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="kind-toggle kind-toggle--labels" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={period === p ? 'active' : ''}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        {kindFieldsUi(kindFields, setKindFields, kind)}
        <label className="edit-label">
          Tags (optional)
          <TagInput
            value={tagsInput}
            onChange={setTagsInput}
            placeholder="#health"
            aria-label="Tracker tags"
          />
        </label>
        <DetailsInline
          value={details}
          onChange={setDetails}
          placeholder="Details (optional)"
          ariaLabel="Details"
        />
        <button type="submit" className="btn-primary">
          Create
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </form>

      {due.length > 0 && (
        <div className="tracker-due glass-inset">
          <p className="section-label">Due this period</p>
          <div className="tracker-due__chips">
            {due.map((t) => (
              <span key={t.id} className="tracker-due__chip">
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="module-filter-bar glass-inset">
        <label className="module-filter-bar__field">
          Kind
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            aria-label="Kind filter"
          >
            <option value="all">All</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="module-filter-bar__field">
          Date
          <select
            value={customOpen ? 'custom' : dateFilter}
            onChange={(e) => onDateFilterChange(e.target.value)}
            aria-label="Created date filter"
          >
            <option value="any">Any</option>
            <option value="this_week">This week</option>
            <option value="this_month">This month</option>
            <option value="last_week">Last week</option>
            <option value="last_month">Last month</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="module-filter-bar__field">
          Period
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            aria-label="Period filter"
          >
            <option value="all">All</option>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="module-filter-bar__field module-filter-bar__field--grow">
          Search
          <TagSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Name or #tag"
            aria-label="Search trackers by name or #tag"
          />
        </label>
      </div>

      <div className="tracker-list-toolbar">
        <div className="kind-toggle kind-toggle--labels" role="group" aria-label="Sort by created date">
          <button
            type="button"
            className={sortDir === 'asc' ? 'active' : ''}
            title="Oldest first"
            aria-label="Oldest first"
            onClick={() => setSortDir('asc')}
          >
            ^
          </button>
          <button
            type="button"
            className={sortDir === 'desc' ? 'active' : ''}
            title="Newest first"
            aria-label="Newest first"
            onClick={() => setSortDir('desc')}
          >
            v
          </button>
        </div>
        <div className="tracker-list-toolbar__right">
          <label className="bill-check">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              disabled={!visibleIds.length}
              onChange={(e) => onSelectAllChange(e.target.checked)}
              aria-label="Select all visible trackers"
            />
            Select all
          </label>
          <button
            type="button"
            className="danger"
            disabled={!selectedVisibleCount}
            onClick={() => setBulkDeleteOpen(true)}
          >
            Delete
          </button>
        </div>
      </div>

      <ul className="module-list">
        {filtered.map((t) => (
          <li
            key={t.id}
            ref={editingId === t.id ? editRowRef : null}
            className={`module-list__item glass-inset module-list__item--col${
              editingId === t.id ? ' module-list__item--editing' : ''
            }`}
          >
            {editingId === t.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <div className="kind-toggle kind-toggle--labels" role="group" aria-label="Period">
                  {PERIODS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={editPeriod === p ? 'active' : ''}
                      onClick={() => setEditPeriod(p)}
                    >
                      {PERIOD_LABEL[p]}
                    </button>
                  ))}
                </div>
                {kindFieldsUi(editFields, setEditFields, t.kind)}
                <label className="edit-label">
                  Tags
                  <TagInput
                    value={editTags}
                    onChange={setEditTags}
                    placeholder="#health"
                    aria-label="Edit tracker tags"
                  />
                </label>
                <DetailsInline
                  value={editDetails}
                  onChange={setEditDetails}
                  placeholder="Details (optional)"
                  ariaLabel="Details"
                />
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
                  onDoubleClick={rowDblClick(() => beginEdit(t))}
                >
                  <div className="tracker-list__main">
                    <label className="bill-check tracker-list__check">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelected(t.id)}
                        aria-label={`Select ${t.name}`}
                      />
                    </label>
                    <div>
                      <strong>
                        {t.name}
                        <span className="tracker-created">
                          ({createdBadge(t.created_at, now, formatDate)})
                        </span>
                      </strong>
                      <div className="module-list__meta">{metaLine(t)}</div>
                      {t.tags?.length > 0 && (
                        <div className="item-row__tags">{formatTagsDisplay(t.tags)}</div>
                      )}
                      <DetailsPreview text={t.description} />
                    </div>
                  </div>
                  <div className="item-row__actions">
                    <button type="button" onClick={() => setResetId(t.id)}>
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => window.api.openTrackerPopout(t.id)}
                    >
                      PopOut
                    </button>
                    <button type="button" onClick={() => beginEdit(t)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setDeleteId(t.id)}
                    >
                      Del
                    </button>
                  </div>
                </div>
                {inlineControls(t)}
              </>
            )}
          </li>
        ))}
        {!filtered.length && (
          <p className="stub-empty">
            {!rows.length
              ? 'No trackers yet.'
              : 'No trackers match these filters.'}
          </p>
        )}
      </ul>

      <DateRangeDialog
        open={customOpen}
        from={customDraftFrom}
        to={customDraftTo}
        methodHint={methodHint}
        onChangeFrom={setCustomDraftFrom}
        onChangeTo={setCustomDraftTo}
        onApply={() => {
          setCustomFrom(customDraftFrom);
          setCustomTo(customDraftTo);
          setDateFilter('custom');
          setCustomOpen(false);
        }}
        onCancel={() => setCustomOpen(false)}
      />

      <ConfirmDialog
        open={resetId != null}
        title="Are you sure?"
        message="Clears all counts, mood/energy logs, and timer progress. The tracker stays."
        confirmLabel="Yes"
        onConfirm={() => resetAll(resetId)}
        onCancel={() => setResetId(null)}
      />

      <ConfirmDialog
        open={deleteId != null}
        title="Delete tracker?"
        message="Removes the tracker and its logs. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => remove(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`Delete ${selectedVisibleCount} tracker${selectedVisibleCount === 1 ? '' : 's'}?`}
        message="Removes the selected trackers and their logs. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={removeSelected}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}
