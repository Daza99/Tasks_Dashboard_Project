import { useEffect, useRef, useState } from 'react';

/**
 * Sticky card selection: click a list item to highlight it; click outside the
 * list to clear. Confirm overlays do not count as click-away.
 * @returns {{ selectedId: number|null, setSelectedId: function, listRef: React.MutableRefObject<HTMLElement|null> }}
 */
export function useSelectedCard() {
  const [selectedId, setSelectedId] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    const onPointerDown = (e) => {
      const t = e.target;
      if (t?.closest?.('.confirm-overlay, .confirm-dialog')) return;
      if (listRef.current?.contains(t)) return;
      setSelectedId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return { selectedId, setSelectedId, listRef };
}
