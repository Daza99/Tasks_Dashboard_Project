import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import TagInput from '../components/TagInput';
import LockButton from '../components/LockButton';
import { invalidateTagCatalog } from '../hooks/useTagCatalog';
import {
  formatTagsDisplay,
  normalizeUserTagNames,
  userTagsDisplay,
  userTagsOnly,
} from '../../utils/tag-helpers.js';
import PrioritySelect from '../components/PrioritySelect';
import DetailsInline from '../components/DetailsInline';
import { DEFAULT_PRIORITY } from '../../utils/priority.js';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';

function fmt(iso) {
  if (!iso) return '—';
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'MMM d · h:mm a') : iso;
  } catch {
    return iso;
  }
}

/** datetime-local value from ISO (local wall clock). */
function toLocalInput(iso) {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return '';
    return format(d, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

/**
 * Focus view: list + create/edit with mandatory todo_24 | todo_open + P1–P3.
 * @param {{
 *   editId?: number|null,
 *   onEditConsumed?: () => void,
 *   seedDate?: string|null,
 *   onSeedConsumed?: () => void,
 * }} props
 */
export default function TasksView({
  editId = null,
  onEditConsumed,
  seedDate = null,
  onSeedConsumed,
}) {
  const { refresh } = useBrief();
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('todo_24');
  const [priority, setPriority] = useState(DEFAULT_PRIORITY);
  const [tagsInput, setTagsInput] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const editRowRef = useScrollEditIntoView(editingId);
  const [editTitle, setEditTitle] = useState('');
  const [editKind, setEditKind] = useState('todo_24');
  const [editDue, setEditDue] = useState('');
  const [editPriority, setEditPriority] = useState(DEFAULT_PRIORITY);
  const [editTags, setEditTags] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editError, setEditError] = useState('');

  async function load() {
    const rows = await window.api.listTasks();
    setTasks(rows);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (editId == null) return;
    const t = tasks.find((x) => x.id === editId);
    if (!t) return;
    beginEdit(t);
    onEditConsumed?.();
  }, [editId, tasks]);

  useEffect(() => {
    if (!seedDate) return;
    setDue(`${seedDate}T09:00`);
    onSeedConsumed?.();
  }, [seedDate]);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createTask({
        title,
        kind,
        priority,
        tags: normalizeUserTagNames(tagsInput),
        description: details.trim() || null,
        due_datetime: due ? new Date(due).toISOString() : null,
      });
      setTitle('');
      setPriority(DEFAULT_PRIORITY);
      setTagsInput('');
      setDetails('');
      setDue('');
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function beginEdit(t) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditKind(t.tags?.includes('todo_open') ? 'todo_open' : 'todo_24');
    setEditDue(toLocalInput(t.due_datetime));
    setEditPriority(t.priority ?? DEFAULT_PRIORITY);
    setEditTags(userTagsDisplay(t.tags));
    setEditDetails(t.description || '');
    setEditError('');
  }

  async function saveEdit(e) {
    e.preventDefault();
    setEditError('');
    try {
      const due_datetime = editDue ? new Date(editDue).toISOString() : null;
      await window.api.updateTask(editingId, {
        title: editTitle,
        due_datetime,
        kind: editKind,
        priority: editPriority,
        tags: normalizeUserTagNames(editTags),
        description: editDetails.trim() || null,
      });
      setEditingId(null);
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setEditError(err?.message || String(err));
    }
  }

  async function complete(id) {
    await window.api.completeTask(id);
    await load();
    await refresh();
  }

  async function remove(id) {
    await window.api.deleteTask(id);
    await load();
    await refresh();
  }

  return (
    <div className="module-view">
      <h1>Tasks</h1>
      <p className="module-view__hint">
        Creation requires <strong>24hr</strong> or <strong>Open</strong>. Priority 1 = highest.
      </p>

      <form className="create-form glass-inset" onSubmit={create}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          required
        />
        <div className="reminder-meta-row">
          <div className="reminder-meta-row__left">
            <div className="kind-toggle" role="group" aria-label="Task kind">
              <button
                type="button"
                className={kind === 'todo_24' ? 'active' : ''}
                onClick={() => setKind('todo_24')}
              >
                24hr
              </button>
              <button
                type="button"
                className={kind === 'todo_open' ? 'active' : ''}
                onClick={() => setKind('todo_open')}
              >
                Open
              </button>
            </div>
            <PrioritySelect id="create-priority" value={priority} onChange={setPriority} />
            <label className="edit-label">
              Due
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <label className="edit-label">
              Tags (optional)
              <TagInput
                value={tagsInput}
                onChange={setTagsInput}
                placeholder="#work, #home"
                aria-label="Task tags"
              />
            </label>
          </div>
          <DetailsInline
            value={details}
            onChange={setDetails}
            placeholder="Optional task details"
            ariaLabel="Optional task details"
          />
        </div>
        <button type="submit" className="btn-primary">
          Create
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </form>

      <ul className="module-list">
        {tasks.map((t) => (
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
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
                <div className="reminder-meta-row">
                  <div className="reminder-meta-row__left">
                    <label className="edit-label">
                      Due
                      <input
                        type="datetime-local"
                        value={editDue}
                        onChange={(e) => setEditDue(e.target.value)}
                      />
                    </label>
                    <div className="kind-toggle" role="group" aria-label="Edit kind">
                      <button
                        type="button"
                        className={editKind === 'todo_24' ? 'active' : ''}
                        onClick={() => setEditKind('todo_24')}
                      >
                        24hr
                      </button>
                      <button
                        type="button"
                        className={editKind === 'todo_open' ? 'active' : ''}
                        onClick={() => setEditKind('todo_open')}
                      >
                        Open
                      </button>
                    </div>
                    <PrioritySelect
                      id={`edit-priority-${t.id}`}
                      value={editPriority}
                      onChange={setEditPriority}
                    />
                    <label className="edit-label">
                      Tags
                      <TagInput
                        value={editTags}
                        onChange={setEditTags}
                        placeholder="#tag"
                        aria-label="Edit task tags"
                      />
                    </label>
                  </div>
                  <DetailsInline
                    value={editDetails}
                    onChange={setEditDetails}
                    placeholder="Optional task details"
                    ariaLabel="Optional task details"
                  />
                </div>
                <div className="item-row__actions">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
                {editError && <span style={{ color: 'var(--danger)' }}>{editError}</span>}
              </form>
            ) : (
              <div className="module-list__row">
                <div>
                  <strong>
                    <span className="priority-badge" data-p={t.priority ?? 3}>
                      P{t.priority ?? 3}
                    </span>{' '}
                    {t.title}
                    {t.description?.trim() ? (
                      <span className="details-mark" title="Has details">
                        details
                      </span>
                    ) : null}
                  </strong>
                  <div className="module-list__meta">
                    {t.tags?.includes('todo_open') ? 'open' : '24hr'}
                    {t.locked ? ' · locked' : ''}
                    {userTagsOnly(t.tags).length
                      ? ` · ${formatTagsDisplay(userTagsOnly(t.tags))}`
                      : ''}{' '}
                    · due {fmt(t.due_datetime)}
                  </div>
                </div>
                <div className="item-row__actions">
                  <LockButton
                    itemType="task"
                    id={t.id}
                    locked={t.locked}
                    onChanged={async () => {
                      await load();
                      await refresh();
                    }}
                  />
                  <button type="button" onClick={() => complete(t.id)}>
                    Done
                  </button>
                  <button type="button" onClick={() => beginEdit(t)}>
                    Edit
                  </button>
                  {!t.locked && (
                    <button type="button" className="danger" onClick={() => remove(t.id)}>
                      Del
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {!tasks.length && <p className="stub-empty">No active tasks.</p>}
      </ul>
    </div>
  );
}
