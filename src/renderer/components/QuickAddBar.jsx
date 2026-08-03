import React, { useState } from 'react';
import { useBrief } from '../context/BriefContext';

/**
 * Always-visible quick add — routes via main-process parser.
 * @param {{ compact?: boolean }} props
 */
export default function QuickAddBar({ compact = false }) {
  const { refresh } = useBrief();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await window.api.quickAdd(text.trim());
      setText('');
      setStatus(
        result.type === 'task'
          ? `Task · ${result.item.title}`
          : `Reminder · ${result.item.title}`
      );
      await refresh();
    } catch (err) {
      setStatus(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={`quick-add${compact ? ' quick-add--compact' : ''}`}
      onSubmit={submit}
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Quick add — "buy milk p1" or "remind call mom at 5pm"'
        aria-label="Quick add"
        disabled={busy}
      />
      <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>
        Add
      </button>
      {status && <span className="quick-add__status">{status}</span>}
    </form>
  );
}
