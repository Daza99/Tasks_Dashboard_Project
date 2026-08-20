import React, { useEffect, useState } from 'react';
import TagAuditLog from './TagAuditLog';
import { useDateFormat } from '../hooks/useDateFormat';

function countLine(counts = {}) {
  const bits = [
    counts.expired ? `${counts.expired} expired` : null,
    counts.ignored ? `${counts.ignored} ignored` : null,
    counts.moved ? `${counts.moved} → 7+ Days` : null,
    counts.orphansRemoved ? `${counts.orphansRemoved} orphans` : null,
    counts.dupsRemoved ? `${counts.dupsRemoved} dups` : null,
    counts.overdue ? `${counts.overdue} bills overdue` : null,
    counts.snoozedOverdue ? `${counts.snoozedOverdue} snoozed overdue` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'no changes';
}

/**
 * Thin Tag Inspector — Run + last-run log. Auto-run is the scheduler on launch.
 * @param {{ onInspected?: () => void }} props
 */
export default function TagInspector({ onInspected }) {
  const { formatDateTime } = useDateFormat();
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadLog() {
    try {
      const rows = await window.api.listInspectLog({ limit: 1 });
      setLast(Array.isArray(rows) && rows[0] ? rows[0] : null);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  useEffect(() => {
    loadLog();
  }, []);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const result = await window.api.inspectTags();
      setLast(result);
      onInspected?.();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const anomalies = last?.anomalies || [];
  const changes = last?.changes || [];

  return (
    <section className="tag-inspector glass-inset">
      <div className="tag-inspector__head">
        <div>
          <h2 className="tag-inspector__title">Tag Inspector</h2>
          <p className="tag-inspector__hint">
            Auto-runs on launch. Manual run checks lifecycle tags, 7+ Days
            moves, and orphan/duplicate attachments.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={run}
          disabled={busy}
        >
          {busy ? 'Running…' : 'Run'}
        </button>
      </div>

      {error ? (
        <p className="tag-inspector__err">{error}</p>
      ) : null}

      {last ? (
        <>
          <p className="tag-inspector__meta">
            Last run: {last.trigger || '—'} · {formatDateTime(last.ran_at) || '—'} ·{' '}
            {countLine(last.counts)}
          </p>
          {anomalies.length ? (
            <ul className="tag-inspector__anomalies">
              {anomalies.map((a, i) => (
                <li key={`${a.kind}-${i}`}>{a.detail || a.kind}</li>
              ))}
            </ul>
          ) : null}
          <TagAuditLog changes={changes} />
        </>
      ) : (
        <p className="tag-inspector__empty">No inspector runs logged yet.</p>
      )}
    </section>
  );
}
