import React from 'react';

const TITLES = {
  tasks: 'Tasks',
  reminders: 'Reminders',
  notes: 'Notes',
  projects: 'Projects',
  habits: 'Habits',
  trackers: 'Trackers',
  tags: 'Tags',
  spending: 'Spending',
  bills: 'Bills',
  lists: 'Lists',
  weather: 'Weather',
  calendar: 'Calendar',
  archive: 'Archive',
  completed: 'Completed',
  expired: '7+ Days Expired',
};

/**
 * Placeholder Focus view until the module ships.
 * @param {{ viewId: string }} props
 */
export default function StubView({ viewId }) {
  const title = TITLES[viewId] || viewId;
  return (
    <div>
      <h1>{title}</h1>
      <p>
        Focus workspace stub — wire CRUD in a later phase. Use <strong>Compact</strong> in
        the top bar to return to the glance layout.
      </p>
    </div>
  );
}
