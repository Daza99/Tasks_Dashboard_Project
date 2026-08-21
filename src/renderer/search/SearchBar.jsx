import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLayout } from '../context/LayoutContext';
import TagSearchInput from '../components/TagSearchInput';
import SearchFilters from './SearchFilters';
import SearchResults from './SearchResults';

const DISABLED_VIEWS = new Set([
  'settings',
  'inbox',
  'projects',
  'tags',
  'weather',
]);

const EMPTY_FILTERS = {
  year: 'all',
  month: 'all',
  repeat: 'all',
  status: 'all',
  module: 'all',
  locked: 'all',
  priority: 'all',
  paid: 'all',
  snoozed: 'all',
  category: 'all',
};

const PLACEHOLDER = {
  compact: 'Search all…',
  today: 'Search tasks & reminders…',
  tasks: 'Search tasks…',
  reminders: 'Search reminders…',
  bills: 'Search bills…',
  habits: 'Search habits…',
  calendar: 'Search events…',
  spending: 'Search spending…',
  lists: 'Search lists…',
  notes: 'Search notes…',
  expired: 'Search expired…',
  completed: 'Search completed…',
  archive: 'Search archive…',
};

function statusForView(view) {
  if (view === 'expired') return 'expired';
  if (view === 'completed') return 'completed';
  if (view === 'archive') return 'archived';
  return 'all';
}

function filtersActive(f) {
  return Object.values(f).some((v) => v && v !== 'all');
}

/**
 * TopBar search — scoped by Compact vs Focus view, popover filters + hits.
 * @param {{
 *   activeView: string,
 *   onEditRequest?: (type: string, id: number) => void
 * }} props
 */
export default function SearchBar({ activeView, onEditRequest }) {
  const { isCompact } = useLayout();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [hits, setHits] = useState([]);
  const [years, setYears] = useState([]);
  const [noteCategories, setNoteCategories] = useState([]);
  const [busy, setBusy] = useState(false);

  const disabled = !isCompact && DISABLED_VIEWS.has(activeView);
  const scope = useMemo(
    () => ({ compact: isCompact, view: activeView }),
    [isCompact, activeView]
  );

  const providerIds = useMemo(() => {
    if (isCompact) {
      return filters.module !== 'all' ? [filters.module] : ['task', 'reminder', 'bill', 'habit', 'event', 'transaction', 'list', 'note'];
    }
    const map = {
      today: ['task', 'reminder'],
      tasks: ['task'],
      reminders: ['reminder'],
      bills: ['bill'],
      habits: ['habit'],
      calendar: ['event'],
      spending: ['transaction'],
      lists: ['list'],
      notes: ['note'],
      expired: ['task', 'reminder'],
      completed: ['task', 'reminder'],
      archive: ['task', 'reminder'],
    };
    return map[activeView] || [];
  }, [isCompact, activeView, filters.module]);

  const show = {
    module: isCompact || activeView === 'today',
    repeat: providerIds.some((id) => id === 'habit' || id === 'bill' || id === 'reminder'),
    status: providerIds.some((id) => id === 'task' || id === 'reminder' || id === 'habit'),
    locked: providerIds.some((id) => id === 'task' || id === 'reminder'),
    priority: providerIds.some((id) => id === 'task' || id === 'habit' || id === 'bill'),
    paid: providerIds.includes('bill'),
    snoozed: providerIds.includes('reminder'),
    category:
      (!isCompact && activeView === 'notes') ||
      (isCompact && filters.module === 'note'),
  };

  // Reset status default when the Focus view changes
  useEffect(() => {
    setFilters((prev) => ({ ...EMPTY_FILTERS, ...prev, status: statusForView(activeView) }));
  }, [activeView]);

  useEffect(() => {
    if (!open || disabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const opts = await window.api.searchFilterOptions(scope);
        if (!cancelled) {
          setYears(opts.years || []);
          setNoteCategories(opts.noteCategories || []);
        }
      } catch {
        if (!cancelled) setYears([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, disabled, scope]);

  useEffect(() => {
    if (!open || disabled) return undefined;
    const q = query.trim();
    if (!q && !filtersActive(filters)) {
      setHits([]);
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await window.api.search({ query: q, scope, filters });
        setHits(res.hits || []);
        if (res.years) setYears(res.years);
        if (res.noteCategories) setNoteCategories(res.noteCategories);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, filters, scope, open, disabled]);

  useEffect(() => {
    function onDoc(e) {
      if (rootRef.current?.contains(e.target)) return;
      // Native <select> option list can fire outside the popover
      const tag = e.target?.tagName;
      if (tag === 'OPTION' || tag === 'SELECT') return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!disabled) {
          setOpen(true);
          inputRef.current?.focus();
        }
      }
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [disabled]);

  function pick(hit) {
    setOpen(false);
    if (hit.source_type && hit.source_id != null) {
      onEditRequest?.(hit.source_type, hit.source_id);
      return;
    }
    onEditRequest?.(hit.type, hit.id);
  }

  const placeholder = disabled
    ? 'Search'
    : isCompact
      ? PLACEHOLDER.compact
      : PLACEHOLDER[activeView] || 'Search…';

  const hint = busy
    ? 'Searching…'
    : query.trim() || filtersActive(filters)
      ? 'No matches'
      : 'Type a keyword, #tag, or set a filter';

  return (
    <div className="search-bar" ref={rootRef}>
      <TagSearchInput
        inputRef={inputRef}
        className="search-bar__input"
        value={query}
        onChange={setQuery}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Search"
      />
      {open && !disabled && (
        <div className="search-popover glass-panel" role="dialog" aria-label="Search results">
          <SearchFilters
            filters={filters}
            years={years}
            noteCategories={noteCategories}
            show={show}
            onChange={setFilters}
          />
          <SearchResults
            hits={hits}
            grouped={isCompact || activeView === 'today'}
            hint={hint}
            onPick={pick}
          />
        </div>
      )}
    </div>
  );
}
