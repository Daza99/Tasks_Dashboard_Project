import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useLayout } from '../context/LayoutContext';

/** Top chrome: menu stubs, live clock, date, Compact restore. */
export default function TopBar() {
  const { isFocus, enterCompact } = useLayout();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="top-bar">
      <nav className="top-bar__menus" aria-label="App menu">
        {['File', 'View', 'Tools', 'Help'].map((label) => (
          <button key={label} type="button" className="top-bar__menu-btn">
            {label}
          </button>
        ))}
      </nav>

      <h1 className="top-bar__clock" aria-live="polite">
        {format(now, 'h:mm a')}
      </h1>

      <div className="top-bar__right">
        {isFocus && (
          <button type="button" className="btn-compact" onClick={enterCompact}>
            Compact
          </button>
        )}
        <span className="top-bar__date">{format(now, 'EEE d MMM yyyy')}</span>
      </div>
    </header>
  );
}
