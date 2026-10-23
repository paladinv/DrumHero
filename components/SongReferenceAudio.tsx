"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteTake, loadTake, saveTake } from "@/lib/song-recording";
import { analyzeReferenceAudio, type ReferenceAnalysis } from "@/lib/song-reference-analysis";
import type { DrumSong, SongLibraryState, SongReferenceTrack } from "@/lib/song-library";

const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;
const extension = (mime: string) => mime.includes("wav") ? "wav" : mime.includes("mp4") ? "m4a" : (mime.includes("mpeg") || mime.includes("mp3")) ? "mp3" : "audio";
export function SongReferenceAudio({ song, state, save, currentSectionId }: { song: DrumSong; state: SongLibraryState; save: (state: SongLibraryState | ((current: SongLibraryState) => SongLibraryState)) => void; currentSectionId?: string }) {
  const tracks = useMemo(() => (state.referenceTracks ?? []).filter(track => track.songId === song.id), [state.referenceTracks, song.id]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  const [analyses, setAnalyses] = useState<Record<string, ReferenceAnalysis>>({});
  const [playheads, setPlayheads] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [waveformBusy, setWaveformBusy] = useState("");
  const [analysisBusy, setAnalysisBusy] = useState("");
  const timers = useRef(new Map<string, number>());
  const started = useRef(new Set<string>());
  const previousMute = useRef(new Map<string, boolean>());
  const trackIdsJSON = JSON.stringify(tracks.map(track => track.id));
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const trackIds = JSON.parse(trackIdsJSON) as string[];
    void Promise.all(trackIds.map(async id => {
      try {
        const blob = await loadTake(id);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        if (cancelled) { URL.revokeObjectURL(url); return null; }
        created.push(url);
        return [id, url] as const;
      } catch { return null; }
    })).then(items => { if (!cancelled) setUrls(Object.fromEntries(items.filter((item): item is readonly [string, string] => !!item))); });
    return () => { cancelled = true; created.forEach(url => URL.revokeObjectURL(url)); };
  }, [trackIdsJSON]);
  useEffect(() => {
    const control = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; songId?: string; sectionId?: string; delayMs?: number; offsetMs?: number }>).detail;
      if (detail?.songId !== song.id) return;
      const track = tracks.find(item => item.sectionId === detail.sectionId) ?? tracks.find(item => !item.sectionId);
      if (!track) return;
      const player = document.getElementById(`reference-player-${track.id}`) as HTMLAudioElement | null;
      if (!player) { setMessage("The selected reference audio file is unavailable on this device."); return; }
      const prior = timers.current.get(track.id);
      if (prior) window.clearTimeout(prior);
      timers.current.delete(track.id);
      const position = () => Math.min(track.durationMs, track.sectionStartMs + Math.max(0, detail.offsetMs ?? 0)) / 1000;
      const prime = () => {
        if (!previousMute.current.has(track.id)) previousMute.current.set(track.id, player.muted);
        // Begin silently while the user gesture is active, then seek and unmute at the count-in boundary.
        player.muted = true;
        if (player.paused) {
          void player.play().then(() => { started.current.add(track.id); }).catch(() => setMessage("Reference audio could not start. Press play on its audio control to allow playback."));
        }
      };
      const play = (seek: boolean) => {
        if (seek) player.currentTime = position();
        const muted = previousMute.current.get(track.id);
        if (muted !== undefined) player.muted = muted;
        void player.play().then(() => { started.current.add(track.id); }).catch(() => setMessage("Reference audio could not start. Press play on its audio control to allow playback."));
      };
      if (detail.action === "prime") prime();
      else if (detail.action === "start") {
        if (!started.current.has(track.id) && player.paused) prime();
        const delay = Math.max(0, Math.min(30000, detail.delayMs ?? 0));
        if (delay) timers.current.set(track.id, window.setTimeout(() => { timers.current.delete(track.id); play(true); }, delay));
        else play(true);
      } else if (detail.action === "pause") player.pause();
      else if (detail.action === "resume") {
        const delay = Math.max(0, Math.min(30000, detail.delayMs ?? 0));
        if (delay) {
          prime();
          timers.current.set(track.id, window.setTimeout(() => { timers.current.delete(track.id); play(true); }, delay));
        } else play(!started.current.has(track.id));
      } else if (detail.action === "stop") {
        player.pause();
        player.currentTime = track.sectionStartMs / 1000;
        const muted = previousMute.current.get(track.id);
        if (muted !== undefined) { player.muted = muted; previousMute.current.delete(track.id); }
        started.current.delete(track.id);
      }
    };
    window.addEventListener("drum-hero:song-reference-control", control);
    return () => { window.removeEventListener("drum-hero:song-reference-control", control); timers.current.forEach(timer => window.clearTimeout(timer)); timers.current.clear(); };
  }, [song.id, tracks, urls]);
  const attach = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) { setMessage("Choose an audio file. Video and project files are not stored as reference tracks."); return; }
    if (file.size > MAX_REFERENCE_BYTES) { setMessage("Reference audio is limited to 50 MiB per track."); return; }
    if (tracks.length >= 20) { setMessage("This song already has 20 reference tracks. Export or delete one before adding another."); return; }
    if ((state.referenceTracks ?? []).length >= 100) { setMessage("The library reference-audio limit is 100 tracks. Export or delete a track before adding another."); return; }
    setBusy(true);
    let temporaryUrl = "";
    try {
      temporaryUrl = URL.createObjectURL(file);
      const probe = document.createElement("audio");
      probe.preload = "metadata";
      const durationMs = await new Promise<number>((resolve, reject) => {
        probe.onloadedmetadata = () => Number.isFinite(probe.duration) && probe.duration > 0 ? resolve(Math.round(probe.duration * 1000)) : reject(new Error("This audio file has no readable duration."));
        probe.onerror = () => reject(new Error("This browser could not read the audio file."));
        probe.src = temporaryUrl;
      });
      probe.pause();
      probe.removeAttribute("src");
      probe.load();
      if (durationMs > 30 * 60 * 1000) throw new Error("Reference tracks can be up to 30 minutes long.");
      const id = `reference-${crypto.randomUUID()}`;
      await saveTake(id, file);
      const track: SongReferenceTrack = { id, songId: song.id, sectionId: currentSectionId, name: file.name.slice(0, 120) || "Reference audio", createdAt: new Date().toISOString(), durationMs, mimeType: file.type, sectionStartMs: 0 };
      save(current => ({ ...current, referenceTracks: [...(current.referenceTracks ?? []), track].slice(-100) }));
      setMessage("Reference audio saved on this device. It is excluded from account sync and library sharing.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reference audio could not be saved."); }
    finally { if (temporaryUrl) URL.revokeObjectURL(temporaryUrl); setBusy(false); }
  };
  const update = (track: SongReferenceTrack, change: Partial<SongReferenceTrack>) => save(current => ({ ...current, referenceTracks: (current.referenceTracks ?? []).map(item => item.id === track.id ? { ...item, ...change } : item) }));
  const analyze = async (track: SongReferenceTrack) => {
    setAnalysisBusy(track.id); setMessage("");
    let context: AudioContext | undefined;
    try {
      const blob = await loadTake(track.id);
      if (!blob) throw new Error("Reference audio is unavailable on this device.");
      if (blob.size > 20 * 1024 * 1024 || track.durationMs > 10 * 60 * 1000) throw new Error("Tempo analysis is limited to audio under 20 MiB and 10 minutes.");
      context = new AudioContext();
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const section = song.sections.find(item => item.id === track.sectionId);
      const result = analyzeReferenceAudio(buffer, section?.bpm ?? song.bpm, section?.meter ?? song.meter);
      if (!result) throw new Error("No steady beat was clear enough to estimate. Try a shorter section with fewer cymbal washes or long rests.");
      setAnalyses(current => ({ ...current, [track.id]: result }));
      setMessage("Tempo and downbeat suggestions are ready. They are estimates from local audio; check them by listening or tapping along.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not analyze the reference audio in this browser."); }
    finally { if (context && context.state !== "closed") void context.close().catch(() => {}); setAnalysisBusy(""); }
  };
  const applySuggestedTempo = (track: SongReferenceTrack, bpm: number) => {
    if (song.arrangementLocked) { setMessage("Unlock the approved arrangement before applying a detected tempo."); return; }
    const sectionId = track.sectionId;
    save(current => ({ ...current, songs: current.songs.map(item => item.id !== song.id ? item : {
      ...item,
      bpm: sectionId ? item.bpm : bpm,
      sections: item.sections.map(section => !sectionId || section.id !== sectionId ? section : { ...section, bpm }),
      updatedAt: new Date().toISOString(),
    }) }));
    setMessage(`Applied ${bpm} BPM ${sectionId ? "to this section" : "to the song"}.`);
  };
  const makeWaveform = async (track: SongReferenceTrack) => {
    if (waveforms[track.id]) return;
    setWaveformBusy(track.id); setMessage("");
    let context: AudioContext | undefined;
    try {
      const blob = await loadTake(track.id);
      if (!blob) throw new Error("Reference audio is unavailable on this device.");
      if (blob.size > 20 * 1024 * 1024 || track.durationMs > 10 * 60 * 1000) throw new Error("Waveform preview is limited to audio under 20 MiB and 10 minutes. Use the audio controls to seek this file.");
      context = new AudioContext();
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const columns = 640, peaks = Array.from({ length: columns }, (_, index) => {
        const start = Math.floor(index * buffer.length / columns), end = Math.max(start + 1, Math.floor((index + 1) * buffer.length / columns));
        let peak = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const samples = buffer.getChannelData(channel);
          for (let sample = start; sample < Math.min(end, buffer.length); sample++) peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
        }
        return Math.max(0.035, Math.min(1, peak));
      });
      setWaveforms(current => ({ ...current, [track.id]: peaks }));
      setMessage("Waveform ready. Use the slider to seek, then mark this section’s downbeat or loop end at the playhead.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not decode the waveform in this browser."); }
    finally { if (context && context.state !== "closed") void context.close().catch(() => {}); setWaveformBusy(""); }
  };
  const remove = async (track: SongReferenceTrack) => {
    try {
      await deleteTake(track.id);
      save(current => ({ ...current, referenceTracks: (current.referenceTracks ?? []).filter(item => item.id !== track.id) }));
      setMessage("Reference audio and its local file were deleted.");
    } catch { setMessage("Could not delete the reference audio. Try again after closing its player."); }
  };
  return <details className="song-tool-panel song-reference-audio"><summary>Local reference audio ({tracks.length})</summary>
    <p>Add audio you own or have permission to use. The file stays on this device; sync and library sharing exclude it. In Practice, choose a section and start the scored player to begin reference playback after the same count-in. Pause, resume, and reset follow the scored player. Reference audio does not affect practice scores.</p>
    <label>Add an audio reference<input type="file" accept="audio/*" disabled={busy || tracks.length >= 20 || (state.referenceTracks ?? []).length >= 100} onChange={event => { void attach(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
    {busy && <p role="status">Reading and saving audio…</p>}
    <button type="button" disabled={!tracks.length} onClick={() => { void Promise.all(tracks.map(track => loadTake(track.id))).then(blobs => setMessage(`${(blobs.reduce((sum, blob) => sum + (blob?.size ?? 0), 0) / 1048576).toFixed(2)} MiB of reference audio on this device · ${blobs.filter(blob => !blob).length} unavailable file(s).`)).catch(() => setMessage("Reference-audio storage could not be read.")); }}>Check reference storage</button>
    {tracks.map(track => <article className="song-reference-track" key={track.id}>
      <h4>{track.name}</h4>{urls[track.id] ? <audio id={`reference-player-${track.id}`} controls preload="metadata" src={urls[track.id]} onLoadedMetadata={event=>{event.currentTarget.preservesPitch=true;event.currentTarget.playbackRate=track.playbackRate??1;}} onTimeUpdate={event => { const time = event.currentTarget.currentTime; setPlayheads(current => current[track.id] === time ? current : { ...current, [track.id]: time }); if (!track.loopSection) return; const end = (track.sectionEndMs ?? track.durationMs) / 1000; if (end > track.sectionStartMs / 1000 && time >= end) event.currentTarget.currentTime = track.sectionStartMs / 1000; }} /> : <p role="status">Audio file is unavailable on this device. Song Library JSON stores reference metadata; a full-device backup can include its local audio file.</p>}
      {urls[track.id] && <label>Reference speed (pitch preserved)<select value={track.playbackRate??1} onChange={event=>{const playbackRate=Math.max(.5,Math.min(1.25,Number(event.target.value)||1));update(track,{playbackRate});const player=document.getElementById(`reference-player-${track.id}`) as HTMLAudioElement|null;if(player){player.preservesPitch=true;player.playbackRate=playbackRate;}}}>{[.5,.6,.7,.8,.9,1,1.1,1.2,1.25].map(rate=><option key={rate} value={rate}>{rate.toFixed(rate%1===0?1:2)}×</option>)}</select></label>}
      {urls[track.id] && <div className="song-reference-waveform"><div className="song-actions"><button type="button" disabled={waveformBusy === track.id} onClick={() => void makeWaveform(track)}>{waveformBusy === track.id ? "Building waveform…" : waveforms[track.id] ? "Waveform ready" : "Build waveform for alignment"}</button><button type="button" disabled={analysisBusy === track.id} onClick={() => void analyze(track)}>{analysisBusy === track.id ? "Analyzing local audio…" : "Estimate tempo and downbeat"}</button></div>{analyses[track.id] && <div className="song-audio-analysis"><p>Suggested {analyses[track.id].bpm} BPM · tempo confidence {analyses[track.id].tempoConfidence}% · first downbeat at {(analyses[track.id].downbeatMs / 1000).toFixed(2)} s · downbeat confidence {analyses[track.id].downbeatConfidence}%.</p><p>Beat detection can be confused by half-time/double-time feels, cymbal wash, and pickup bars. Verify before applying.</p><div className="song-actions"><button type="button" onClick={() => { const start = Math.max(0, Math.min(track.durationMs, analyses[track.id].downbeatMs)); update(track, { sectionStartMs: start, sectionEndMs: track.sectionEndMs !== undefined && track.sectionEndMs < start ? undefined : track.sectionEndMs }); setMessage("Suggested downbeat applied to this reference section."); }}>Use suggested downbeat</button><button type="button" disabled={song.arrangementLocked} onClick={() => applySuggestedTempo(track, analyses[track.id].bpm)}>Use suggested tempo</button></div>{song.arrangementLocked && <small>Unlock the approved arrangement to apply tempo; downbeat alignment can still be changed.</small>}</div>}{waveforms[track.id] && <><svg viewBox={`0 0 ${waveforms[track.id].length} 48`} role="img" aria-label={`${track.name} waveform with downbeat and loop markers`} preserveAspectRatio="none">{waveforms[track.id].map((peak,index) => <rect key={index} x={index} y={(48-peak*42)/2} width="0.9" height={peak*42} rx="0.25" fill={index/waveforms[track.id].length*track.durationMs>=track.sectionStartMs&&(track.sectionEndMs===undefined||index/waveforms[track.id].length*track.durationMs<=track.sectionEndMs)?"var(--theme-chart-success, #287653)":"var(--theme-chart-muted, #aab8ae)"}/>)}<line x1={track.sectionStartMs/track.durationMs*waveforms[track.id].length} x2={track.sectionStartMs/track.durationMs*waveforms[track.id].length} y1="0" y2="48" stroke="var(--theme-chart-success-strong, #0b5034)" strokeWidth="2"/><line x1={(track.sectionEndMs??track.durationMs)/track.durationMs*waveforms[track.id].length} x2={(track.sectionEndMs??track.durationMs)/track.durationMs*waveforms[track.id].length} y1="0" y2="48" stroke="var(--theme-chart-warning, #995500)" strokeWidth="2"/><line x1={(playheads[track.id]??0)*1000/track.durationMs*waveforms[track.id].length} x2={(playheads[track.id]??0)*1000/track.durationMs*waveforms[track.id].length} y1="0" y2="48" stroke="var(--theme-chart-info, #1258a5)" strokeWidth="2"/></svg><label>Seek reference audio<input type="range" min="0" max={track.durationMs} step="50" value={Math.round((playheads[track.id]??0)*1000)} aria-label={`Seek ${track.name}`} onChange={event=>{const time=Number(event.target.value)/1000;setPlayheads(current=>({...current,[track.id]:time}));const player=document.getElementById(`reference-player-${track.id}`) as HTMLAudioElement|null;if(player)player.currentTime=time;}}/></label><p>Blue: playhead · green: section downbeat · amber: loop end · {(playheads[track.id]??0).toFixed(2)} / {(track.durationMs/1000).toFixed(2)} seconds</p><div className="song-actions"><button type="button" onClick={()=>{const start=Math.max(0,Math.min(track.durationMs,Math.round((playheads[track.id]??0)*1000)));update(track,{sectionStartMs:start,sectionEndMs:track.sectionEndMs!==undefined&&track.sectionEndMs<start?undefined:track.sectionEndMs});setMessage("Section downbeat moved to the playhead.");}}>Set downbeat at playhead</button><button type="button" disabled={(playheads[track.id]??0)*1000<=track.sectionStartMs} onClick={()=>{const end=Math.max(track.sectionStartMs,Math.min(track.durationMs,Math.round((playheads[track.id]??0)*1000)));update(track,{sectionEndMs:end});setMessage("Loop end moved to the playhead.");}}>Set loop end at playhead</button></div></>}</div>}
      <label>Section<select value={track.sectionId ?? ""} onChange={event => update(track, { sectionId: event.target.value || undefined })}><option value="">Whole song</option>{song.sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
      <label>Audio time for this section’s first downbeat (seconds)<input type="number" min={0} max={Math.max(0, track.durationMs / 1000)} step={0.05} value={(track.sectionStartMs / 1000).toFixed(2)} onChange={event => { const sectionStartMs = Math.max(0, Math.min(track.durationMs, Math.round((Number(event.target.value) || 0) * 1000))); update(track, { sectionStartMs, sectionEndMs: track.sectionEndMs === undefined ? undefined : Math.max(sectionStartMs, track.sectionEndMs) }); }} /></label><label>Section loop end time (seconds)<input type="number" min={track.sectionStartMs / 1000} max={Math.max(0, track.durationMs / 1000)} step={0.05} value={((track.sectionEndMs ?? track.durationMs) / 1000).toFixed(2)} onChange={event => update(track, { sectionEndMs: Math.max(track.sectionStartMs, Math.min(track.durationMs, Math.round((Number(event.target.value) || 0) * 1000))) })} /></label><label><input type="checkbox" checked={track.loopSection === true} onChange={event => update(track, { loopSection: event.target.checked })} /> Loop this audio section</label>
      <p>Set the start and end of the selected section. “Play from section downbeat” uses these offsets; turn on looping to repeat this segment while you practice.</p>
      {urls[track.id] && <><button type="button" onClick={() => { const player = document.getElementById(`reference-player-${track.id}`) as HTMLAudioElement | null; if (player) { player.currentTime = track.sectionStartMs / 1000; void player.play(); } }}>Play from section downbeat</button><a href={urls[track.id]} download={`${song.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-reference.${extension(track.mimeType)}`}>Export reference audio</a></>}
      <button type="button" onClick={() => { if (window.confirm("Delete this local reference audio and its file?")) void remove(track); }}>Delete reference audio</button>
    </article>)}
    <p role="status" aria-live="polite">{message}</p>
  </details>;
}
