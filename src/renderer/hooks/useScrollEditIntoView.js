import { useEffect, useRef } from 'react';

/**
 * Scroll the expanded inline-edit row into view.
 * Projects (and any future list+inline-edit view) should use this hook.
 * @param {number|null|undefined} editingId
 * @returns {React.MutableRefObject<HTMLElement|null>}
 */
export function useScrollEditIntoView(editingId) {
  const editRowRef = useRef(null);
  useEffect(() => {
    if (editingId == null) return;
    const el = editRowRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [editingId]);
  return editRowRef;
}
