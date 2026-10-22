"use client";

import { useCallback, useEffect, useState } from 'react';
import { AUDIO_STORAGE_EVENT, deleteStoredAudio, downloadStoredAudio, listStoredAudio, type StoredAudio } from '@/lib/audio-storage';
import { useLocalization } from './LocalizationProvider';

function itemId(item: StoredAudio) { return `${item.kind}:${item.id}`; }

export function AudioStorageManager() {
  const { t } = useLocalization();
  const [items, setItems] = useState<StoredAudio[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(t('Open this panel to read local audio storage.'));

  const refresh = useCallback(async (announce = true) => {
    try {
      const rows = await listStoredAudio();
      setItems(rows);
      setSelected((ids) => ids.filter((id) => rows.some((row) => itemId(row) === id)));
      if (announce) setMessage(t('Storage list refreshed.'));
    } catch {
      setMessage(t('Audio storage could not be read in this browser.'));
    }
  }, [t]);

  useEffect(() => {
    const changed = () => void refresh(false);
    window.addEventListener(AUDIO_STORAGE_EVENT, changed);
    return () => window.removeEventListener(AUDIO_STORAGE_EVENT, changed);
  }, [refresh]);

  const remove = async () => {
    setBusy(true);
    try {
      await deleteStoredAudio(items.filter((item) => selected.includes(itemId(item))));
      setSelected([]);
      setConfirm(false);
      setMessage(t('Selected local audio was deleted.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('Deletion failed. Refresh the list before retrying.'));
    } finally {
      await refresh(false);
      setBusy(false);
    }
  };

  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  const kindLabel = (kind: StoredAudio['kind']) => kind === 'builder'
    ? t('Song Builder / Play-Along backing')
    : kind === 'trainer' ? t('Trainer recording') : t('Song Library recording');

  return <details className="audio-storage-manager song-tool-panel" onToggle={(event) => { if (event.currentTarget.open) void refresh(); }}>
    <summary>{t('Manage local audio storage')}</summary>
    <p>{(totalBytes / 1_048_576).toFixed(2)} MiB across {items.length} local audio items, including imported backing tracks. Sizes exclude database overhead, custom drum samples, and the offline page cache. Export originals before deleting them.</p>
    <div className="song-actions">
      <button type="button" disabled={busy} onClick={() => void refresh()}>{t('Refresh audio storage')}</button>
      <button type="button" disabled={busy || !items.length} onClick={() => { setSelected(items.map(itemId)); setConfirm(false); }}>{t('Select all audio')}</button>
    </div>
    {items.length ? <ul aria-label={t('Stored audio files')}>
      {items.map((item) => <li key={itemId(item)}>
        <label>
          <input
            type="checkbox"
            disabled={busy}
            checked={selected.includes(itemId(item))}
            onChange={(event) => {
              const id = itemId(item);
              setSelected((ids) => event.target.checked ? [...ids, id] : ids.filter((value) => value !== id));
              setConfirm(false);
            }}
          />{' '}
          {item.label}{item.pinned ? ` · ${t('pinned reference')}` : ''}
        </label>
        <small>{kindLabel(item.kind)} · {(item.bytes / 1_048_576).toFixed(2)} MiB</small>
        <button type="button" disabled={busy} onClick={() => downloadStoredAudio(item)}>{t('Export original')}</button>
      </li>)}
    </ul> : <p>{t('No saved recordings or imported backing tracks were found.')}</p>}
    {confirm ? <div role="group" aria-label={t('Confirm audio deletion')}>
      <p>{t('Permanently delete {count} selected audio items, including selected pinned references? This cannot be undone.', { count: selected.length })}</p>
      <button type="button" disabled={busy} onClick={() => void remove()}>{t('Confirm permanent audio deletion')}</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(false)}>{t('Cancel deletion')}</button>
    </div> : <button type="button" disabled={busy || !selected.length} onClick={() => setConfirm(true)}>{t('Delete selected audio…')}</button>}
    <p role="status">{message}</p>
  </details>;
}
