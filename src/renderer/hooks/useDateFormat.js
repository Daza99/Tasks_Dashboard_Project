import { useDatabase } from '../context/DatabaseContext';
import {
  dateMethodHint,
  formatDateKey,
  formatLocalDateTime,
  resolveDateFormat,
} from '../../utils/date-format.js';

/** Settings-backed display format. Storage is unchanged. */
export function useDateFormat() {
  const { settings } = useDatabase();
  const dateFormat = resolveDateFormat(settings?.date_format);
  return {
    dateFormat,
    methodHint: dateMethodHint(dateFormat),
    formatDate: (value) => formatDateKey(value, dateFormat),
    formatDateTime: (iso) => formatLocalDateTime(iso, dateFormat),
  };
}
