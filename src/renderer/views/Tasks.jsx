import React, { useEffect, useState } from 'react';

import { format, parseISO, isValid } from 'date-fns';

import { useBrief } from '../context/BriefContext';



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



const PRIORITIES = [1, 2, 3, 4, 5];



function PrioritySelect({ id, value, onChange }) {

  return (

    <label className="edit-label priority-select" htmlFor={id}>

      Priority

      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>

        {PRIORITIES.map((p) => (

          <option key={p} value={p}>

            P{p}{p === 1 ? ' · highest' : p === 5 ? ' · lowest' : ''}

          </option>

        ))}

      </select>

    </label>

  );

}



/**

 * Focus view: list + create/edit with mandatory todo_24 | todo_open + priority 1–5.

 * @param {{ editId?: number|null, onEditConsumed?: () => void }} props

 */

export default function TasksView({ editId = null, onEditConsumed }) {

  const { refresh } = useBrief();

  const [tasks, setTasks] = useState([]);

  const [title, setTitle] = useState('');

  const [kind, setKind] = useState('todo_24');

  const [priority, setPriority] = useState(3);

  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState(null);

  const [editTitle, setEditTitle] = useState('');

  const [editKind, setEditKind] = useState('todo_24');

  const [editDue, setEditDue] = useState('');

  const [editPriority, setEditPriority] = useState(3);

  const [editError, setEditError] = useState('');



  async function load() {

    const rows = await window.api.listTasks();

    setTasks(rows);

  }



  useEffect(() => {

    load();

  }, []);



  // Open editor when brief (or parent) requests a specific task

  useEffect(() => {

    if (editId == null) return;

    const t = tasks.find((x) => x.id === editId);

    if (!t) return;

    beginEdit(t);

    onEditConsumed?.();

  }, [editId, tasks]);



  async function create(e) {

    e.preventDefault();

    setError('');

    try {

      await window.api.createTask({ title, kind, priority });

      setTitle('');

      setPriority(3);

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

    setEditPriority(t.priority ?? 3);

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

      });

      setEditingId(null);

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

        <button type="submit" className="btn-primary">

          Create

        </button>

        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}

      </form>



      <ul className="module-list">

        {tasks.map((t) => (

          <li key={t.id} className="module-list__item glass-inset module-list__item--col">

            {editingId === t.id ? (

              <form className="edit-form" onSubmit={saveEdit}>

                <input

                  type="text"

                  value={editTitle}

                  onChange={(e) => setEditTitle(e.target.value)}

                  required

                />

                <label className="edit-label">

                  Due

                  <input

                    type="datetime-local"

                    value={editDue}

                    onChange={(e) => setEditDue(e.target.value)}

                  />

                </label>

                <PrioritySelect

                  id={`edit-priority-${t.id}`}

                  value={editPriority}

                  onChange={setEditPriority}

                />

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

              <>

                <div className="module-list__row">

                  <div>

                    <strong>

                      <span className="priority-badge" data-p={t.priority ?? 3}>

                        P{t.priority ?? 3}

                      </span>{' '}

                      {t.title}

                    </strong>

                    <div className="module-list__meta">

                      {(t.tags || []).join(', ')} · due {fmt(t.due_datetime)}

                    </div>

                  </div>

                  <div className="item-row__actions">

                    <button type="button" onClick={() => complete(t.id)}>

                      Done

                    </button>

                    <button type="button" onClick={() => beginEdit(t)}>

                      Edit

                    </button>

                    <button type="button" className="danger" onClick={() => remove(t.id)}>

                      Del

                    </button>

                  </div>

                </div>

              </>

            )}

          </li>

        ))}

        {!tasks.length && <p className="stub-empty">No active tasks.</p>}

      </ul>

    </div>

  );

}


