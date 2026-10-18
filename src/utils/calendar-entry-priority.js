/** Display rank: bills, reminders, habits, tasks, then manual and anything else. */
const RANK = {
  bill: 0,
  reminder: 1,
  habit: 2,
  task: 3,
};

/**
 * Sort rank for a calendar entry. Unknown and manual events rank last.
 * @param {object} ev
 * @returns {number}
 */
export function calendarEntryRank(ev) {
  const rank = RANK[ev?.source_type];
  return rank == null ? 4 : rank;
}

/**
 * Bills, then reminders, habits, tasks, then the rest.
 * Same rank keeps start time, then id.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function compareCalendarEntries(a, b) {
  const byRank = calendarEntryRank(a) - calendarEntryRank(b);
  if (byRank) return byRank;
  const ta = a?.start_datetime || '';
  const tb = b?.start_datetime || '';
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return (Number(a?.id) || 0) - (Number(b?.id) || 0);
}

/**
 * Copy sorted for chips and the day list. Does not mutate the source.
 * @param {object[]} events
 * @returns {object[]}
 */
export function sortCalendarEntries(events) {
  return [...events].sort(compareCalendarEntries);
}
