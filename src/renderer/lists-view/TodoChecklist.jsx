import React, { useState } from 'react';

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
        {items.map((it) => (
          <li key={it.id} className={`todo-check__row${it.done ? ' todo-check__row--done' : ''}`}>
            <label className="todo-check__item">
              <input
                type="checkbox"
                checked={Boolean(it.done)}
                onChange={(e) => toggle(it.id, e.target.checked)}
              />
              <span>{it.title}</span>
            </label>
            <button type="button" className="btn-light" onClick={() => remove(it.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {!items.length && <p className="stub-empty">Empty list. Add a line.</p>}
    </div>
  );
}
