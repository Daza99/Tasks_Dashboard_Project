import React from 'react';
import { PRIORITY_LEVELS } from '../../utils/priority.js';

/**
 * Shared P1/P2/P3 dropdown.
 * @param {{ id: string, value: number, onChange: (n: number) => void, label?: string }} props
 */
export default function PrioritySelect({ id, value, onChange, label = 'Priority' }) {
  return (
    <label className="edit-label priority-select" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {PRIORITY_LEVELS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
