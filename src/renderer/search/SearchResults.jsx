import React from 'react';

const TYPE_LABEL = {
  task: 'Task',
  reminder: 'Reminder',
  bill: 'Bill',
  habit: 'Habit',
  event: 'Event',
  transaction: 'Spending',
  list: 'List',
};

/**
 * Grouped (Compact) or flat result list.
 * @param {{
 *   hits: object[],
 *   grouped: boolean,
 *   hint: string,
 *   onPick: (hit: object) => void
 * }} props
 */
export default function SearchResults({ hits, grouped, hint, onPick }) {
  if (!hits.length) {
    return <p className="search-results__empty">{hint}</p>;
  }

  if (!grouped) {
    return (
      <ul className="search-results__list">
        {hits.map((h) => (
          <ResultRow key={`${h.type}-${h.id}`} hit={h} onPick={onPick} />
        ))}
      </ul>
    );
  }

  const groups = [];
  const seen = new Map();
  for (const h of hits) {
    if (!seen.has(h.type)) {
      seen.set(h.type, []);
      groups.push(h.type);
    }
    seen.get(h.type).push(h);
  }

  return (
    <div className="search-results__groups">
      {groups.map((type) => (
        <section key={type} className="search-results__group">
          <h3 className="search-results__group-title">{TYPE_LABEL[type] || type}</h3>
          <ul className="search-results__list">
            {seen.get(type).map((h) => (
              <ResultRow key={`${h.type}-${h.id}`} hit={h} onPick={onPick} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ResultRow({ hit, onPick }) {
  return (
    <li>
      <button type="button" className="search-results__row" onClick={() => onPick(hit)}>
        <span className="search-results__title">{hit.title}</span>
        {hit.subtitle ? <span className="search-results__sub">{hit.subtitle}</span> : null}
        {hit.status ? <span className="search-results__status">{hit.status}</span> : null}
      </button>
    </li>
  );
}
