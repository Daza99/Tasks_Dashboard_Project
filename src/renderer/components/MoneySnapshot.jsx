import React from 'react';

/**
 * Compact money snapshot: today + month-to-date.
 * @param {{ today?: number, mtd?: number, onOpen?: () => void }} props
 */
export default function MoneySnapshot({ today = 0, mtd = 0, onOpen }) {
  return (
    <div>
      <p className="section-label">Money</p>
      <div className="money-snapshot glass-inset">
        <div>
          <span className="money-snapshot__label">Today</span>
          <strong>${Number(today).toFixed(2)}</strong>
        </div>
        <div>
          <span className="money-snapshot__label">Month</span>
          <strong>${Number(mtd).toFixed(2)}</strong>
        </div>
        {onOpen && (
          <button type="button" className="btn-compact" onClick={onOpen}>
            Log
          </button>
        )}
      </div>
    </div>
  );
}
