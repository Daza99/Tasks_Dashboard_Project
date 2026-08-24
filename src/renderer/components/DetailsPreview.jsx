import React from 'react';

/**
 * List row: up to 3 lines of entity details (Spending / Tasks / etc.).
 * @param {{ text?: string|null }} props
 */
export default function DetailsPreview({ text }) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  return <div className="details-preview">{trimmed}</div>;
}
