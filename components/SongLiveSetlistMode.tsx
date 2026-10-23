"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { setlistEntries } from "@/lib/song-library-next";
import type { DrumSong, Setlist, SetlistRun, SetlistRunOutcome, SongLibraryState } from "@/lib/song-library";
import { SongLibraryNotation } from "./SongLibraryNotation";

const uid = () => crypto.randomUUID();
const outcomes: Array<{ id: SetlistRunOutcome; label: string }> = [
  { id: "solid", label: "Solid" }, { id: "wobbly", label: "Wobbly" }, { id: "retry", label: "Needs another run" }, { id: "skipped", label: "Skipped" }
];

export function SongLiveSetlistMode({ state, songs, setlist, save }: { state: SongLibraryState; songs: DrumSong[]; setlist: Setlist; save: (state: SongLibraryState | ((current: SongLibraryState) => SongLibraryState)) => void }) {
  const entries = useMemo(() => setlistEntries(setlist), [setlist]);
  const [open, setOpen] = useState(false);
  const [runId, setRunId] = useState("");
  const [index, setIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const timer = useRef<number | null>(null);
  const allRuns = state.rehearsalRuns ?? [];
  const run = allRuns.find(item => item.id === runId && item.setlistId === setlist.id) ?? [...allRuns].filter(item => item.setlistId === setlist.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const resumable = [...allRuns].filter(item => item.setlistId === setlist.id && !item.completedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const recentRuns = [...allRuns].filter(item => item.setlistId === setlist.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5);
  const runEntry = run?.entries[index];
  const savedSetlistEntry = runEntry ? entries.find(entry => entry.id === runEntry.id) : undefined;
  const chartEntry = runEntry ? { ...savedSetlistEntry, ...runEntry, bpm: runEntry.bpm ?? savedSetlistEntry?.bpm, countInBeats: runEntry.countInBeats ?? savedSetlistEntry?.countInBeats ?? 4, breakSeconds: runEntry.breakSeconds ?? savedSetlistEntry?.breakSeconds ?? 0, transitionNote: runEntry.transitionNote ?? savedSetlistEntry?.note, note: savedSetlistEntry?.note } : entries[index];
  const song = songs.find(item => item.id === chartEntry?.songId);
  const section = song?.sections.find(item => item.id === chartEntry?.sectionId);
  const part = section?.parts.find(item => item.id === chartEntry?.partId);
  const kitProfile = state.kitProfiles?.find(profile => profile.id === setlist.kitProfileId);
  const requiredVoices = [...new Set((song?.sections.filter(item => !chartEntry?.sectionId || item.id === chartEntry.sectionId) ?? []).flatMap(item => item.parts.filter(part => !chartEntry?.partId || part.id === chartEntry.partId).flatMap(part => part.hits.map(hit => hit.instrument))))];
  const missingKitVoices = kitProfile ? requiredVoices.filter(voice => !kitProfile.availableVoices.includes(voice)) : [];
  const nextEntry = run?.entries[index + 1];
  const nextSong = songs.find(item => item.id === nextEntry?.songId);
  const runSummary = run?.entries.reduce<Record<string, number>>((summary, entry) => { if (entry.outcome) summary[entry.outcome] = (summary[entry.outcome] ?? 0) + 1; return summary; }, {}) ?? {};

  useEffect(() => {
    if (!open || !dialog.current) return;
    const modal = dialog.current;
    modal.showModal();
    return () => { modal.close(); if (timer.current !== null) window.clearInterval(timer.current); timer.current = null; };
  }, [open]);
  useEffect(() => () => { if (timer.current !== null) window.clearInterval(timer.current); void audio.current?.close().catch(() => {}); }, []);

  const startRun = () => {
    if (!entries.length) { setMessage("Add a song entry before starting a live run."); return; }
    const next: SetlistRun = { id: uid(), setlistId: setlist.id, setlistName: setlist.name, startedAt: new Date().toISOString(), entries: entries.map(entry => ({ id: entry.id, songId: entry.songId, sectionId: entry.sectionId, partId: entry.partId, bpm: entry.bpm, repetitions: entry.repetitions, breakSeconds: entry.breakSeconds, countInBeats: entry.countInBeats, transitionNote: entry.note })) };
    save(current => ({ ...current, rehearsalRuns: [next, ...(current.rehearsalRuns ?? [])].slice(0, 500) })); setRunId(next.id); setIndex(0); setMessage(""); setOpen(true);
  };
  const resumeRun = () => { if (!resumable) return; setRunId(resumable.id); setIndex(Math.max(0, resumable.entries.findIndex(entry => !entry.outcome))); setMessage("Resumed the saved rehearsal run."); setOpen(true); };
  const close = () => { setOpen(false); setCountdown(null); if (timer.current !== null) window.clearInterval(timer.current); timer.current = null; };
  const startCountIn = async () => {
    if (!chartEntry || !song || timer.current !== null) return;
    const beats = Math.max(0, Math.min(16, Math.round(chartEntry.countInBeats ?? 0)));
    if (beats === 0) { setCountdown(0); setMessage("No count-in is set for this entry."); return; }
    const bpm = chartEntry.bpm ?? part?.bpm ?? section?.bpm ?? song.bpm;
    try {
      const context = audio.current ?? new AudioContext(); audio.current = context; await context.resume();
      let remaining = beats;
      const tick = () => {
        if (remaining === 0) { if (timer.current !== null) window.clearInterval(timer.current); timer.current = null; setCountdown(0); setMessage("Count-in complete. Play when ready."); return; }
        const at = context.currentTime, oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.frequency.value = remaining === beats ? 1100 : 760; gain.gain.value = 0.055;
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + 0.045);
        setCountdown(remaining); remaining -= 1;
      };
      timer.current = window.setInterval(tick, 60000 / bpm); tick();
    } catch { setMessage("Audio count-in is unavailable. Use the displayed tempo and count-in beats."); }
  };
  const mark = (outcome: SetlistRunOutcome) => {
    if (!run || !runEntry) return;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null; setCountdown(null);
    const completedAt = new Date().toISOString();
    const updatedEntries = run.entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, outcome, completedAt } : entry);
    const complete = updatedEntries.every(entry => entry.outcome);
    const updated = { ...run, entries: updatedEntries, completedAt: complete ? completedAt : undefined };
    save(current => ({ ...current, rehearsalRuns: (current.rehearsalRuns ?? []).map(item => item.id === run.id ? updated : item) }));
    if (!complete) setIndex(current => Math.min(updatedEntries.length - 1, current + 1));
    else setMessage("Run complete. Your setlist notes and outcomes are saved on this device.");
  };
  const updateNote = (value: string) => {
    if (!run || !runEntry) return;
    save(current => ({ ...current, rehearsalRuns: (current.rehearsalRuns ?? []).map(item => item.id === run.id ? { ...item, entries: item.entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, note: value.slice(0, 500) } : entry) } : item) }));
  };

  return <section className="song-live-setlist">
    <h4>Live setlist</h4>
    <p>Run this order from one stage view. Each entry keeps its section, part, tempo target, and count-in; mark the result as you go.</p>
    <div className="song-actions"><button type="button" disabled={!entries.length || !!resumable} onClick={startRun}>{resumable ? "Resume or finish the current run first" : "Start live run"}</button>{resumable && <button type="button" onClick={resumeRun}>Resume run from {new Date(resumable.startedAt).toLocaleString()}</button>}</div>
    {run && <p>Latest run: {Object.entries(runSummary).map(([key, count]) => count + " " + key).join(" · ") || "in progress"}{run.completedAt ? " · completed " + new Date(run.completedAt).toLocaleString() : " · unfinished"}</p>}
    {recentRuns.length > 0 && <details className="song-live-history"><summary>Recent rehearsal outcomes ({recentRuns.length})</summary><ol>{recentRuns.map(history => {
      const counts = history.entries.reduce<Record<string, number>>((result, entry) => { if (entry.outcome) result[entry.outcome] = (result[entry.outcome] ?? 0) + 1; return result; }, {});
      return <li key={history.id}><strong>{new Date(history.startedAt).toLocaleString()}</strong> · {Object.entries(counts).map(([outcome, count]) => count + " " + outcome).join(" · ") || "in progress"}{history.completedAt ? " · complete" : " · resumable"}{history.entries.filter(entry => entry.note).map(entry => <p key={entry.id}>{songs.find(item => item.id === entry.songId)?.title ?? "Song"}: {entry.note}</p>)}</li>;
    })}</ol></details>}
    {open && <dialog ref={dialog} className="song-live-setlist-dialog" aria-label={setlist.name + " live setlist"} onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => {
      if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, summary, [contenteditable='true']")) return;
      if (event.key === "ArrowRight" && run) { event.preventDefault(); setIndex(current => Math.min(run.entries.length - 1, current + 1)); }
      if (event.key === "ArrowLeft") { event.preventDefault(); setIndex(current => Math.max(0, current - 1)); }
      if (event.key === " " && event.target === dialog.current && countdown === null && (chartEntry?.countInBeats ?? 0) > 0) { event.preventDefault(); void startCountIn(); }
    }}>
      <header><div><span className="eyebrow">Live setlist · {setlist.name}</span><p>{run ? "Started " + new Date(run.startedAt).toLocaleTimeString() : "Ready"}</p></div><div className="song-actions"><button type="button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if (dialog.current?.requestFullscreen) void dialog.current.requestFullscreen().catch(() => setMessage("Fullscreen is unavailable on this device.")); else setMessage("Fullscreen is unavailable on this device."); }}>Toggle fullscreen</button><button type="button" onClick={close}>Close run</button></div></header>
      {run && !run.completedAt && runEntry && song ? <>
        <div className="song-live-current"><p>Entry {index + 1} of {run.entries.length}</p><h2>{song.title}</h2><p>{song.artist}{section ? " · " + section.name : " · Full arrangement"}{part ? " / " + part.name : ""}</p><div className="song-live-metrics"><strong>{chartEntry?.bpm ?? part?.bpm ?? section?.bpm ?? song.bpm}<small>BPM</small></strong><strong>{section?.meter ?? song.meter}<small>Meter</small></strong><strong>{chartEntry?.countInBeats ?? 4}<small>Count-in beats</small></strong></div></div>
        <div className="song-live-chart"><SongLibraryNotation key={`${song.id}:${section?.id ?? ""}:${part?.id ?? ""}`} song={song} sectionId={section?.id} partId={part?.id} reading /></div>
        {countdown !== null && <p className="song-live-countdown" role="status" aria-live="assertive">{countdown === 0 ? "GO" : countdown}</p>}
        <button className="song-live-count-in" type="button" onClick={() => void startCountIn()} disabled={timer.current !== null || !(chartEntry?.countInBeats ?? 0)}>{chartEntry?.countInBeats ? "Start " + chartEntry.countInBeats + "-beat count-in" : "No count-in for this entry"}</button>
        <div className="song-live-cues"><h3>Stage cues and notes</h3>{chartEntry?.note && <p><strong>Setlist note:</strong> {chartEntry.note}</p>}{song.notes && <p>{song.notes}</p>}{section?.notes && <p>{section.notes}</p>}{(section?.rehearsalCues ?? []).map(cue => <p key={cue.id}><strong>Bar {cue.measure}:</strong> {cue.text}</p>)}{state.notes.filter(note => note.songId === song.id && note.kind === "stage-cue" && (!section || !note.sectionId || note.sectionId === section.id)).map(note => <p key={note.id}><strong>Stage cue:</strong> {note.text}</p>)}{!chartEntry?.note && !song.notes && !section?.notes && !(section?.rehearsalCues?.length) && !state.notes.some(note => note.songId === song.id && note.kind === "stage-cue") && <p>No stage cues saved for this entry.</p>}</div>
        <div className="song-live-cues"><h3>Kit setup</h3>{kitProfile ? <><strong>{kitProfile.name} · {kitProfile.kitType} kit</strong>{kitProfile.tuning && <p>Tuning: {kitProfile.tuning}</p>}{kitProfile.cymbals && <p>Cymbals: {kitProfile.cymbals}</p>}{kitProfile.pedal && <p>Pedal: {kitProfile.pedal}</p>}{kitProfile.notes && <p>{kitProfile.notes}</p>}{requiredVoices.length > 0 && <p>Voices for this entry: {requiredVoices.join(", ")}{missingKitVoices.length > 0 ? " · check availability: " + missingKitVoices.join(", ") : ""}</p>}</> : <p>No kit profile is assigned to this setlist.</p>}</div>
        <label>Run note<textarea maxLength={500} value={runEntry.note ?? ""} onChange={event => updateNote(event.target.value)} placeholder="What should the band revisit?" /></label>
        {nextEntry && <p className="song-live-up-next"><strong>Up next:</strong> {nextSong?.title ?? "Unavailable song"}{nextEntry.sectionId ? " · " + (songs.find(item => item.id === nextEntry.songId)?.sections.find(item => item.id === nextEntry.sectionId)?.name ?? "Section") : ""} · {nextEntry.bpm ?? nextSong?.bpm ?? "—"} BPM · {nextEntry.breakSeconds ?? 0}s break{nextEntry.transitionNote ? " · " + nextEntry.transitionNote : ""}</p>}
        <nav aria-label="Setlist entry navigation" className="song-live-navigation"><button type="button" disabled={index === 0} onClick={() => setIndex(current => Math.max(0, current - 1))}>Previous entry</button><button type="button" disabled={index >= run.entries.length - 1} onClick={() => setIndex(current => Math.min(run.entries.length - 1, current + 1))}>Next entry</button></nav>
        <fieldset className="song-live-outcomes"><legend>Mark this entry</legend>{outcomes.map(item => <button type="button" key={item.id} onClick={() => mark(item.id)}>{item.label}</button>)}</fieldset>
        <ol className="song-live-run-list">{run.entries.map((entry, entryIndex) => <li key={entry.id} aria-current={entryIndex === index ? "step" : undefined}><button type="button" onClick={() => setIndex(entryIndex)}>{songs.find(item => item.id === entry.songId)?.title ?? "Unavailable song"} · {entry.outcome ?? "pending"}</button></li>)}</ol>
      </> : <div className="song-live-complete"><h2>Setlist run complete</h2><p>{Object.entries(runSummary).map(([key, count]) => count + " " + key).join(" · ")}</p>{run?.entries.filter(entry => entry.outcome === "wobbly" || entry.outcome === "retry").map(entry => <p key={entry.id}>{songs.find(item => item.id === entry.songId)?.title ?? "Song"}{entry.note ? ": " + entry.note : " needs another focused pass."}</p>)}</div>}
      <p role="status" aria-live="polite">{message}</p>
    </dialog>}
  </section>;
}
