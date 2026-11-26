"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DEFAULT_DRUM_MIX } from "@/lib/audio";
import { arrangementWav } from "@/lib/song-builder-export";
import { readSongShareHash } from "@/lib/song-builder-share";
import { buildArrangementBars, humanizeArrangementBars } from "@/lib/song-builder";
import { drawNotationPage, paginateNotation, DEFAULT_NOTATION_OPTIONS, type NotationView } from "@/lib/song-builder-notation";
import type { DrumSong } from "@/lib/song-library";

type ReviewNote = { id: string; measure: number; text: string; createdAt: string };

function shareReviewKey(song: DrumSong) {
  const source = `${song.title}|${song.artist}|${JSON.stringify(song.sections)}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `drum-hero-song-review-${(hash >>> 0).toString(36)}`;
}

export function SongBuilderSharePlayer() {
  const [song, setSong] = useState<DrumSong | null>(null);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [view, setView] = useState<NotationView>("tab");
  const [page, setPage] = useState(0);
  const [audioTime, setAudioTime] = useState(0);
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>([]);
  const [reviewMeasure, setReviewMeasure] = useState(1);
  const [reviewDraft, setReviewDraft] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bars = useMemo(() => song ? buildArrangementBars(song) : [], [song]);
  const pages = useMemo(() => paginateNotation(bars, DEFAULT_NOTATION_OPTIONS), [bars]);
  const position = useMemo(() => {
    let elapsed = 0;
    for (let index = 0; index < bars.length; index += 1) {
      const bar = bars[index]!;
      const duration = bar.beats * 60 / bar.bpm;
      if (audioTime < elapsed + duration || index === bars.length - 1) return { barIndex: index, fraction: Math.max(0, Math.min(1, (audioTime - elapsed) / duration)) };
      elapsed += duration;
    }
    return null;
  }, [audioTime, bars]);

  useEffect(() => {
    let active = true;
    void readSongShareHash(window.location.hash).then(value => { if (active) setSong(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not open this playback link."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!song) return;
    try {
      const stored = JSON.parse(localStorage.getItem(shareReviewKey(song)) ?? "[]");
      setReviewNotes(Array.isArray(stored) ? stored.filter((note): note is ReviewNote => Boolean(note && typeof note.id === "string" && Number.isInteger(note.measure) && typeof note.text === "string")) : []);
    } catch { setReviewNotes([]); }
  }, [song]);

  useEffect(() => {
    if (!followPlayhead || !position) return;
    const pageIndex = pages.findIndex(items => items.includes(bars[position.barIndex]!));
    if (pageIndex >= 0) setPage(pageIndex);
  }, [followPlayhead, position?.barIndex, pages, bars]);

  useEffect(() => {
    const target = canvasRef.current;
    if (!target || !song || !bars.length) return;
    const notation = drawNotationPage(song, bars, view, page, position, DEFAULT_NOTATION_OPTIONS);
    target.width = notation.width;
    target.height = notation.height;
    target.getContext("2d")?.drawImage(notation, 0, 0);
  }, [song, bars, view, page, position]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const prepareAudio = async () => {
    if (!song || !bars.length || rendering) return;
    setRendering(true);
    setError("");
    try {
      const performedBars = humanizeArrangementBars(bars, 0, 1729, 0);
      const blob = await arrangementWav(performedBars, 50, DEFAULT_DRUM_MIX, {}, { effects: song.effects });
      const nextUrl = URL.createObjectURL(blob);
      setAudioUrl(current => { if (current) URL.revokeObjectURL(current); return nextUrl; });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Audio preview could not be rendered.");
    } finally { setRendering(false); }
  };

  const saveReviewNotes = (next: ReviewNote[]) => {
    setReviewNotes(next);
    if (!song) return;
    try { localStorage.setItem(shareReviewKey(song), JSON.stringify(next)); }
    catch { setError("This browser could not save review notes. Copy the report before leaving this page."); }
  };

  const copyReviewReport = async () => {
    if (!song || !reviewNotes.length) return;
    const report = [`Review notes for ${song.title}`, ...reviewNotes.map(note => `Measure ${note.measure}: ${note.text}`)].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setError("Review notes copied. Paste them into a message to send them to the song owner.");
    } catch { setError("Clipboard access is unavailable. Select the review notes below and copy them manually."); }
  };

  if (error && !song) return <main className="page song-builder-share"><section className="card"><span className="eyebrow">Song Builder playback</span><h1>Playback link unavailable</h1><p role="alert">{error}</p><Link className="button-secondary" href="/song-builder">Open Song Builder</Link></section></main>;
  if (!song) return <main className="page song-builder-share"><section className="card" aria-live="polite"><span className="eyebrow">Song Builder playback</span><h1>Opening arrangement…</h1></section></main>;

  const totalSeconds = bars.reduce((sum, bar) => sum + bar.beats * 60 / bar.bpm, 0);
  const currentBar = position ? bars[position.barIndex] : undefined;
  return <main className="page song-builder-share">
    <header className="page-heading"><span className="eyebrow">Read-only playback</span><h1>{song.title}</h1><p>{song.artist} · {song.bpm} BPM · {song.meter}. Shared links include the arrangement and non-lyric rehearsal cues. Private notes, lyric cues, backing tracks, and custom audio samples stay on the owner’s device.</p><Link className="button-secondary" href="/song-builder">Create your own arrangement</Link></header>
    <section className="card song-builder-share-player" aria-label="Shared song playback">
      <div className="song-builder-section-heading"><div><span className="eyebrow">Arrangement score</span><h2>{bars.length} measures · {Math.floor(totalSeconds / 60)}:{String(Math.round(totalSeconds % 60)).padStart(2, "0")}</h2></div><strong>{currentBar ? `Measure ${currentBar.number} · ${currentBar.sectionName}` : "Ready"}</strong></div>
      <div className="song-builder-view-switch" role="group" aria-label="Shared notation view"><button type="button" aria-pressed={view === "tab"} onClick={() => setView("tab")}>Drum tab</button><button type="button" aria-pressed={view === "staff"} onClick={() => setView("staff")}>Percussion staff</button><label><input type="checkbox" checked={followPlayhead} onChange={event=>setFollowPlayhead(event.target.checked)}/>Follow score page</label></div>
      <div className="song-builder-share-score"><canvas ref={canvasRef} role="img" aria-label={`${song.title}, read-only ${view === "tab" ? "drum tab" : "percussion staff"}, page ${page + 1} of ${Math.max(1, pages.length)}${currentBar ? `, playing measure ${currentBar.number}` : ""}`} /></div>
      {pages.length > 1 && <nav className="song-builder-pages" aria-label="Score pages"><button type="button" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0}>Previous page</button><span>Page {page + 1} of {pages.length}</span><button type="button" onClick={() => setPage(value => Math.min(pages.length - 1, value + 1))} disabled={page === pages.length - 1}>Next page</button></nav>}
      <div className="song-builder-actions"><button type="button" onClick={() => void prepareAudio()} disabled={rendering || !bars.length}>{rendering ? "Preparing audio…" : audioUrl ? "Regenerate audio" : "Prepare built-in drum playback"}</button>{audioUrl && <button type="button" onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play(); } }}>Play from start</button>}</div>
      {audioUrl && <audio ref={audioRef} controls preload="metadata" src={audioUrl} onTimeUpdate={event => setAudioTime(event.currentTarget.currentTime)} onSeeking={event => setAudioTime(event.currentTarget.currentTime)} onEnded={() => setAudioTime(bars.reduce((sum, bar) => sum + bar.beats * 60 / bar.bpm, 0))} aria-label={`${song.title} drum playback`} />}
      <p role="status">{error || (audioUrl ? "Audio uses Drum Hero’s built-in kit. The measure cursor follows playback." : "Prepare audio to hear the arrangement with Drum Hero’s built-in drum kit.")}</p>
      <section className="song-builder-share-review" aria-label="Private arrangement review notes">
        <div><h2>Review notes</h2><p>Notes are saved in this browser and do not change the shared arrangement. Copy the report to send feedback to the song owner.</p></div>
        <div className="song-builder-tool-fields"><label>Measure<select value={reviewMeasure} onChange={event => setReviewMeasure(Number(event.target.value))}>{bars.map((bar, index) => <option key={`${bar.sectionId}-${bar.clipId}-${index}`} value={index + 1}>Measure {index + 1} · {bar.sectionName}</option>)}</select></label><button type="button" disabled={!currentBar} onClick={() => setReviewMeasure((position?.barIndex ?? 0) + 1)}>Use current measure</button><label>Feedback<textarea maxLength={500} rows={3} value={reviewDraft} onChange={event => setReviewDraft(event.target.value)} placeholder="Add a timing, transition, or notation note…" /></label><button type="button" disabled={!reviewDraft.trim()} onClick={() => { const text = reviewDraft.trim(); saveReviewNotes([...reviewNotes, { id: crypto.randomUUID(), measure: reviewMeasure, text, createdAt: new Date().toISOString() }]); setReviewDraft(""); }}>Add note</button><button type="button" disabled={!reviewNotes.length} onClick={() => void copyReviewReport()}>Copy review report</button></div>
        {reviewNotes.length > 0 && <ul>{reviewNotes.map(note => <li key={note.id}><strong>Measure {note.measure}</strong><span>{note.text}</span><button type="button" aria-label={`Remove review note for measure ${note.measure}`} onClick={() => saveReviewNotes(reviewNotes.filter(item => item.id !== note.id))}>Remove</button></li>)}</ul>}
      </section>
    </section>
  </main>;
}
