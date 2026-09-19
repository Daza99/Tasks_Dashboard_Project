import React from 'react';
import { habitFillStyle } from '../../utils/habit-color.js';

/**
 * Compact habit check-in chips for This Week brief.
 * @param {{ habits: Array, onToggle: (id: number) => void, onNew?: () => void }} props
 */
export default function HabitCheckinStrip({ habits = [], onToggle, onNew }) {
  return (
    <div>
      <div className="brief-section-head">
        <p className="section-label">Habits</p>
        {onNew && (
          <button type="button" className="btn-compact" onClick={onNew}>
            New
          </button>
        )}
      </div>
      {habits.length ? (
        <div className="habit-strip" role="group" aria-label="Habit check-in">
          {habits.map((h) => {
            const fill = habitFillStyle(h.color);
            return (
              <button
                key={h.id}
                type="button"
                className={`habit-chip${h.completed_today ? ' habit-chip--done' : ''}${
                  fill ? ' habit-chip--custom' : ''
                }`}
                style={fill ? { ...fill, borderColor: fill.color } : undefined}
                onClick={() => onToggle(h.id)}
                title={`Streak ${h.streak || 0}`}
              >
                {h.name}
                {h.streak > 0 ? ` · ${h.streak}` : ''}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="stub-empty">No habits due today.</p>
      )}
    </div>
  );
}
