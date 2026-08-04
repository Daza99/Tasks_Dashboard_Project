import React from 'react';

/**
 * Compact habit check-in chips for Today brief.
 * @param {{ habits: Array, onToggle: (id: number) => void, onOpen?: () => void }} props
 */
export default function HabitCheckinStrip({ habits = [], onToggle, onOpen }) {
  if (!habits.length) {
    return (
      <div>
        <p className="section-label">Habits</p>
        <p className="stub-empty">
          No habits due today.{' '}
          {onOpen && (
            <button type="button" className="linkish" onClick={onOpen}>
              Add one
            </button>
          )}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="section-label">Habits</p>
      <div className="habit-strip" role="group" aria-label="Habit check-in">
        {habits.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`habit-chip${h.completed_today ? ' habit-chip--done' : ''}`}
            onClick={() => onToggle(h.id)}
            title={`Streak ${h.streak || 0}`}
          >
            {h.name}
            {h.streak > 0 ? ` · ${h.streak}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
