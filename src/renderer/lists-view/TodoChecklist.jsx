import React, { useEffect, useRef, useState } from 'react';

/**
 * List-local to-do lines with tick-boxes. Not Tasks / not Today.
 * @param {{
 *   listId: number,
 *   items: { id: number, title: string, done: number }[],
 *   onChanged: (data: { list: object, items: object[] }) => void,
 * }} props
 */
export default function TodoChecklist({ listId, items, onChanged }) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const editRef = useRef(null);

  // Caret at the end of the chip text when edit opens.
  useEffect(() => {
    if (editingId == null) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editingId]);

  async function addLine(e) {
    e?.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const data = await window.api.addListEntry(listId, title);
    setDraft('');
    onChanged(data);
  }

  async function toggle(id, done) {
    onChanged(await window.api.toggleListEntry(id, done));
  }

  async function remove(id) {
    onChanged(await window.api.removeListEntry(id));
  }

  /** @param {{ id: number, title: string }} it */
  function beginEdit(it) {
    setEditingId(it.id);
    setEditDraft(it.title);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft('');
  }

  async function commitEdit() {
    if (editingId == null) return;
    const title = editDraft.trim();
    if (!title) return;
    const current = items.find((i) => i.id === editingId);
    if (current && current.title === title) {
      cancelEdit();
      return;
    }
    onChanged(await window.api.renameListEntry(editingId, title));
    setEditingId(null);
    setEditDraft('');
  }

  function onEditKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  return (
    <div className="todo-check">
      <form className="lists-add" onSubmit={addLine}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write an email to Jill"
          aria-label="New to-do line"
        />
        <button type="submit" className="btn-primary" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      <ul className="todo-check__list">
        {items.map((it) => {
          const editing = editingId === it.id;
          return (
            <li
              key={it.id}
              className={`todo-check__row${it.done ? ' todo-check__row--done' : ''}${
                editing ? ' todo-check__row--editing' : ''
              }`}
              onDoubleClick={(e) => {
                if (editing) return;
                if (e.target.closest('button, input, a')) return;
                beginEdit(it);
              }}
            >
              <label className="todo-check__item">
                <input
                  type="checkbox"
                  checked={Boolean(it.done)}
                  onChange={(e) => toggle(it.id, e.target.checked)}
                  aria-label={it.done ? 'Mark not done' : 'Mark done'}
                />
              </label>
              {editing ? (
                <input
                  ref={editRef}
                  type="text"
                  className="todo-check__edit"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={onEditKeyDown}
                  onBlur={cancelEdit}
                  aria-label="Edit to-do"
                />
              ) : (
                <span className="todo-check__title">{it.title}</span>
              )}
              <div className="todo-check__actions">
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={commitEdit}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="btn-light"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-light" onClick={() => beginEdit(it)}>
                      Edit
                    </button>
                    <button type="button" className="btn-light" onClick={() => remove(it.id)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!items.length && <p className="stub-empty">Empty list. Add a line.</p>}
    </div>
  );
}
