"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { DrumPart } from "@/lib/song-library";
import type { TempoAnchor } from "@/lib/song-builder-tools";
import type { ArrangementBar } from "@/lib/song-builder";
import { mappedSeconds } from "@/lib/song-builder-tools";
import { deleteBuilderBackingFile, readBuilderBackings, saveBuilderBacking, type BuilderBacking } from "@/lib/song-builder-storage";
import { analyzeBackingAudio, backingSuggestionsForArrangement, backingSuggestionsForPart, type ArrangementHitSuggestion, type BackingAudioAnalysis } from "@/lib/song-builder-audio-analysis";
import { useLocalization } from "./LocalizationProvider";

export type BackingTrackHandle = {
  sync: (milliseconds: number, rate?: number) => void;
  pause: () => void;
  getTempo: () => number | undefined;
};

type Props = {
  songId: string;
  targetPart: DrumPart | null;
  bars: ArrangementBar[];
  anchors: TempoAnchor[];
  onApplyTempo: (bpm: number) => void;
  onApplyHits: (hits: DrumPart["hits"]) => void;
  onApplyArrangementHits: (groups: ArrangementHitSuggestion[]) => void;
  onAnchorsChange: (anchors: TempoAnchor[]) => void;
  songBpm: number;
};

const candidateKey = (hit: BackingAudioAnalysis["hits"][number]) => `${hit.timeSeconds.toFixed(3)}:${hit.voice}`;

export const SongBuilderBackingTrack = forwardRef<BackingTrackHandle, Props>(function SongBuilderBackingTrack(
  { songId, targetPart, bars, anchors, onApplyTempo, onApplyHits, onApplyArrangementHits, onAnchorsChange, songBpm },
  ref,
) {
  const { t } = useLocalization();
  const [track, setTrack] = useState<BuilderBacking | null>(null);
  const [tracks, setTracks] = useState<BuilderBacking[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<BackingAudioAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const secondaryAudioRefs = useRef(new Map<string, HTMLAudioElement>());
  const unlockedTrackIds = useRef(new Set<string>());
  const playPendingTrackIds = useRef(new Set<string>());
  const unlockNotices = useRef(new Set<string>());
  const createdUrls = useRef(new Set<string>());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadRequest = useRef(0);
  const dragRef = useRef<{ pointerId: number; kind: "downbeat" | "anchor"; beat?: number } | null>(null);
  const [anchorMeasure, setAnchorMeasure] = useState(1);
  const [themeRevision, setThemeRevision] = useState(0);
  const [showBeatGrid,setShowBeatGrid]=useState(true);
  const [selectedSuggestionBars, setSelectedSuggestionBars] = useState<number[]>([]);
  const [confidenceFloor, setConfidenceFloor] = useState(45);
  const [excludedCandidates, setExcludedCandidates] = useState<string[]>([]);
  const [candidateVoiceOverrides, setCandidateVoiceOverrides] = useState<Record<string, BackingAudioAnalysis["hits"][number]["voice"]>>({});

  useEffect(() => {
    let active = true;
    let objectUrls: Record<string, string> = {};
    const objectUrlRegistry = createdUrls.current;
    loadRequest.current += 1;
    void readBuilderBackings(songId).then((values) => {
      if (!active) return;
      objectUrls = Object.fromEntries(values.map(value => [value.id, URL.createObjectURL(value.blob)]));
      Object.values(objectUrls).forEach(value => createdUrls.current.add(value));
      setTracks(values);
      setTrack(values.find(value => value.stemId === "main" || value.id === songId) ?? values[0] ?? null);
      setUrls(objectUrls);
    }).catch(() => {
      if (!active) return;
      setTrack(null);
      setTracks([]);
      setUrls({});
      setMessage(t("Backing audio storage is unavailable in this browser."));
    });
    return () => {
      active = false;
      objectUrlRegistry.forEach(URL.revokeObjectURL);
      objectUrlRegistry.clear();
    };
  }, [songId, t]);

  const url = track ? urls[track.id] ?? "" : "";

  useEffect(() => {
    const redrawForTheme = () => setThemeRevision((revision) => revision + 1);
    window.addEventListener("drum-hero:theme-change", redrawForTheme);
    return () => window.removeEventListener("drum-hero:theme-change", redrawForTheme);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const colors = getComputedStyle(document.documentElement);
    context.fillStyle = colors.getPropertyValue("--theme-wave-bg").trim() || "#dfd8cd";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = colors.getPropertyValue("--theme-wave-peak").trim() || "#454f48";
    track?.peaks.forEach((peak, index) => {
      const x = index / track.peaks.length * canvas.width;
      const height = Math.max(1, peak * (canvas.height - 10));
      context.fillRect(x, (canvas.height - height) / 2, Math.max(1, canvas.width / track.peaks.length), height);
    });
    if (track) {
      if(showBeatGrid){
        const gridColor=colors.getPropertyValue("--theme-wave-grid").trim()||"rgba(42,72,91,.42)";
        const beatSeconds=(beat:number)=>anchors.length>=2?mappedSeconds(beat,anchors,songBpm):beat*60/(track.bpm??songBpm);
        bars.forEach(bar=>{
          const startBeat=bar.arrangementBeatStart??0;
          for(let localBeat=0;localBeat<bar.beats-0.0001;localBeat+=1){
            const markerX=(track.downbeat+beatSeconds(startBeat+localBeat))/track.duration*canvas.width;
            if(markerX<0||markerX>canvas.width)continue;
            context.strokeStyle=gridColor;context.lineWidth=localBeat===0?1.5:1;context.beginPath();context.moveTo(markerX,18);context.lineTo(markerX,canvas.height-3);context.stroke();
          }
        });
      }
      const x = track.downbeat / track.duration * canvas.width;
      context.strokeStyle = colors.getPropertyValue("--theme-wave-downbeat").trim() || "#e85348";
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
      anchors.forEach(anchor=>{const markerX=(track.downbeat+anchor.seconds)/track.duration*canvas.width;if(markerX<0||markerX>canvas.width)return;context.strokeStyle=colors.getPropertyValue("--theme-wave-marker").trim()||"#397db8";context.beginPath();context.moveTo(markerX,0);context.lineTo(markerX,canvas.height);context.stroke();context.fillStyle=colors.getPropertyValue("--theme-wave-label").trim()||"#235d8f";context.font="12px sans-serif";context.fillText(`M${Math.max(1,bars.findIndex(bar=>Math.abs((bar.arrangementBeatStart ?? 0)-anchor.beat)<0.001)+1)}`,Math.min(canvas.width-32,markerX+3),14);});
    }
  }, [track,anchors,bars,showBeatGrid,songBpm,themeRevision]);

  const canvasSecondsAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds=event.currentTarget.getBoundingClientRect();
    return Math.max(0,Math.min(1,(event.clientX-bounds.left)/Math.max(1,bounds.width)))*(track?.duration??0);
  };
  const beginWaveDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if(!track)return;
    const seconds=canvasSecondsAt(event),x=seconds/track.duration*event.currentTarget.width;
    const downbeatX=track.downbeat/track.duration*event.currentTarget.width;
    const nearest=anchors.map(anchor=>({beat:anchor.beat,x:(track.downbeat+anchor.seconds)/track.duration*event.currentTarget.width})).filter(marker=>marker.x>=0&&marker.x<=event.currentTarget.width).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];
    const kind=Math.abs(downbeatX-x)<12?"downbeat":nearest&&Math.abs(nearest.x-x)<12?"anchor":undefined;
    if(kind){dragRef.current={pointerId:event.pointerId,kind,...(kind==="anchor"?{beat:nearest?.beat}: {})};event.currentTarget.setPointerCapture(event.pointerId);return;}
    const beat=anchorMeasure<=1?0:bars.slice(0,Math.min(bars.length,anchorMeasure-1)).reduce((sum,bar)=>sum+bar.beats,0);
    const anchorSeconds=seconds-track.downbeat;
    if(anchorSeconds<0){setMessage(t("Choose a point after the first downbeat for this tempo marker."));return;}
    const next=[...anchors.filter(anchor=>Math.abs(anchor.beat-beat)>0.001),{beat,seconds:anchorSeconds}].sort((a,b)=>a.beat-b.beat);
    onAnchorsChange(next);
    setMessage(t("Tempo marker placed. Check that its tempo interval stays between 40 and 200 BPM."));
  };
  const moveWaveDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag=dragRef.current;if(!track||!drag||drag.pointerId!==event.pointerId)return;
    const seconds=canvasSecondsAt(event);
    if(drag.kind==="downbeat")setTrack({...track,downbeat:Math.max(-30,Math.min(track.duration,seconds))});
    else if(drag.beat!==undefined){const anchorSeconds=seconds-track.downbeat;onAnchorsChange([...anchors.filter(anchor=>Math.abs(anchor.beat-drag.beat!)>0.001),{beat:drag.beat,seconds:Math.max(0,anchorSeconds)}].sort((a,b)=>a.beat-b.beat));}
  };
  const endWaveDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;
    if(drag.kind==="downbeat"&&track)void change(track);
    dragRef.current=null;
  };

  useEffect(() => {
    unlockedTrackIds.current.clear();
    playPendingTrackIds.current.clear();
    unlockNotices.current.clear();
  }, [songId]);

  useImperativeHandle(ref, () => ({
    pause: () => { audioRef.current?.pause(); secondaryAudioRefs.current.forEach(audio => audio.pause()); },
    getTempo: () => track?.bpm ?? analysis?.bpm,
    sync: (milliseconds, rate = 1) => {
      const audibleTracks = tracks.filter(item => !item.muted), hasSolo = audibleTracks.some(item => item.solo);
      for (const item of tracks) {
        const audio = item.id === track?.id ? audioRef.current : secondaryAudioRefs.current.get(item.id);
        if (!audio) continue;
        if (item.muted || (hasSolo && !item.solo)) { audio.pause(); continue; }
        const target = milliseconds / 1000 + item.downbeat;
        if (target < 0 || target >= item.duration) { audio.pause(); continue; }
        audio.volume = Math.max(0, Math.min(1, item.volume));
        audio.preservesPitch = item.preservePitch !== false;
        audio.playbackRate = Math.max(0.25, Math.min(4, rate));
        if (Math.abs(audio.currentTime - target) > 0.18) audio.currentTime = target;
        if (audio.paused && !playPendingTrackIds.current.has(item.id) && unlockedTrackIds.current.has(item.id)) {
          playPendingTrackIds.current.add(item.id);
          void audio.play().catch(() => {
            unlockedTrackIds.current.delete(item.id);
            setMessage(t("Play each reference audio preview once to allow synchronized playback in this browser."));
          }).finally(() => playPendingTrackIds.current.delete(item.id));
        } else if (audio.paused && !unlockedTrackIds.current.has(item.id) && !unlockNotices.current.has(item.id)) {
          unlockNotices.current.add(item.id);
          setMessage(t("Play each reference audio preview once to allow synchronized playback in this browser."));
        }
      }
    },
  }), [analysis?.bpm, t, track, tracks]);

  const importFile = async (file?: File) => {
    if (!file) return;
    const request = ++loadRequest.current;
    let context: AudioContext | null = null;
    try {
      if (!file.type.startsWith("audio/") || file.size > 60 * 1024 * 1024) {
        throw new Error(t("Choose an audio file up to 60 MB."));
      }
      setMessage(t("Preparing waveform…"));
      context = new AudioContext();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const data = buffer.getChannelData(0);
      const peaks = Array.from({ length: 600 }, (_, index) => {
        const start = Math.floor(index * data.length / 600);
        const end = Math.floor((index + 1) * data.length / 600);
        let peak = 0;
        const stride = Math.max(1, Math.floor((end - start) / 200));
        for (let at = start; at < end; at += stride) peak = Math.max(peak, Math.abs(data[at] ?? 0));
        return peak;
      });
      if (request !== loadRequest.current) return;
      const hasMain = tracks.some(item => item.stemId === "main" || item.id === songId);
      const id = hasMain ? crypto.randomUUID() : songId;
      const next: BuilderBacking = {
        id,
        songId,
        stemId: hasMain ? `reference-${crypto.randomUUID().slice(0, 8)}` : "main",
        name: file.name,
        blob: file.slice(0, file.size, file.type),
        duration: buffer.duration,
        peaks,
        downbeat: 0,
        volume: 0.65,
        preservePitch: true,
      };
      await saveBuilderBacking(next, true);
      if (request !== loadRequest.current) return;
      const objectUrl = URL.createObjectURL(next.blob);
      createdUrls.current.add(objectUrl);
      setTracks(current => [...current, next]);
      setUrls(current => ({ ...current, [next.id]: objectUrl }));
      unlockedTrackIds.current.delete(next.id);
      if (!hasMain) { setTrack(next); setAnalysis(null); setAnalysisMessage(""); }
      setMessage(hasMain ? t("Reference stem added. Set its downbeat and mix it with the other tracks.") : t("Backing track saved locally. Set the time of its first downbeat to align the song."));
    } catch (error) {
      if (request === loadRequest.current) setMessage(error instanceof Error ? error.message : t("Could not import backing audio."));
    } finally {
      await context?.close().catch(() => undefined);
    }
  };

  const change = async (next: BuilderBacking) => {
    setTrack(next);
    setTracks(current => current.map(item => item.id === next.id ? next : item));
    if (audioRef.current) { audioRef.current.volume = next.volume; audioRef.current.preservesPitch = next.preservePitch !== false; }
    try {
      await saveBuilderBacking(next);
    } catch {
      setMessage(t("Could not save backing settings."));
    }
  };

  const changeReference = async (next: BuilderBacking) => {
    setTracks(current => current.map(item => item.id === next.id ? next : item));
    const audio = secondaryAudioRefs.current.get(next.id);
    if (audio) { audio.volume = next.volume; audio.preservesPitch = next.preservePitch !== false; }
    try { await saveBuilderBacking(next); }
    catch { setMessage(t("Could not save reference stem settings.")); }
  };

  const removeTrack = async (id: string) => {
    const removed = tracks.find(item => item.id === id);
    if (!removed) return;
    try {
      if (id === track?.id) audioRef.current?.pause();
      secondaryAudioRefs.current.get(id)?.pause();
      await deleteBuilderBackingFile(id);
      const remaining = tracks.filter(item => item.id !== id);
      const nextPrimary = id === track?.id ? remaining[0] : track;
      if (id === track?.id && nextPrimary && nextPrimary.stemId !== "main") {
        const promoted = { ...nextPrimary, stemId: "main" };
        await saveBuilderBacking(promoted, true);
        setTracks(remaining.map(item => item.id === promoted.id ? promoted : item));
        setTrack(promoted);
      } else {
        setTracks(remaining);
        if (id === track?.id) setTrack(nextPrimary ?? null);
      }
      const objectUrl = urls[id];
      if (objectUrl) { URL.revokeObjectURL(objectUrl); createdUrls.current.delete(objectUrl); }
      setUrls(current => { const next = { ...current }; delete next[id]; return next; });
      secondaryAudioRefs.current.delete(id);
      unlockedTrackIds.current.delete(id);
      if (id === track?.id) { setAnalysis(null); setAnalysisMessage(""); }
      setMessage(t("Reference audio removed."));
    } catch { setMessage(t("Could not remove that reference audio.")); }
  };

  const analyze = async () => {
    if (!track) return;
    setAnalyzing(true);
    setAnalysisMessage(t("Analyzing the full backing track locally…"));
    try {
      const result = await analyzeBackingAudio(track.blob);
      setAnalysis(result);
      setExcludedCandidates([]); setCandidateVoiceOverrides({});
      setSelectedSuggestionBars(bars.map(bar => bar.index));
      setAnalysisMessage(t("{bpm} BPM estimate · {hits} transient suggestions · first candidate beat at {seconds} seconds. Review before applying.", {
        bpm: result.bpm,
        hits: result.hits.length,
        seconds: result.firstBeatSeconds.toFixed(2),
      }));
    } catch (error) {
      setAnalysis(null);
      setAnalysisMessage(error instanceof Error ? error.message : t("Could not analyze this audio."));
    } finally {
      setAnalyzing(false);
    }
  };

  const excludedCandidateSet = useMemo(() => new Set(excludedCandidates), [excludedCandidates]);
  const reviewedAnalysis = useMemo(() => analysis ? ({ ...analysis, hits: analysis.hits.filter(hit => hit.confidence * 100 >= confidenceFloor && !excludedCandidateSet.has(candidateKey(hit))).map(hit => ({ ...hit, voice: candidateVoiceOverrides[candidateKey(hit)] ?? hit.voice })) }) : null, [analysis, confidenceFloor, excludedCandidateSet, candidateVoiceOverrides]);
  const suggestions = reviewedAnalysis && targetPart ? backingSuggestionsForPart(reviewedAnalysis, targetPart) : [];
  const arrangementSuggestions = useMemo(() => reviewedAnalysis && track ? backingSuggestionsForArrangement(reviewedAnalysis, bars, track.downbeat) : [], [reviewedAnalysis, track, bars]);
  const chosenArrangementSuggestions = arrangementSuggestions.filter(item => selectedSuggestionBars.includes(item.barIndex));

  return <section className="card song-builder-backing" aria-label={t("Backing track")}>
    <h2>{t("Play with a backing track")}</h2>
    <p>{t("Import audio you own or have permission to use. Add multiple backing stems, set their volumes, mute or solo them, and align their downbeats. Start each preview once to allow synchronized playback. Audio stays on this device.")}</p>
    <label>{t("Import backing audio")}<input type="file" accept="audio/*" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {track && <>
      <strong>{track.name} · {Math.round(track.duration)} {t("seconds")}</strong>
      <label>{t("Tempo marker measure boundary")}<input type="number" min={1} max={bars.length+1} value={anchorMeasure} onChange={event=>setAnchorMeasure(Math.max(1,Math.min(bars.length+1,Number(event.target.value)||1)))}/></label><p>{t("Drag the red line to align the first downbeat. Drag a blue marker to adjust its tempo anchor, or click the waveform to place the selected measure marker.")}</p><canvas ref={canvasRef} width={1000} height={100} role="img" aria-label={t("Backing track waveform; red is the first downbeat and blue lines are tempo markers")} onPointerDown={beginWaveDrag} onPointerMove={moveWaveDrag} onPointerUp={endWaveDrag} onPointerCancel={endWaveDrag} />
      <audio ref={audioRef} src={url} controls preload="auto" aria-label={t("Backing audio preview")} onLoadedMetadata={event=>{event.currentTarget.preservesPitch=track.preservePitch!==false;event.currentTarget.volume=track.volume;}} onPlay={() => {
        unlockedTrackIds.current.add(track.id);
        unlockNotices.current.delete(track.id);
        setMessage(t("Backing audio is ready for synchronized playback."));
      }} />
      <div className="song-builder-backing-mixer" aria-label={t("Reference track mixer")}>
        <h3>{t("Reference track mix")}</h3>
        {tracks.map(item => item.id === track.id ? <div className="song-builder-backing-mixer-row" key={item.id}>
          <strong>{item.name} · {t("Main alignment track")}</strong>
          <label>{t("Volume · {volume}%", { volume: Math.round(item.volume * 100) })}<input type="range" min={0} max={1} step={0.01} value={item.volume} onChange={event=>void change({...item,volume:Number(event.target.value)})}/></label>
          <label><input type="checkbox" checked={item.muted===true} onChange={event=>void change({...item,muted:event.target.checked})}/>{t("Mute")}</label>
          <label><input type="checkbox" checked={item.solo===true} onChange={event=>void change({...item,solo:event.target.checked})}/>{t("Solo")}</label>
          <button type="button" onClick={()=>void removeTrack(item.id)}>{t("Remove track")}</button>
        </div> : <div className="song-builder-backing-mixer-row" key={item.id}>
          <strong>{item.name}</strong>
          <audio ref={element=>{if(element)secondaryAudioRefs.current.set(item.id,element);else secondaryAudioRefs.current.delete(item.id);}} src={urls[item.id]} controls preload="auto" aria-label={t("{name} reference preview",{name:item.name})} onLoadedMetadata={event=>{event.currentTarget.preservesPitch=item.preservePitch!==false;event.currentTarget.volume=item.volume;}} onPlay={()=>{unlockedTrackIds.current.add(item.id);unlockNotices.current.delete(item.id);setMessage(t("Reference audio is ready for synchronized playback."));}} />
          <label>{t("Downbeat · seconds")}<input type="number" min={-30} max={item.duration} step={0.01} value={item.downbeat} onChange={event=>void changeReference({...item,downbeat:Math.max(-30,Math.min(item.duration,Number(event.target.value)||0))})}/></label>
          <label>{t("Volume · {volume}%",{volume:Math.round(item.volume*100)})}<input type="range" min={0} max={1} step={0.01} value={item.volume} onChange={event=>void changeReference({...item,volume:Number(event.target.value)})}/></label>
          <label><input type="checkbox" checked={item.muted===true} onChange={event=>void changeReference({...item,muted:event.target.checked})}/>{t("Mute")}</label>
          <label><input type="checkbox" checked={item.solo===true} onChange={event=>void changeReference({...item,solo:event.target.checked})}/>{t("Solo")}</label>
          <label><input type="checkbox" checked={item.preservePitch!==false} onChange={event=>{const next={...item,preservePitch:event.target.checked};const audio=secondaryAudioRefs.current.get(item.id);if(audio)audio.preservesPitch=event.target.checked;void changeReference(next);}}/>{t("Preserve pitch")}</label>
          <button type="button" onClick={()=>void removeTrack(item.id)}>{t("Remove track")}</button>
        </div>)}
      </div>
      <div className="song-builder-tool-fields">
        <label>{t("Backing track tempo · BPM")}<input type="number" min={40} max={200} step={1} value={track.bpm ?? ""} placeholder={analysis ? String(analysis.bpm) : t("Set or analyze")} onChange={(event) => {
          const raw = event.target.value;
          void change({ ...track, bpm: raw === "" ? undefined : Math.max(40, Math.min(200, Number(raw) || 40)) });
        }} /></label>
        <label>{t("First downbeat in audio · seconds")}<input type="number" min={-30} max={track.duration} step={0.01} value={track.downbeat} onChange={(event) => void change({ ...track, downbeat: Math.max(-30, Math.min(track.duration, Number(event.target.value) || 0)) })} /></label>
        <label><input type="checkbox" checked={showBeatGrid} onChange={event=>setShowBeatGrid(event.target.checked)}/>{t("Show arrangement beat grid")}</label>
        <label><input type="checkbox" checked={track.preservePitch !== false} onChange={event=>{const next={...track,preservePitch:event.target.checked};if(audioRef.current)audioRef.current.preservesPitch=event.target.checked;void change(next);}}/>{t("Preserve backing pitch while tempo matching")}</label>
        {analysis && <button type="button" onClick={() => void change({ ...track, bpm: analysis.bpm })}>{t("Use estimated {bpm} BPM for backing sync", { bpm: analysis.bpm })}</button>}
      </div>
      <details className="song-builder-extra">
        <summary>{t("Analyze tempo and suggest drum hits")}</summary>
        <p>{t("Local audio analysis estimates a steady pulse and suggests kick, snare, hi-hat, open hi-hat, tom, crash, and ride hits from frequency and decay cues. These are reviewable guesses; mixed audio can produce false hits.")}</p>
        <button type="button" disabled={analyzing} onClick={() => void analyze()}>{analyzing ? t("Analyzing…") : t("Analyze backing track")}</button>
        {analysis && <>
          <p><strong>{analysis.bpm} BPM</strong> · {t("first candidate beat {seconds} s · analyzed {duration} s", { seconds: analysis.firstBeatSeconds.toFixed(2), duration: Math.round(analysis.analyzedSeconds) })}</p>
          <label>{t("Minimum onset confidence · {value}%", { value: confidenceFloor })}<input type="range" min={25} max={95} step={5} value={confidenceFloor} onChange={event=>setConfidenceFloor(Number(event.target.value))}/></label>
          <p>{t("{kept} of {total} transient candidates pass the confidence filter.", { kept: reviewedAnalysis?.hits.length ?? 0, total: analysis.hits.length })}</p>
          <details className="song-builder-audio-candidate-review"><summary>Review and correct individual detections</summary><p>Include or reject a transient and correct its likely drum voice before building patterns. These local signal estimates can be wrong on mixed audio.</p><div className="song-builder-analysis-measures">{analysis.hits.filter(hit=>hit.confidence*100>=confidenceFloor).slice(0,160).map(hit=>{const key=candidateKey(hit),included=!excludedCandidates.includes(key);return <label key={key}><input type="checkbox" checked={included} onChange={event=>setExcludedCandidates(current=>event.target.checked?current.filter(item=>item!==key):[...current,key])}/><span><strong>{hit.timeSeconds.toFixed(2)} s · {Math.round(hit.confidence*100)}% onset · {Math.round((hit.voiceConfidence??0.5)*100)}% voice</strong><small>Detected as {hit.voice}</small></span><select aria-label={`Voice for transient at ${hit.timeSeconds.toFixed(2)} seconds`} value={candidateVoiceOverrides[key]??hit.voice} disabled={!included} onChange={event=>setCandidateVoiceOverrides(current=>({...current,[key]:event.target.value as BackingAudioAnalysis["hits"][number]["voice"]}))}>{([["kick","Kick"],["snare","Snare"],["hihat","Closed hi-hat"],["openhat","Open hi-hat"],["tom","Tom"],["crash","Crash"],["ride","Ride"]] as const).map(([voice,label])=><option key={voice} value={voice}>{label}</option>)}</select></label>;})}</div>{analysis.hits.filter(hit=>hit.confidence*100>=confidenceFloor).length>160&&<small>{analysis.hits.filter(hit=>hit.confidence*100>=confidenceFloor).length-160} more candidates use the current threshold and voice mappings.</small>}</details>
          <div className="song-builder-actions">
            <button type="button" onClick={() => onApplyTempo(analysis.bpm)}>{t("Use estimated BPM for song tempo")}</button>
            <button type="button" onClick={() => void change({ ...track, downbeat: analysis.firstBeatSeconds })}>{t("Align backing to estimated first beat")}</button>
          </div>
          <p>{targetPart
            ? t("Preview for {part}: {count} snapped notes in its first pattern-length window.", { part: targetPart.name, count: suggestions.length })
            : t("Select a pattern to preview and add detected hits.")}</p>
          {suggestions.length > 0 && <>
            <ol className="song-builder-analysis-hits">{suggestions.slice(0, 16).map((hit, index) => <li key={`${hit.instrument}:${hit.step}:${index}`}>{hit.instrument} · {t("step {step}", { step: hit.step + 1 })} · {t("velocity {velocity}", { velocity: hit.velocity ?? 86 })}</li>)}</ol>
            <button type="button" disabled={!targetPart} onClick={() => onApplyHits(suggestions)}>{t("Add suggestions to selected pattern")}</button>
          </>}
          {arrangementSuggestions.length > 0 && <section className="song-builder-analysis-arrangement" aria-label="Full arrangement audio suggestions"><h3>Review full-song suggestions by measure</h3><p>{arrangementSuggestions.length} measures have detected hits. Confidence estimates onset strength; it cannot reliably identify instruments in a mixed recording.</p><div className="song-builder-actions"><button type="button" onClick={() => setSelectedSuggestionBars(arrangementSuggestions.map(item => item.barIndex))}>Select detected measures</button><button type="button" onClick={() => setSelectedSuggestionBars([])}>Clear selection</button><button type="button" disabled={!chosenArrangementSuggestions.length} onClick={() => { onApplyArrangementHits(chosenArrangementSuggestions); setAnalysisMessage(t("Added suggestions from {measures} measures. Review the arrangement and undo if needed.", { measures: chosenArrangementSuggestions.length })); }}>{t("Add selected measures ({count})", { count: chosenArrangementSuggestions.length })}</button></div><div className="song-builder-analysis-measures">{arrangementSuggestions.map(item => <label key={item.barIndex}><input type="checkbox" checked={selectedSuggestionBars.includes(item.barIndex)} onChange={event => setSelectedSuggestionBars(current => event.target.checked ? [...new Set([...current, item.barIndex])] : current.filter(index => index !== item.barIndex))}/><span><strong>Measure {item.measure} · {item.sectionName}</strong><small>{item.partName} · {item.hits.length} snapped notes · {Math.round(item.confidence * 100)}% onset confidence</small><small>{item.hits.slice(0, 8).map(hit => `${hit.instrument} ${hit.step + 1}`).join(" · ")}{item.hits.length > 8 ? " · …" : ""}</small></span></label>)}</div></section>}
        </>}
        <p role="status">{analysisMessage}</p>
      </details>
    </>}
    <p role="status">{message || t("Backing audio stays on this device and follows playback, seeking, and loops.")}</p>
  </section>;
});
