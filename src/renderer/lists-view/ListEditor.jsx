import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';

function todayLong() {
  return format(new Date(), 'EEEE d MMMM yyyy');
}

function todayShort() {
  return format(new Date(), 'd MMM yyyy');
}

/**
 * Create / rename list. Default name = today's long date.
 * @param {{
 *   mode: 'create'|'rename',
 *   type: 'todo'|'reminder',
 *   initialName?: string,
 *   templates?: string[],
 *   onSave: (name: string) => void|Promise<void>,
 *   onCancel: () => void,
 * }} props
 */
export default function ListEditor({
  mode,
  type,
  initialName = '',
  templates = ['Current Date', 'Project', 'Other'],
  onSave,
  onCancel,
}) {
  const [name, setName] = useState(initialName || todayLong());
  const [template, setTemplate] = useState('Current Date');
  const [project, setProject] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.key === ';') {
        e.preventDefault();
        setName((n) => `${n}${n ? ' ' : ''}${todayLong()}`);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function applyTemplate(t) {
    setTemplate(t);
    if (t === 'Current Date') setName(todayLong());
    else if (t === 'Project') setName('');
    else setName('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    let finalName = name.trim();
    if (template === 'Project' && project.trim()) {
      finalName = `${project.trim()} — ${todayLong()}`;
    }
    if (!finalName) {
      setError('Name required');
      return;
    }
    try {
      await onSave(finalName);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  return (
    <form className="create-form glass-inset" onSubmit={submit}>
      <div className="kind-toggle" role="group" aria-label="Naming template">
        {templates.map((t) => (
          <button
            key={t}
            type="button"
            className={template === t ? 'active' : ''}
            onClick={() => applyTemplate(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {template === 'Project' && (
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="Project name"
        />
      )}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="List name"
        required={template !== 'Project'}
      />
      <p className="module-list__meta">Created {todayShort()} · Ctrl+; inserts date</p>
      <p className="module-list__meta">
        {type === 'todo' ? 'To-Do list' : 'Reminder list'}
      </p>
      <div className="item-row__actions">
        <button type="submit" className="btn-primary">
          {mode === 'rename' ? 'Rename' : 'Create'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
    </form>
  );
}
