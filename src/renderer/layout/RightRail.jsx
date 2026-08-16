import React, { useEffect, useState } from 'react';
import { useLayout } from '../context/LayoutContext';

/**
 * Compact right rail — 7+ Days / Completed / Archive snapshot cards.
 * @param {{ onNavigate: (id: string) => void }} props
 */
export default function RightRail({ onNavigate }) {
  const { enterFocus } = useLayout();
  const [counts, setCounts] = useState({ expired7: 0, completed: 0, archive: 0 });

  async function loadCounts() {
    try {
      const c = await window.api.containerCounts();
      setCounts(c);
    } catch {
      /* rail stays at last known counts */
    }
  }

  useEffect(() => {
    loadCounts();
    const id = setInterval(loadCounts, 30_000);
    return () => clearInterval(id);
  }, []);

  function open(id) {
    onNavigate(id);
    enterFocus();
  }

  return (
    <aside className="right-rail" aria-label="Containers">
      <button
        type="button"
        className="rail-card glass-panel"
        onClick={() => open('expired')}
      >
        <div>
          <p className="rail-card__title">7+ Days</p>
          <p className="rail-card__stat">{counts.expired7 ?? 0}</p>
        </div>
        <span className="rail-card__hint">Expired · restore / delete</span>
      </button>

      <button
        type="button"
        className="rail-card glass-panel"
        onClick={() => open('completed')}
      >
        <div>
          <p className="rail-card__title">Completed</p>
          <p className="rail-card__stat">{counts.completed ?? 0}</p>
        </div>
        <span className="rail-card__hint">Restore or archive</span>
      </button>

      <button
        type="button"
        className="rail-card glass-panel"
        onClick={() => open('archive')}
      >
        <div>
          <p className="rail-card__title">Archive</p>
          <p className="rail-card__stat">{counts.archive ?? 0}</p>
        </div>
        <span className="rail-card__hint">Trash can</span>
      </button>
    </aside>
  );
}
