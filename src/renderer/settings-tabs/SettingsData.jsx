import React, { useState, useEffect } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import ConfirmDialog from '../components/ConfirmDialog';

/** Format ISO timestamp as yyyy-mm-dd HH:mm (local). */
function formatBackupWhen(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Backup / restore: snapshot DB + wallpapers/sounds/themes. */
export default function SettingsData() {
  const { settings, updateSetting, setSettings } = useDatabase();
  const [autoDaily, setAutoDaily] = useState(settings?.backup_auto_daily !== 'false');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [restoreTarget, setRestoreTarget] = useState(null);

  useEffect(() => {
    setAutoDaily(settings?.backup_auto_daily !== 'false');
  }, [settings?.backup_auto_daily]);

  async function onToggleDaily(checked) {
    setAutoDaily(checked);
    await updateSetting('backup_auto_daily', checked ? 'true' : 'false');
  }

  async function onBackupNow() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await window.api.backupNow();
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              last_backup_at: result.lastBackupAt || prev.last_backup_at,
              last_backup_path: result.path || prev.last_backup_path,
            }
          : prev
      );
      setMessage(`Backup saved: ${result.path}`);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveCopy() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await window.api.backupChooseDest();
      if (result?.cancelled) {
        setMessage('Copy cancelled.');
      } else {
        setMessage(`Copy saved: ${result.path}`);
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPickRestore() {
    setError('');
    setMessage('');
    try {
      const picked = await window.api.backupPickRestore();
      if (picked?.cancelled) return;
      setRestoreTarget(picked);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function onConfirmRestore() {
    const folder = restoreTarget?.path;
    setRestoreTarget(null);
    if (!folder) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await window.api.backupRestore(folder);
      setMessage('Restoring — app will relaunch.');
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  }

  const lastLabel = formatBackupWhen(settings?.last_backup_at);
  const restoreWhen =
    restoreTarget?.created
      ? formatBackupWhen(restoreTarget.created)
      : restoreTarget?.stamp || restoreTarget?.path;

  return (
    <div>
      <p className="module-view__hint">
        Snapshots include dashboard.db plus wallpapers, sounds, and themes (date method:
        yyyy-mm-dd).
      </p>

      <div className="settings-field">
        <label>Last backup</label>
        <strong>{lastLabel}</strong>
        {settings?.last_backup_path ? (
          <span className="settings-data__path">{settings.last_backup_path}</span>
        ) : null}
      </div>

      <div className="settings-field settings-field--check">
        <label>
          <input
            type="checkbox"
            checked={autoDaily}
            onChange={(e) => onToggleDaily(e.target.checked)}
          />{' '}
          Daily auto-backup on launch (if last backup is older than 24h)
        </label>
      </div>

      <div className="settings-row settings-data__actions">
        <button
          type="button"
          className="btn-primary"
          onClick={onBackupNow}
          disabled={busy}
        >
          Backup Now
        </button>
        <button type="button" className="btn-light" onClick={onSaveCopy} disabled={busy}>
          Save copy to…
        </button>
        <button type="button" className="danger" onClick={onPickRestore} disabled={busy}>
          Restore from folder
        </button>
      </div>

      {message ? <p className="settings-data__ok">{message}</p> : null}
      {error ? <p className="settings-data__err">{error}</p> : null}

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title="Restore backup?"
        message={`This replaces current data with ${restoreWhen}. The app will relaunch. A safety snapshot is saved first.`}
        confirmLabel="Restore"
        danger
        onConfirm={onConfirmRestore}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
