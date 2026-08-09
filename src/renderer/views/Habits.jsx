import React, { useEffect, useMemo, useState } from 'react';
import { useBrief } from '../context/BriefContext';
import TagInput from '../components/TagInput';
import TagSearchInput from '../components/TagSearchInput';
import { invalidateTagCatalog } from '../hooks/useTagCatalog';
import {
  formatTagsDisplay,
  normalizeUserTagNames,
  userTagsDisplay,
} from '../../utils/tag-helpers.js';

const FREQS = ['daily', 'weekly', 'monthly'];
const FILTER_OPTS = ['all', 'daily', 'weekly', 'monthly'];

/** Parse tags for create/update — drop system names from user field. */
function parseTagsInput(raw) {
  return normalizeUserTagNames(raw);
}

/**
 * Focus view: habits CRUD + check-in + streak + nudge + tags + archive mode.
 */
export default function HabitsView() {
  const { refresh } = useBrief();
  const [mode, setMode] = useState('edit'); // edit | archive
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [nudge, setNudge] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editFreq, setEditFreq] = useState('daily');
  const [editNudge, setEditNudge] = useState('');
  const [editTags, setEditTags] = useState('');
  const [freqFilter, setFreqFilter] = useState('all');
  const [search, setSearch] = useState('');

  const isArchive = mode === 'archive';

  async function load() {
    setRows(await window.api.listHabits({ archived: isArchive }));
  }

  useEffect(() => {
    load();
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when archive mode flips
  }, [mode]);

  /** Frequency dropdown + name/#tag search (AND). */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tagQuery = q.startsWith('#') ? q.slice(1) : null;
    return rows.filter((h) => {
      if (freqFilter !== 'all' && h.frequency !== freqFilter) return false;
      if (!q) return true;
      if (tagQuery != null) {
        return (h.tags || []).some((t) => t.toLowerCase() === tagQuery);
      }
      return String(h.name || '')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, freqFilter, search]);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createHabit({
        name,
        frequency,
        nudge_time: nudge || null,
        tags: parseTagsInput(tagsInput),
      });
      setName('');
      setNudge('');
      setTagsInput('');
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function beginEdit(h) {
    setEditingId(h.id);
    setEditName(h.name);
    setEditFreq(h.frequency);
    setEditNudge(h.nudge_time || '');
    setEditTags(userTagsDisplay(h.tags));
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await window.api.updateHabit(editingId, {
        name: editName,
        frequency: editFreq,
        nudge_time: editNudge || null,
        tags: parseTagsInput(editTags),
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
          placeholder="Name or #tag"
          aria-label="Search habits by name or #tag"
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
            required
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
              placeholder="#fitness #health"
              aria-label="Habit tags"
            />
          </label>
          <button type="submit" className="btn-primary">
            Create
          </button>
          {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        </form>
      )}

      {filterBar}

      <ul className="module-list">
        {filtered.map((h) => (
          <li
            key={h.id}
            className="module-list__item glass-inset module-list__item--col"
          >
            {editingId === h.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
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
                <div className="item-row__actions">
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="module-list__row">
                  <div>
                    <strong>{h.name}</strong>
                    <div className="module-list__meta">
                      {h.frequency}
                      {h.nudge_time ? ` · nudge ${h.nudge_time}` : ''}
                      {` · streak ${h.streak || 0}`}
                      {!isArchive && h.completed_today ? ' · done today' : ''}
                    </div>
                    {h.tags?.length > 0 && (
                      <div className="item-row__tags">{formatTagsDisplay(h.tags)}</div>
                    )}
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
    </div>
  );
}
