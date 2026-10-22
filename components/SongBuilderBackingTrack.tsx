"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DrumPart } from "@/lib/song-library";
import type { TempoAnchor } from "@/lib/song-builder-tools";
import type { ArrangementBar } from "@/lib/song-builder";
import { deleteBuilderBacking, readBuilderBacking, saveBuilderBacking, type BuilderBacking } from "@/lib/song-builder-storage";
import { analyzeBackingAudio, backingSuggestionsForPart, type BackingAudioAnalysis } from "@/lib/song-builder-audio-analysis";
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
  onAnchorsChange: (anchors: TempoAnchor[]) => void;
};

export const SongBuilderBackingTrack = forwardRef<BackingTrackHandle, Props>(function SongBuilderBackingTrack(
  { songId, targetPart, bars, anchors, onApplyTempo, onApplyHits, onAnchorsChange },
  ref,
) {
  const { t } = useLocalization();
  const [track, setTrack] = useState<BuilderBacking | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<BackingAudioAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playPending = useRef(false);
  const playbackUnlocked = useRef(false);
  const unlockNotice = useRef(false);
  const loadRequest = useRef(0);
  const dragRef = useRef<{ pointerId: number; kind: "downbeat" | "anchor"; beat?: number } | null>(null);
  const [anchorMeasure, setAnchorMeasure] = useState(1);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    loadRequest.current += 1;
    void readBuilderBacking(songId).then((value) => {
      if (!active) return;
      setTrack(value ?? null);
      objectUrl = value ? URL.createObjectURL(value.blob) : "";
      setUrl(objectUrl);
    }).catch(() => {
      if (!active) return;
      setTrack(null);
      setUrl("");
      setMessage(t("Backing audio storage is unavailable in this browser."));
    });
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [songId, t]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#dfd8cd";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#454f48";
    track?.peaks.forEach((peak, index) => {
      const x = index / track.peaks.length * canvas.width;
      const height = Math.max(1, peak * (canvas.height - 10));
      context.fillRect(x, (canvas.height - height) / 2, Math.max(1, canvas.width / track.peaks.length), height);
    });
    if (track) {
      const x = track.downbeat / track.duration * canvas.width;
      context.strokeStyle = "#e85348";
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
      anchors.forEach(anchor=>{const markerX=(track.downbeat+anchor.seconds)/track.duration*canvas.width;if(markerX<0||markerX>canvas.width)return;context.strokeStyle="#397db8";context.beginPath();context.moveTo(markerX,0);context.lineTo(markerX,canvas.height);context.stroke();context.fillStyle="#235d8f";context.font="12px sans-serif";context.fillText(`M${Math.max(1,bars.findIndex(bar=>Math.abs((bar.arrangementBeatStart ?? 0)-anchor.beat)<0.001)+1)}`,Math.min(canvas.width-32,markerX+3),14);});
    }
  }, [track,anchors,bars]);

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
    playbackUnlocked.current = false;
    unlockNotice.current = false;
  }, [track?.id]);

  useImperativeHandle(ref, () => ({
    pause: () => audioRef.current?.pause(),
    getTempo: () => track?.bpm ?? analysis?.bpm,
    sync: (milliseconds, rate = 1) => {
      const audio = audioRef.current;
      if (!audio || !track) return;
      const target = milliseconds / 1000 + track.downbeat;
      if (target < 0 || target >= track.duration) {
        audio.pause();
        return;
      }
      audio.volume = track.volume;
      audio.playbackRate = Math.max(0.25, Math.min(4, rate));
      if (Math.abs(audio.currentTime - target) > 0.18) audio.currentTime = target;
      if (audio.paused && !playPending.current && playbackUnlocked.current) {
        playPending.current = true;
        void audio.play().catch(() => {
          playbackUnlocked.current = false;
          setMessage(t("Play the backing audio preview once to enable synchronized playback in this browser."));
        }).finally(() => {
          playPending.current = false;
        });
      } else if (audio.paused && !playbackUnlocked.current && !unlockNotice.current) {
        unlockNotice.current = true;
        setMessage(t("Play the backing audio preview once to enable synchronized playback in this browser."));
      }
    },
  }), [analysis?.bpm, t, track]);

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
      const next: BuilderBacking = {
        id: songId,
        name: file.name,
        blob: file.slice(0, file.size, file.type),
        duration: buffer.duration,
        peaks,
        downbeat: 0,
        volume: 0.65,
      };
      await saveBuilderBacking(next, true);
      if (request !== loadRequest.current) return;
      setTrack(next);
      setAnalysis(null);
      setAnalysisMessage("");
      setUrl(URL.createObjectURL(next.blob));
      setMessage(t("Backing track saved locally. Set the time of its first downbeat to align the song."));
    } catch (error) {
      if (request === loadRequest.current) setMessage(error instanceof Error ? error.message : t("Could not import backing audio."));
    } finally {
      await context?.close().catch(() => undefined);
    }
  };

  const change = async (next: BuilderBacking) => {
    setTrack(next);
    try {
      await saveBuilderBacking(next);
    } catch {
      setMessage(t("Could not save backing settings."));
    }
  };

  const analyze = async () => {
    if (!track) return;
    setAnalyzing(true);
    setAnalysisMessage(t("Analyzing a maximum of three minutes of audio locally…"));
    try {
      const result = await analyzeBackingAudio(track.blob);
      setAnalysis(result);
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

  const suggestions = analysis && targetPart ? backingSuggestionsForPart(analysis, targetPart) : [];

  return <section className="card song-builder-backing" aria-label={t("Backing track")}>
    <h2>{t("Play with a backing track")}</h2>
    <p>{t("Import audio you own or have permission to use. Stereo tracks sync best. Set its BPM and first downbeat, then match the form length. Start the audio preview once to allow synchronized playback. Audio stays on this device.")}</p>
    <label>{t("Import backing audio")}<input type="file" accept="audio/*" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {track && <>
      <strong>{track.name} · {Math.round(track.duration)} {t("seconds")}</strong>
      <label>{t("Tempo marker measure boundary")}<input type="number" min={1} max={bars.length+1} value={anchorMeasure} onChange={event=>setAnchorMeasure(Math.max(1,Math.min(bars.length+1,Number(event.target.value)||1)))}/></label><p>{t("Drag the red line to align the first downbeat. Drag a blue marker to adjust its tempo anchor, or click the waveform to place the selected measure marker.")}</p><canvas ref={canvasRef} width={1000} height={100} role="img" aria-label={t("Backing track waveform; red is the first downbeat and blue lines are tempo markers")} onPointerDown={beginWaveDrag} onPointerMove={moveWaveDrag} onPointerUp={endWaveDrag} onPointerCancel={endWaveDrag} />
      <audio ref={audioRef} src={url} controls preload="auto" aria-label={t("Backing audio preview")} onPlay={() => {
        playbackUnlocked.current = true;
        unlockNotice.current = false;
        setMessage(t("Backing audio is ready for synchronized playback."));
      }} />
      <div className="song-builder-tool-fields">
        <label>{t("Backing track tempo · BPM")}<input type="number" min={40} max={200} step={1} value={track.bpm ?? ""} placeholder={analysis ? String(analysis.bpm) : t("Set or analyze")} onChange={(event) => {
          const raw = event.target.value;
          void change({ ...track, bpm: raw === "" ? undefined : Math.max(40, Math.min(200, Number(raw) || 40)) });
        }} /></label>
        <label>{t("First downbeat in audio · seconds")}<input type="number" min={-30} max={track.duration} step={0.01} value={track.downbeat} onChange={(event) => void change({ ...track, downbeat: Math.max(-30, Math.min(track.duration, Number(event.target.value) || 0)) })} /></label>
        <label>{t("Backing volume · {volume}%", { volume: Math.round(track.volume * 100) })}<input type="range" min={0} max={1} step={0.01} value={track.volume} onChange={(event) => void change({ ...track, volume: Number(event.target.value) })} /></label>
        {analysis && <button type="button" onClick={() => void change({ ...track, bpm: analysis.bpm })}>{t("Use estimated {bpm} BPM for backing sync", { bpm: analysis.bpm })}</button>}
        <button type="button" onClick={() => {
          audioRef.current?.pause();
          void deleteBuilderBacking(songId).then(() => {
            setTrack(null);
            setUrl("");
            setAnalysis(null);
            setMessage(t("Backing audio removed."));
          }).catch(() => setMessage(t("Could not remove backing audio.")));
        }}>{t("Remove backing audio")}</button>
      </div>
      <details className="song-builder-extra">
        <summary>{t("Analyze tempo and suggest drum hits")}</summary>
        <p>{t("Local audio analysis estimates a steady pulse and classifies transient peaks as kick, snare, or hi-hat. Mixed audio can produce false hits, so review the suggestions and edit them after insertion.")}</p>
        <button type="button" disabled={analyzing} onClick={() => void analyze()}>{analyzing ? t("Analyzing…") : t("Analyze backing track")}</button>
        {analysis && <>
          <p><strong>{analysis.bpm} BPM</strong> · {t("first candidate beat {seconds} s · analyzed {duration} s", { seconds: analysis.firstBeatSeconds.toFixed(2), duration: Math.round(analysis.analyzedSeconds) })}</p>
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
          {analysis.hits.length > 0 && <small>{t("Raw candidates: {candidates}{more}", {
            candidates: analysis.hits.slice(0, 8).map((hit) => `${hit.voice} ${hit.timeSeconds.toFixed(2)} s`).join(" · "),
            more: analysis.hits.length > 8 ? " · …" : "",
          })}</small>}
        </>}
        <p role="status">{analysisMessage}</p>
      </details>
    </>}
    <p role="status">{message || t("Backing audio stays on this device and follows playback, seeking, and loops.")}</p>
  </section>;
});
