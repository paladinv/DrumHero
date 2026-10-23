"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { deleteBuilderBackingFile, readBuilderBackings, replaceBuilderBackingFiles, saveBuilderBacking, type BuilderBacking } from '@/lib/song-builder-storage';
import type { PortablePlayAlongStem } from '@/lib/playalong-package';
import { useLocalization } from './LocalizationProvider';

export type PlayAlongStemMixerHandle = {
  sync: (milliseconds: number, rate?: number) => void;
  pause: () => void;
  getTempo: () => number | undefined;
  getStems: () => BuilderBacking[];
  isRightsConfirmed: () => boolean;
  replaceStems: (stems: PortablePlayAlongStem[], tempo?: number) => Promise<void>;
};

type Props = { songId: string; tempo: number };
const MAX_STEMS = 6;
const MAX_TRACK_BYTES = 60 * 1024 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

function audioPeaks(data: Float32Array) {
  return Array.from({ length: 240 }, (_, index) => {
    const start = Math.floor(index * data.length / 240);
    const end = Math.floor((index + 1) * data.length / 240);
    let peak = 0;
    const stride = Math.max(1, Math.floor((end - start) / 160));
    for (let at = start; at < end; at += stride) peak = Math.max(peak, Math.abs(data[at] ?? 0));
    return peak;
  });
}

function saveOriginal(track: BuilderBacking) {
  const extension = track.blob.type.includes('wav') ? 'wav' : track.blob.type.includes('mp4') ? 'm4a' : track.blob.type.includes('ogg') ? 'ogg' : 'webm';
  const url = URL.createObjectURL(track.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${track.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 72) || 'play-along-stem'}.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function exportRightsNote(track: BuilderBacking) {
  const note = {
    format: 'drum-hero-playalong-stem-note-v1',
    fileName: track.name,
    mimeType: track.blob.type,
    durationSeconds: Math.round(track.duration * 100) / 100,
    tempoBpm: track.bpm,
    firstDownbeatSeconds: track.downbeat,
    source: track.source ?? '',
    rightsOrPermission: track.rights ?? '',
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(note, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${track.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 72) || 'play-along-stem'}-rights.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export const PlayAlongStemMixer = forwardRef<PlayAlongStemMixerHandle, Props>(function PlayAlongStemMixer({ songId, tempo }, ref) {
  const { t } = useLocalization();
  const [tracks, setTracks] = useState<BuilderBacking[]>([]);
  const [syncTempo, setSyncTempo] = useState(tempo);
  const [source, setSource] = useState('');
  const [rights, setRights] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const urls = useRef<Record<string, string>>({});
  const unlockedIds = useRef(new Set<string>());
  const saveTimers = useRef<Record<string, number>>({});
  const unlockNotice = useRef(false);

  useEffect(() => {
    let active = true;
    void readBuilderBackings(songId).then((items) => {
      if (!active) return;
      // Keep a legacy single-track Play-Along import visible after upgrading to multi-stem storage.
      const stems = items;
      tracksRef.current = stems;
      setTracks(stems);
      if (stems.length) setSyncTempo(stems[0].bpm ?? tempo);
      for (const item of stems) urls.current[item.id] = URL.createObjectURL(item.blob);
    }).catch(() => { if (active) setMessage(t('Saved Play-Along stems could not be read.')); });
    return () => {
      active = false;
      Object.values(urls.current).forEach(URL.revokeObjectURL);
      urls.current = {};
    };
  }, [songId, t, tempo]);

  useEffect(() => () => {
    for (const [id, timer] of Object.entries(saveTimers.current)) {
      window.clearTimeout(timer);
      const latest = tracksRef.current.find((track) => track.id === id);
      if (latest) void saveBuilderBacking(latest);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    pause: () => Object.values(audioRefs.current).forEach((audio) => audio?.pause()),
    getTempo: () => tracks.length ? syncTempo : undefined,
    getStems: () => tracksRef.current,
    isRightsConfirmed: () => rightsConfirmed,
    replaceStems: async (stems, tempo) => {
      if (stems.length && !rightsConfirmed) throw new Error(t('Confirm that you own or have permission to use these audio files.'));
      if (stems.length > MAX_STEMS) throw new Error(t('A Play-Along mix can contain up to {count} imported stems.', { count: MAX_STEMS }));
      const incomingBytes = stems.reduce((sum, stem) => sum + stem.blob.size, 0);
      if (stems.some((stem) => !stem.blob.type.startsWith('audio/') || stem.blob.size > MAX_TRACK_BYTES) || incomingBytes > MAX_TOTAL_BYTES) {
        throw new Error(t('This Play-Along package exceeds the supported audio size limits.'));
      }
      setBusy(true);
      let context: AudioContext | null = null;
      const next: BuilderBacking[] = [];
      try {
        if (typeof window.AudioContext !== 'function') throw new Error(t('Web Audio is not available in this browser.'));
        context = new AudioContext();
        for (const stem of stems) {
          setMessage(t('Preparing {name} locally…', { name: stem.name }));
          const buffer = await context.decodeAudioData(await stem.blob.arrayBuffer());
          if (stem.downbeat > buffer.duration) throw new Error(t('The first downbeat is outside the audio file for {name}.', { name: stem.name }));
          next.push({
            id: crypto.randomUUID(), songId, stemId: crypto.randomUUID(),
            name: stem.name.slice(0, 120), blob: stem.blob, duration: buffer.duration,
            peaks: audioPeaks(buffer.getChannelData(0)), downbeat: stem.downbeat,
            volume: stem.volume, bpm: stem.bpm ?? tempo, source: stem.source, rights: stem.rights,
          });
        }
        Object.values(audioRefs.current).forEach((audio) => audio?.pause());
        for (const [id, timer] of Object.entries(saveTimers.current)) {
          window.clearTimeout(timer);
          delete saveTimers.current[id];
        }
        const previousIds = tracksRef.current.map((track) => track.id);
        await replaceBuilderBackingFiles(previousIds, next);
        previousIds.forEach((id) => {
          URL.revokeObjectURL(urls.current[id]);
          delete urls.current[id];
          delete audioRefs.current[id];
          unlockedIds.current.delete(id);
        });
        next.forEach((track) => { urls.current[track.id] = URL.createObjectURL(track.blob); });
        tracksRef.current = next;
        setTracks(next);
        const nextTempo = tempo ?? next[0]?.bpm;
        if (nextTempo) setSyncTempo(nextTempo);
        setRightsConfirmed(false);
        setMessage(t('Imported full Play-Along package with {count} stems.', { count: next.length }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('Could not import this Play-Along package.'));
        throw error;
      } finally {
        await context?.close().catch(() => undefined);
        setBusy(false);
      }
    },
    sync: (milliseconds, rate = 1) => {
      for (const track of tracks) {
        const audio = audioRefs.current[track.id];
        if (!audio) continue;
        const target = milliseconds / 1_000 + track.downbeat;
        if (target < 0 || target >= track.duration) { audio.pause(); continue; }
        audio.volume = Math.max(0, Math.min(1, track.volume));
        audio.playbackRate = Math.max(0.25, Math.min(4, rate));
        if (Math.abs(audio.currentTime - target) > 0.18) audio.currentTime = target;
        if (audio.paused && unlockedIds.current.has(track.id)) {
          void audio.play().catch(() => {
            unlockedIds.current.delete(track.id);
            setMessage(t('Preview each imported stem once to enable synchronized playback.'));
          });
        } else if (audio.paused && !unlockNotice.current) {
          unlockNotice.current = true;
          setMessage(t('Preview each imported stem once to enable synchronized playback.'));
        }
      }
    },
  }), [rightsConfirmed, songId, syncTempo, t, tracks]);

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!rightsConfirmed) { setMessage(t('Confirm that you own or have permission to use these audio files.')); return; }
    const incoming = Array.from(files);
    if (tracks.length + incoming.length > MAX_STEMS) { setMessage(t('A Play-Along mix can contain up to {count} imported stems.', { count: MAX_STEMS })); return; }
    if (incoming.some((file) => !file.type.startsWith('audio/') || file.size > MAX_TRACK_BYTES)) {
      setMessage(t('Choose audio files up to 60 MB each.'));
      return;
    }
    if (totalBytes + incoming.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      setMessage(t('Keep the total size of this Play-Along mix under 120 MB.'));
      return;
    }
    setBusy(true);
    let context: AudioContext | null = null;
    const added: BuilderBacking[] = [];
    try {
      if (typeof window.AudioContext !== 'function') throw new Error(t('Web Audio is not available in this browser.'));
      context = new AudioContext();
      for (const file of incoming) {
        setMessage(t('Preparing {name} locally…', { name: file.name }));
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        const track: BuilderBacking = {
          id: crypto.randomUUID(), songId, stemId: crypto.randomUUID(), name: file.name.slice(0, 120),
          blob: file.slice(0, file.size, file.type), duration: buffer.duration, peaks: audioPeaks(buffer.getChannelData(0)),
          downbeat: 0, volume: 0.55, bpm: syncTempo, source: source.trim().slice(0, 180), rights: rights.trim().slice(0, 180),
        };
        await saveBuilderBacking(track, true);
        added.push(track);
      }
      for (const track of added) urls.current[track.id] = URL.createObjectURL(track.blob);
      const next = [...tracksRef.current, ...added];
      tracksRef.current = next;
      setTracks(next);
      setRightsConfirmed(false);
      setMessage(t('Imported {count} audio files. Audio and rights notes stay on this device.', { count: added.length }));
    } catch (error) {
      await Promise.all(added.map((track) => deleteBuilderBackingFile(track.id).catch(() => undefined)));
      added.forEach((track) => { URL.revokeObjectURL(urls.current[track.id]); delete urls.current[track.id]; });
      setMessage(error instanceof Error ? error.message : t('Could not import these audio files.'));
    } finally {
      await context?.close().catch(() => undefined);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const update = async (track: BuilderBacking, patch: Partial<BuilderBacking>) => {
    const next = { ...track, ...patch };
    const updated = tracksRef.current.map((item) => item.id === next.id ? next : item);
    tracksRef.current = updated;
    setTracks(updated);
    window.clearTimeout(saveTimers.current[next.id]);
    saveTimers.current[next.id] = window.setTimeout(() => {
      delete saveTimers.current[next.id];
      void saveBuilderBacking(next).catch(() => setMessage(t('Could not save stem settings.')));
    }, 250);
  };

  const updateTempo = async (value: number) => {
    const nextTempo = Math.max(40, Math.min(200, value || 40));
    setSyncTempo(nextTempo);
    const updated = tracksRef.current.map((track) => ({ ...track, bpm: nextTempo }));
    setTracks(updated);
    tracksRef.current = updated;
    try { await Promise.all(updated.map((track) => saveBuilderBacking(track))); }
    catch { setMessage(t('Could not save the shared stem tempo.')); }
  };

  const remove = async (track: BuilderBacking) => {
    audioRefs.current[track.id]?.pause();
    try {
      await deleteBuilderBackingFile(track.id);
      URL.revokeObjectURL(urls.current[track.id]);
      delete urls.current[track.id];
      unlockedIds.current.delete(track.id);
      const next = tracksRef.current.filter((item) => item.id !== track.id);
      tracksRef.current = next;
      setTracks(next);
      setMessage(t('Removed {name} from this device.', { name: track.name }));
    } catch { setMessage(t('Could not remove this stem.')); }
  };

  const totalBytes = tracks.reduce((sum, track) => sum + track.blob.size, 0);

  return <details className="playalong-stem-mixer song-tool-panel">
    <summary>{t('Imported audio stems')} · {tracks.length}/{MAX_STEMS}</summary>
    <p>{t('Add up to six aligned stems, such as bass, guitar, or a reference mix. The section form and tempo map control playback; each stem has its own downbeat and volume. Files stay on this device.')}</p>
    <p>{t('Source and rights notes are supplied by you and are not verified by Drum Hero.')}</p>
    <p>{t('{count} stems · {size} MiB stored locally.', { count: tracks.length, size: (totalBytes / 1_048_576).toFixed(2) })}</p>
    <label>{t('Shared stem sync tempo · BPM')}<input type="number" min={40} max={200} step={1} value={syncTempo} onChange={(event) => void updateTempo(Number(event.target.value))} /></label>
    <label>{t('Source or attribution')} <span>({t('optional')})</span><input maxLength={180} value={source} onChange={(event) => setSource(event.target.value)} placeholder={t('Creator, source URL, or recording name')} /></label>
    <label>{t('Rights or permission note')} <span>({t('optional')})</span><input maxLength={180} value={rights} onChange={(event) => setRights(event.target.value)} placeholder={t('License, personal recording, or permission details')} /></label>
    <label className="playalong-rights-consent"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} /> {t('I own or have permission to use the audio I import.')}</label>
    <div className="song-actions">
      <button type="button" disabled={busy || !rightsConfirmed || tracks.length >= MAX_STEMS} onClick={() => inputRef.current?.click()}>{busy ? t('Importing…') : t('Import audio stems')}</button>
      <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(event) => void importFiles(event.target.files)} />
    </div>
    {tracks.length > 0 && <ol className="playalong-stem-list">{tracks.map((track, index) => <li className="playalong-stem" key={track.id}>
      <h3>{index + 1}. {track.name}</h3>
      <p>{(track.blob.size / 1_048_576).toFixed(2)} MiB · {Math.round(track.duration)} {t('seconds')}{track.source ? ` · ${t('Source')}: ${track.source}` : ''}{track.rights ? ` · ${t('Rights')}: ${track.rights}` : ''}</p>
      <audio
        ref={(element) => { audioRefs.current[track.id] = element; }}
        src={urls.current[track.id]}
        controls
        preload="auto"
        aria-label={t('{name} audio preview', { name: track.name })}
        onPlay={() => { unlockedIds.current.add(track.id); unlockNotice.current = false; }}
      />
      <label>{t('Source or attribution')}<input maxLength={180} value={track.source ?? ''} onChange={(event) => void update(track, { source: event.target.value.slice(0, 180) })} /></label>
      <label>{t('Rights or permission note')}<input maxLength={180} value={track.rights ?? ''} onChange={(event) => void update(track, { rights: event.target.value.slice(0, 180) })} /></label>
      <label>{t('First downbeat in audio · seconds')}<input type="number" min={-30} max={track.duration} step={0.01} value={track.downbeat} onChange={(event) => void update(track, { downbeat: Math.max(-30, Math.min(track.duration, Number(event.target.value) || 0)) })} /></label>
      <label>{t('Stem volume · {volume}%', { volume: Math.round(track.volume * 100) })}<input type="range" min={0} max={1} step={0.01} value={track.volume} onChange={(event) => void update(track, { volume: Number(event.target.value) })} /></label>
      <div className="song-actions"><button type="button" onClick={() => saveOriginal(track)}>{t('Export original')}</button><button type="button" className="button-secondary" onClick={() => exportRightsNote(track)}>{t('Export rights note')}</button><button type="button" className="button-secondary" onClick={() => void remove(track)}>{t('Remove stem')}</button></div>
    </li>)}</ol>}
    <p role="status">{message}</p>
  </details>;
});
