import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useLayout } from '../context/LayoutContext';
import SearchBar from '../search/SearchBar';

/** Top chrome: search, live clock, calendar jump, date, Compact restore. */
export default function TopBar({
  activeView,
  onEditRequest,
  onNavigate,
  calendarHotkey = 'Ctrl+C',
}) {
  const { isFocus, enterCompact, enterFocus } = useLayout();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function openCalendar() {
    onNavigate?.('calendar');
    enterFocus();
  }

  return (
    <header className="top-bar">
      <div className="top-bar__left">
        <SearchBar activeView={activeView} onEditRequest={onEditRequest} />
      </div>

      <h1 className="top-bar__clock" aria-live="polite">
        {format(now, 'h:mm a')}
      </h1>

      <div className="top-bar__right">
        {isFocus && (
          <button type="button" className="btn-compact" onClick={enterCompact}>
            Compact
          </button>
        )}
        <button
          type="button"
          className="top-bar__cal-btn"
          onClick={openCalendar}
          aria-label="Open calendar"
          title={`Calendar (${calendarHotkey})`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <rect
              x="3"
              y="5"
              width="18"
              height="16"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path d="M3 10h18" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <span className="top-bar__date">{format(now, 'EEE d MMM yyyy')}</span>
      </div>
    </header>
  );
}
