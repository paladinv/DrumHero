"use client";
import { useEffect, useRef, useState } from 'react';
import type { DrumSong, SongNote } from '@/lib/song-library';
import { buildSongTimeline } from '@/lib/song-practice';
import { SongLibraryNotation } from './SongLibraryNotation';

export function SongPerformanceReader({ song, cues }: { song: DrumSong; cues: SongNote[] }) {
  const [open, setOpen] = useState(false), [scrolling, setScrolling] = useState(false), [speed, setSpeed] = useState(25);
  const [keepAwake, setKeepAwake] = useState(false), [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), content = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const modal = dialog.current, button = trigger.current;
    document.body.style.overflow = 'hidden'; modal?.showModal();
    return () => { modal?.close(); document.body.style.overflow = previousOverflow; button?.focus(); };
  }, [open]);
  useEffect(() => {
    if (!open || !scrolling) return;
    let previous = performance.now(), frame = 0, carry = 0;
    const tick = (now: number) => { const host = content.current; if (host) { carry += Math.min(100, now - previous) * speed / 1000; const pixels = Math.floor(carry); carry -= pixels; host.scrollTop += pixels; if (host.scrollTop >= host.scrollHeight - host.clientHeight - 1) { setScrolling(false); return; } } previous = now; frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [open, scrolling, speed]);
  useEffect(() => {
    if (!open || !keepAwake) return;
    let cancelled = false, lock: WakeLockSentinel | undefined, pending = false;
    const request = async () => {
      if (document.visibilityState !== 'visible' || pending || (lock && !lock.released)) return;
      if (!navigator.wakeLock) { setMessage('Screen wake lock is unavailable. Use your device display settings.'); return; }
      pending = true;
      try { const next = await navigator.wakeLock.request('screen'); if (cancelled) await next.release(); else { lock = next; setMessage('Keeping the screen awake while this view is visible.'); } } catch { if (!cancelled) setMessage('Could not keep the screen awake. Use your device display settings.'); } finally { pending = false; }
    };
    void request(); document.addEventListener('visibilitychange', request);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', request); void lock?.release().catch(() => {}); };
  }, [open, keepAwake]);
  const close = () => { setOpen(false); setScrolling(false); setKeepAwake(false); setMessage(''); };
  return <section className="song-tool-panel"><button ref={trigger} type="button" onClick={() => setOpen(true)}>Open performance reading view</button>{open && <dialog ref={dialog} className="song-performance-reader" aria-label={`${song.title} performance reading view`} onCancel={event => { event.preventDefault(); close(); }}><header><button autoFocus type="button" onClick={close}>Close reading view</button><button type="button" aria-pressed={scrolling} onClick={() => setScrolling(value => !value)}>{scrolling ? 'Pause scrolling' : 'Start scrolling'}</button><label>Scroll speed<input type="range" min={5} max={80} value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label><label><input type="checkbox" checked={keepAwake} onChange={event => { setKeepAwake(event.target.checked); setMessage(''); }} /> Keep screen awake</label><p role="status">{message}</p></header><div ref={content} className="song-performance-pages" tabIndex={0} onWheel={() => setScrolling(false)} onTouchStart={() => setScrolling(false)}><h1>{song.title}</h1><p>{song.artist} · {song.bpm} BPM · {song.meter}</p><p className="song-notation-scroll-hint">On a small screen, scroll each score horizontally to read every beat at full size.</p>{cues.filter(cue => !cue.sectionId).map(cue => <p className="performance-stage-cue" key={cue.id}>{cue.text}</p>)}{song.sections.map(section => {
    const timeline = buildSongTimeline(song, { sectionId: section.id });
    return <article key={section.id}><h2>{section.name}</h2>{section.marker && <strong>{section.marker}</strong>}<p>{section.notes}</p>{cues.filter(cue => cue.sectionId === section.id).map(cue => <p className="performance-stage-cue" key={cue.id}>{cue.text}</p>)}{Array.from({ length: Math.ceil(timeline.bars.length / 6) }, (_, page) => <SongLibraryNotation reading key={page} song={song} sectionId={section.id} barsOverride={timeline.bars.slice(page * 6, page * 6 + 6)} />)}</article>;
  })}</div></dialog>}</section>;
}
