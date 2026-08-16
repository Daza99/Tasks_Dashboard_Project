import React from 'react';

/**
 * Per-item padlock. Locked = never delete; auto-tags #locked.
 * @param {{ itemType: string, id: number, locked: boolean, onChanged?: () => void|Promise<void> }} props
 */
export default function LockButton({ itemType, id, locked, onChanged }) {
  async function toggle() {
    await window.api.setLocked(itemType, id, !locked);
    await onChanged?.();
  }

  return (
    <button
      type="button"
      className={`lock-btn${locked ? ' lock-btn--on' : ''}`}
      title={locked ? 'Unlock (allow delete)' : 'Lock (never delete)'}
      aria-label={locked ? 'Unlock item' : 'Lock item'}
      aria-pressed={Boolean(locked)}
      onClick={toggle}
    >
      {locked ? '🔒' : '🔓'}
    </button>
  );
}
