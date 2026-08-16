import React from 'react';
import { useLayout } from '../context/LayoutContext';

const TABS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'notes', label: 'Notes' },
];

const NAV_ITEMS = [
  { id: 'projects', label: 'Projects', icon: '▣' },
  { id: 'habits', label: 'Habits', icon: '◎' },
  { id: 'tags', label: 'Tags', icon: '#' },
  { id: 'spending', label: 'Spending', icon: '$' },
  { id: 'bills', label: 'Bills', icon: '⌘' },
  { id: 'lists', label: 'Lists', icon: '☰' },
  { id: 'weather', label: 'Weather', icon: '☁' },
  { id: 'calendar', label: 'Calendar', icon: '▦' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const CLEANUP_ITEMS = [
  { id: 'expired', label: '7+ Days Expired', icon: '⌛' },
  { id: 'completed', label: 'Completed', icon: '✓' },
  { id: 'archive', label: 'Archive', icon: '🗑' },
];

/**
 * Left navigation — clicking a topic enters Focus with that view.
 * Module tabs always show brand colors; fill only when that view is current.
 * @param {{ activeView: string|null, onNavigate: (id: string) => void }} props
 */
export default function LeftNav({ activeView, onNavigate }) {
  const { enterFocus } = useLayout();

  function open(id) {
    onNavigate(id);
    enterFocus();
  }

  return (
    <aside className="left-nav glass-panel" aria-label="Modules">
      <div className="left-nav__tabs" role="tablist">
        {TABS.map((t) => {
          const selected = activeView === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`nav-tab nav-tab--${t.id}${selected ? ' nav-tab--selected' : ''}`}
              onClick={() => open(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`nav-inbox${activeView === 'inbox' ? ' nav-inbox--active' : ''}`}
        onClick={() => open('inbox')}
      >
        <span aria-hidden>✉</span> Inbox
      </button>

      <button
        type="button"
        className={`nav-item${activeView === 'today' ? ' nav-item--active' : ''}`}
        onClick={() => open('today')}
      >
        <span className="nav-item__label">
          <span aria-hidden>●</span>
          Today
        </span>
        <span className="nav-item__chevron" aria-hidden>
          ▾
        </span>
      </button>

      <div className="nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${activeView === item.id ? ' nav-item--active' : ''}`}
            onClick={() => open(item.id)}
          >
            <span className="nav-item__label">
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </span>
            <span className="nav-item__chevron" aria-hidden>
              ▾
            </span>
          </button>
        ))}
      </div>

      <p className="nav-list__label">Cleanup</p>
      <div className="nav-list">
        {CLEANUP_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${activeView === item.id ? ' nav-item--active' : ''}`}
            onClick={() => open(item.id)}
          >
            <span className="nav-item__label">
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </span>
            <span className="nav-item__chevron" aria-hidden>
              ▾
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
