import React, { useState, useEffect, useRef } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { dateMethodHint, resolveDateFormat } from '../../utils/date-format.js';

const FADE_MS = 300;
const SAVED_HIDE_MS = 10000;

/** General prefs: display name, snooze, notif colors, tags, cleanup/archive. */
export default function SettingsGeneral() {
  const { settings, updateSetting } = useDatabase();
  const [saveStatus, setSaveStatus] = useState(null);
  const [statusVisible, setStatusVisible] = useState(false);
  const hideTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const [name, setName] = useState(settings?.display_name || '');
  const [snoozeMins, setSnoozeMins] = useState(
    settings?.notif_default_snooze_minutes || '10'
  );
  const [randomNotifColors, setRandomNotifColors] = useState(
    settings?.notif_random_bg === 'true'
  );
  const [showTags, setShowTags] = useState(settings?.show_tags_always === 'true');
  const [dateFormat, setDateFormat] = useState(resolveDateFormat(settings?.date_format));
  const [debutMode, setDebutMode] = useState(String(settings?.Debut_mode) === '1');
  const [retentionDays, setRetentionDays] = useState(
    settings?.retention_days_expired || '7'
  );
  const [autoDelExpired, setAutoDelExpired] = useState(
    settings?.auto_delete_expired7 === 'true'
  );
  const [autoDelExpiredDays, setAutoDelExpiredDays] = useState(
    settings?.auto_delete_expired7_days || '30'
  );
  const [archiveYears, setArchiveYears] = useState(
    settings?.archive_retention_years || '3'
  );
  const [autoDelArchive, setAutoDelArchive] = useState(
    settings?.auto_delete_archive === 'true'
  );
  const [archiveLimitMb, setArchiveLimitMb] = useState(
    settings?.archive_filesize_limit_mb || '500'
  );

  useEffect(() => {
    setName(settings?.display_name || '');
    setSnoozeMins(settings?.notif_default_snooze_minutes || '10');
    setRandomNotifColors(settings?.notif_random_bg === 'true');
    setShowTags(settings?.show_tags_always === 'true');
    setDateFormat(resolveDateFormat(settings?.date_format));
    setDebutMode(String(settings?.Debut_mode) === '1');
    setRetentionDays(settings?.retention_days_expired || '7');
    setAutoDelExpired(settings?.auto_delete_expired7 === 'true');
    setAutoDelExpiredDays(settings?.auto_delete_expired7_days || '30');
    setArchiveYears(settings?.archive_retention_years || '3');
    setAutoDelArchive(settings?.auto_delete_archive === 'true');
    setArchiveLimitMb(settings?.archive_filesize_limit_mb || '500');
  }, [settings]);

  /** Clear pending fade/hide timers for save status text. */
  function clearStatusTimers() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    hideTimerRef.current = null;
    fadeTimerRef.current = null;
  }

  useEffect(() => () => clearStatusTimers(), []);

  /** Fade out, swap text, fade in; pass null to hide and remove. */
  function fadeStatus(nextStatus, onHidden) {
    setStatusVisible(false);
    fadeTimerRef.current = setTimeout(() => {
      if (nextStatus === null) {
        setSaveStatus(null);
        return;
      }
      setSaveStatus(nextStatus);
      if (onHidden) onHidden();
      else requestAnimationFrame(() => setStatusVisible(true));
    }, FADE_MS);
  }

  async function save() {
    clearStatusTimers();
    setSaveStatus('saving');
    setStatusVisible(true);

    const mins = Math.max(1, Number(snoozeMins) || 10);
    const days = Math.min(30, Math.max(1, Number(retentionDays) || 7));
    const expKeep = Math.max(1, Number(autoDelExpiredDays) || 30);
    const years = Math.max(1, Number(archiveYears) || 3);
    const limit = Math.max(1, Number(archiveLimitMb) || 500);

    try {
      await updateSetting('display_name', name);
      await updateSetting('notif_default_snooze_minutes', String(mins));
      await updateSetting('notif_random_bg', randomNotifColors ? 'true' : 'false');
      await updateSetting('show_tags_always', showTags ? 'true' : 'false');
      await updateSetting('Debut_mode', debutMode ? '1' : '0');
      await updateSetting('retention_days_expired', String(days));
      await updateSetting('auto_delete_expired7', autoDelExpired ? 'true' : 'false');
      await updateSetting('auto_delete_expired7_days', String(expKeep));
      await updateSetting('archive_retention_years', String(years));
      await updateSetting('auto_delete_archive', autoDelArchive ? 'true' : 'false');
      await updateSetting('archive_filesize_limit_mb', String(limit));

      fadeStatus('saved', () => {
        requestAnimationFrame(() => setStatusVisible(true));
        hideTimerRef.current = setTimeout(() => {
          fadeStatus(null);
        }, SAVED_HIDE_MS);
      });
    } catch {
      clearStatusTimers();
      setSaveStatus(null);
      setStatusVisible(false);
    }
  }

  return (
    <div>
      <div className="settings-field">
        <label htmlFor="display-name">Display name</label>
        <input
          id="display-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      <div className="settings-field">
        <label htmlFor="snooze-mins">Default snooze (minutes)</label>
        <input
          id="snooze-mins"
          type="number"
          min={1}
          value={snoozeMins}
          onChange={(e) => setSnoozeMins(e.target.value)}
        />
      </div>

      <div className="settings-field settings-field--check">
        <label>
          <input
            type="checkbox"
            checked={randomNotifColors}
            onChange={async (e) => {
              const checked = e.target.checked;
              setRandomNotifColors(checked);
              await updateSetting('notif_random_bg', checked ? 'true' : 'false');
            }}
          />{' '}
          Random notification background and border
        </label>
      </div>

      <div className="settings-field settings-field--check">
        <label>
          <input
            type="checkbox"
            checked={showTags}
            onChange={(e) => setShowTags(e.target.checked)}
          />{' '}
          Show tags always (Expired / lists)
        </label>
      </div>

      <div className="settings-field settings-field--check">
        <label>
          <input
            type="checkbox"
            checked={debutMode}
            onChange={(e) => setDebutMode(e.target.checked)}
          />{' '}
          Debut mode (force show tags while testing)
        </label>
      </div>

      <fieldset className="settings-field settings-field--radios">
        <legend>Date format</legend>
        <p className="module-view__hint">
          Display only — stored dates stay yyyy-mm-dd. Native date pickers follow the OS.
        </p>
        <label>
          <input
            type="radio"
            name="date-format"
            checked={dateFormat === 'ymd'}
            onChange={async () => {
              setDateFormat('ymd');
              await updateSetting('date_format', 'ymd');
            }}
          />{' '}
          yyyy-mm-dd
        </label>
        <label>
          <input
            type="radio"
            name="date-format"
            checked={dateFormat === 'dmy'}
            onChange={async () => {
              setDateFormat('dmy');
              await updateSetting('date_format', 'dmy');
            }}
          />{' '}
          dd-mm-yyyy
        </label>
      </fieldset>

      <h2 className="settings-subhead">Cleanup / Archive</h2>
      <p className="module-view__hint">
        Move-to-container delay and retention (date method: {dateMethodHint(dateFormat)}).
      </p>

      <div className="settings-field">
        <label htmlFor="retention-days">7+ Days Expired — auto-move after (days, 1–30)</label>
        <input
          id="retention-days"
          type="number"
          min={1}
          max={30}
          value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)}
        />
      </div>

      <div className="settings-field settings-field--check">
        <label>
          <input
            type="checkbox"
            checked={autoDelExpired}
            onChange={(e) => setAutoDelExpired(e.target.checked)}
          />{' '}
          Auto-delete 7+ Days Expired (off by default)
        </label>
      </div>

      {autoDelExpired && (
        <div className="settings-field">
          <label htmlFor="auto-del-expired-days">
            Auto-delete expired items after (days)
          </label>
          <input
            id="auto-del-expired-days"
            type="number"
            min={1}
            value={autoDelExpiredDays}
            onChange={(e) => setAutoDelExpiredDays(e.target.value)}
          />
        </div>
      )}

      <div className="settings-field">
        <label htmlFor="archive-years">Archive retention (years)</label>
        <input
          id="archive-years"
          type="number"
          min={1}
          value={archiveYears}
          onChange={(e) => setArchiveYears(e.target.value)}
        />
      </div>

      <div className="settings-field settings-field--check">
        <label>
          <input
            type="checkbox"
            checked={autoDelArchive}
            onChange={(e) => setAutoDelArchive(e.target.checked)}
          />{' '}
          Auto-delete Archive after retention (off by default)
        </label>
      </div>

      <div className="settings-field">
        <label htmlFor="archive-limit">Archive filesize warning (MB)</label>
        <input
          id="archive-limit"
          type="number"
          min={1}
          value={archiveLimitMb}
          onChange={(e) => setArchiveLimitMb(e.target.value)}
        />
      </div>

      <div className="settings-row">
        <button
          type="button"
          className="btn-primary"
          onClick={save}
          disabled={saveStatus === 'saving'}
        >
          Save
        </button>
        {saveStatus && (
          <span
            className={[
              'settings-save-status',
              statusVisible && 'settings-save-status--visible',
              saveStatus === 'saved' && 'settings-save-status--saved',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-live="polite"
          >
            {saveStatus === 'saving' ? '...saving' : 'Saved!'}
          </span>
        )}
      </div>
    </div>
  );
}
