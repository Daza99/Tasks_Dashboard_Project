import React from 'react';

/**
 * Change rows for one inspector run.
 * @param {{ changes?: { item_type?: string, item_id?: number, from?: string, to?: string, note?: string }[] }} props
 */
export default function TagAuditLog({ changes }) {
  const rows = Array.isArray(changes) ? changes : [];
  if (!rows.length) {
    return <p className="tag-inspector__empty">No tag changes this run.</p>;
  }
  return (
    <ul className="tag-audit-log">
      {rows.map((ch, i) => (
        <li key={`${ch.item_type}-${ch.item_id}-${i}`} className="tag-audit-log__row">
          <span className="tag-audit-log__note">{ch.note || 'change'}</span>
          {ch.from || ch.to ? (
            <span className="tag-audit-log__tags">
              {ch.from || '—'} → {ch.to || '—'}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
