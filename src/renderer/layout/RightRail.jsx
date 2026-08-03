import React from 'react';
import { useLayout } from '../context/LayoutContext';

/**
 * Compact right rail — Archive + Completed snapshot cards.
 * @param {{ onNavigate: (id: string) => void }} props
 */
export default function RightRail({ onNavigate }) {
  const { enterFocus } = useLayout();

  function open(id) {
    onNavigate(id);
    enterFocus();
  }

  return (
    <aside className="right-rail" aria-label="Containers">
      <button
        type="button"
        className="rail-card glass-panel"
        onClick={() => open('archive')}
      >
        <div>
          <p className="rail-card__title">Archive</p>
          <p className="rail-card__stat">0</p>
        </div>
        <span className="rail-card__hint">7+ days / trash can</span>
      </button>

      <button
        type="button"
        className="rail-card glass-panel"
        onClick={() => open('completed')}
      >
        <div>
          <p className="rail-card__title">Completed</p>
          <p className="rail-card__stat">0</p>
        </div>
        <span className="rail-card__hint">Restore or archive</span>
      </button>
    </aside>
  );
}
