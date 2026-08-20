import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import TagSearchInput from '../components/TagSearchInput';
import TagInspector from '../inspection/TagInspector';
import {
  formatTagDisplay,
  formatTagsDisplay,
  normalizeTagName,
  userTagsOnly,
} from '../../utils/tag-helpers.js';

const PAGE = 10;

const SORT_OPTS = [
  { value: 'all', label: 'ALL' },
  { value: 'descending', label: 'Descending' },
  { value: 'latest', label: 'Latest' },
  { value: 'popular', label: 'Popular' },
];

const TYPE_ORDER = ['task', 'reminder', 'habit', 'transaction'];

const TYPE_LABEL = {
  task: 'Tasks',
  reminder: 'Reminders',
  habit: 'Habits',
  transaction: 'Spending',
};

function fmtDateTime(iso) {
  if (!iso || String(iso).startsWith('9999')) return 'Open';
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'MMM d · h:mm a') : iso;
  } catch {
    return iso;
  }
}

function scopeFromTags(tags = []) {
  if (tags.includes('rem_tomorrow')) return 'tomorrow';
  if (tags.includes('rem_dated')) return 'dated';
  if (tags.includes('rem_open')) return 'open';
  return 'today';
}

function byName(a, b) {
  return String(a.name).localeCompare(String(b.name), undefined, {
    sensitivity: 'base',
  });
}

/** Filter (exact then substring) then apply sort; exact matches stay first when searching. */
function filterAndSort(catalog, search, sort) {
  const q = normalizeTagName(search);
  const cmp = (a, b) => {
    if (sort === 'descending') return byName(b, a);
    if (sort === 'latest') {
      const byDate = String(b.created_at || '').localeCompare(String(a.created_at || ''));
      return byDate || byName(a, b);
    }
    if (sort === 'popular') {
      const byUse = (b.usage || 0) - (a.usage || 0);
      return byUse || byName(a, b);
    }
    return byName(a, b);
  };

  if (!q) return [...catalog].sort(cmp);

  const exact = [];
  const partial = [];
  for (const t of catalog) {
    const n = String(t.name || '');
    if (n === q) exact.push(t);
    else if (n.includes(q)) partial.push(t);
  }
  exact.sort(cmp);
  partial.sort(cmp);
  return [...exact, ...partial];
}

function groupByType(items) {
  const groups = [];
  for (const type of TYPE_ORDER) {
    const rows = items.filter((it) => it.item_type === type);
    if (rows.length) groups.push({ type, rows });
  }
  return groups;
}

/**
 * Focus view: existing user tags + optional attached-item inspector.
 * @param {{ onEditRequest?: (type: string, id: number) => void }} props
 */
export default function TagsView({ onEditRequest }) {
  const { refresh } = useBrief();
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('all');
  const [showItems, setShowItems] = useState(false);
  const [pages, setPages] = useState({});
  const [error, setError] = useState('');
  const pagesRef = useRef({});
  pagesRef.current = pages;

  async function loadCatalog() {
    setError('');
    try {
      const rows = await window.api.listTagCatalog();
      setCatalog(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  const filtered = useMemo(
    () => filterAndSort(catalog, search, sort),
    [catalog, search, sort]
  );

  const itemTally = useMemo(
    () => filtered.reduce((n, t) => n + (t.usage || 0), 0),
    [filtered]
  );

  useEffect(() => {
    if (!showItems) {
      pagesRef.current = {};
      setPages({});
      return;
    }
    let cancelled = false;
    async function fillMissing() {
      const missing = filtered.filter((t) => !pagesRef.current[t.name]);
      await Promise.all(
        missing.map(async (tag) => {
          try {
            const res = await window.api.listTagItems(tag.name, {
              limit: PAGE,
              offset: 0,
            });
            if (cancelled) return;
            const next = {
              items: res.items || [],
              total: Number(res.total) || 0,
            };
            pagesRef.current = { ...pagesRef.current, [tag.name]: next };
            setPages((prev) => ({ ...prev, [tag.name]: next }));
          } catch {
            /* catalog still lists the tag */
          }
        })
      );
    }
    fillMissing();
    return () => {
      cancelled = true;
    };
  }, [showItems, filtered]);

  async function reloadTag(name, keepCount) {
    const limit = Math.max(PAGE, keepCount || PAGE);
    const res = await window.api.listTagItems(name, { limit, offset: 0 });
    const next = { items: res.items || [], total: Number(res.total) || 0 };
    pagesRef.current = { ...pagesRef.current, [name]: next };
    setPages((prev) => ({ ...prev, [name]: next }));
  }

  async function continueTag(name) {
    const cur = pagesRef.current[name];
    const offset = cur?.items?.length || 0;
    const res = await window.api.listTagItems(name, { limit: PAGE, offset });
    setPages((prev) => {
      const prevItems = prev[name]?.items || [];
      const next = {
        items: [...prevItems, ...(res.items || [])],
        total: Number(res.total) || 0,
      };
      pagesRef.current = { ...pagesRef.current, [name]: next };
      return { ...prev, [name]: next };
    });
  }

  async function afterChange(tagName) {
    await loadCatalog();
    await refresh();
    if (showItems && tagName) {
      const keep = pagesRef.current[tagName]?.items?.length || PAGE;
      await reloadTag(tagName, keep);
    }
  }

  async function completeTask(tagName, id) {
    await window.api.completeTask(id);
    await afterChange(tagName);
  }

  async function completeReminder(tagName, id) {
    await window.api.completeReminder(id);
    await afterChange(tagName);
  }

  async function deleteTask(tagName, id) {
    await window.api.deleteTask(id);
    await afterChange(tagName);
  }

  async function deleteReminder(tagName, id) {
    await window.api.deleteReminder(id);
    await afterChange(tagName);
  }

  async function toggleHabit(tagName, id) {
    await window.api.toggleCheckin(id);
    await afterChange(tagName);
  }

  async function deleteHabit(tagName, id) {
    await window.api.deleteHabit(id);
    await afterChange(tagName);
  }

  async function deleteTx(tagName, id) {
    await window.api.deleteTransaction(id);
    await afterChange(tagName);
  }

  return (
    <div className="module-view">
      <h1>Tags</h1>
      <p className="module-view__hint">
        Lists all existing tags and search for entities attached to a tag.
      </p>

      <div className="module-filter-bar glass-inset">
        <label className="module-filter-bar__field">
          Filter
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Tag sort"
          >
            {SORT_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="module-filter-bar__field module-filter-bar__field--grow">
          Search
          <TagSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tag name"
            aria-label="Search tags"
          />
        </label>
        <label className="module-filter-bar__check">
          <input
            type="checkbox"
            checked={showItems}
            onChange={(e) => setShowItems(e.target.checked)}
          />
          Show items
        </label>
      </div>

      {error ? (
        <p className="stub-empty" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}

      {showItems ? (
        <p className="tags-tally">
          {itemTally} {itemTally === 1 ? 'item' : 'items'} across {filtered.length}{' '}
          {filtered.length === 1 ? 'tag' : 'tags'}
        </p>
      ) : null}

      {!filtered.length ? (
        <p className="stub-empty">
          {catalog.length ? 'No tags match.' : 'No tags yet.'}
        </p>
      ) : (
        <ul className="tags-catalog">
          {filtered.map((tag) => {
            const page = pages[tag.name];
            const groups = showItems ? groupByType(page?.items || []) : [];
            const loaded = page?.items?.length || 0;
            const total = page?.total ?? tag.usage;
            return (
              <li key={tag.id} className="tags-catalog__block">
                <div className="tags-catalog__head">
                  <span className="tags-catalog__name">
                    {formatTagDisplay(tag.name)}
                  </span>
                  <span className="tags-catalog__count">({tag.usage})</span>
                </div>
                {showItems ? (
                  <div className="tags-catalog__items">
                    {groups.map((g) => (
                      <section key={g.type} className="tags-type-group">
                        <h3 className="tags-type-group__title">
                          {TYPE_LABEL[g.type]}
                        </h3>
                        <ul className="module-list">
                          {g.rows.map((item) => (
                            <TagAttachedRow
                              key={`${item.item_type}-${item.id}`}
                              item={item}
                              tagName={tag.name}
                              onEditRequest={onEditRequest}
                              onCompleteTask={completeTask}
                              onCompleteReminder={completeReminder}
                              onDeleteTask={deleteTask}
                              onDeleteReminder={deleteReminder}
                              onToggleHabit={toggleHabit}
                              onDeleteHabit={deleteHabit}
                              onDeleteTx={deleteTx}
                            />
                          ))}
                        </ul>
                      </section>
                    ))}
                    {page && !loaded && total === 0 ? (
                      <p className="tags-catalog__empty">No items attached.</p>
                    ) : null}
                    {page && loaded < total ? (
                      <button
                        type="button"
                        className="tags-continue"
                        onClick={() => continueTag(tag.name)}
                      >
                        Continue results
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <TagInspector
        onInspected={() => {
          loadCatalog();
          refresh();
        }}
      />
    </div>
  );
}

function TagAttachedRow({
  item,
  tagName,
  onEditRequest,
  onCompleteTask,
  onCompleteReminder,
  onDeleteTask,
  onDeleteReminder,
  onToggleHabit,
  onDeleteHabit,
  onDeleteTx,
}) {
  const type = item.item_type;
  const locked = Boolean(item.locked);
  const done = Boolean(item.completed_at);
  const userTags = userTagsOnly(item.tags);

  let title = item.title || item.name || '';
  let meta = '';
  if (type === 'task') {
    title = (
      <>
        <span className="priority-badge" data-p={item.priority ?? 3}>
          P{item.priority ?? 3}
        </span>{' '}
        {item.title}
      </>
    );
    meta = [
      item.tags?.includes('todo_open') ? 'open' : '24hr',
      locked ? 'locked' : null,
      userTags.length ? formatTagsDisplay(userTags) : null,
      `due ${fmtDateTime(item.due_datetime)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (type === 'reminder') {
    meta = [
      scopeFromTags(item.tags),
      locked ? 'locked' : null,
      userTags.length ? formatTagsDisplay(userTags) : null,
      item.recurrence === 'daily' ? 'daily' : null,
      fmtDateTime(item.datetime),
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (type === 'habit') {
    title = (
      <>
        <span className="priority-badge" data-p={item.priority ?? 3}>
          P{item.priority ?? 3}
        </span>{' '}
        {item.name}
      </>
    );
    meta = [
      item.frequency,
      item.nudge_time ? `nudge ${item.nudge_time}` : null,
      `streak ${item.streak || 0}`,
      item.completed_today ? 'done today' : null,
      userTags.length ? formatTagsDisplay(userTags) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (type === 'transaction') {
    title = `$${Number(item.amount).toFixed(2)} · ${item.category}`;
    meta = [item.date, userTags.length ? formatTagsDisplay(userTags) : null]
      .filter(Boolean)
      .join(' · ');
  }

  const hasDetails = Boolean(String(item.description || '').trim());

  return (
    <li className="module-list__item glass-inset module-list__item--col">
      <div className="module-list__row">
        <div>
          <strong>
            {title}
            {hasDetails ? (
              <span className="details-mark" title="Has details">
                details
              </span>
            ) : null}
          </strong>
          {meta ? <div className="module-list__meta">{meta}</div> : null}
        </div>
        <div className="item-row__actions">
          {type === 'task' && !done ? (
            <button type="button" onClick={() => onCompleteTask(tagName, item.id)}>
              Done
            </button>
          ) : null}
          {type === 'reminder' && !done ? (
            <button
              type="button"
              onClick={() => onCompleteReminder(tagName, item.id)}
            >
              Done
            </button>
          ) : null}
          {type === 'habit' ? (
            <button type="button" onClick={() => onToggleHabit(tagName, item.id)}>
              {item.completed_today ? 'Undo' : 'Check in'}
            </button>
          ) : null}
          <button type="button" onClick={() => onEditRequest?.(type, item.id)}>
            Edit
          </button>
          {type === 'task' && !locked ? (
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteTask(tagName, item.id)}
            >
              Del
            </button>
          ) : null}
          {type === 'reminder' && !locked ? (
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteReminder(tagName, item.id)}
            >
              Del
            </button>
          ) : null}
          {type === 'habit' ? (
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteHabit(tagName, item.id)}
            >
              Del
            </button>
          ) : null}
          {type === 'transaction' ? (
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteTx(tagName, item.id)}
            >
              Del
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
