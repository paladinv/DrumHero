"use client";

import { useEffect, useRef, useState } from "react";
import type { ImprovisationPhase } from "@/lib/improvisation";
import { useLocalization } from "./LocalizationProvider";
import styles from "./ImprovisationStudio.module.css";

type StemRole = "drums" | "bass" | "harmony" | "other";
type Stem = { id: string; url: string; name: string; role: StemRole; duration: number; volume: number; muted: boolean };
const LIVE_PHASES: ImprovisationPhase[] = ["partner", "player"];
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function ImprovisationBackingTrack({ phase, elapsedMs, sessionBpm, disabled }: { phase: ImprovisationPhase; elapsedMs: number; sessionBpm: number; disabled: boolean }) {
  const { t } = useLocalization();
  const audioRefs = useRef(new Map<string, HTMLAudioElement>()), objectUrls = useRef(new Set<string>()), startedIds = useRef(new Set<string>()), fileInput = useRef<HTMLInputElement>(null);
  const [stems, setStems] = useState<Stem[]>([]), [trackBpm, setTrackBpm] = useState(100), [loop, setLoop] = useState(true), [playing, setPlaying] = useState(false);
  const [loopStart, setLoopStart] = useState(0), [loopEnd, setLoopEnd] = useState(0), [newRole, setNewRole] = useState<StemRole>("drums"), [status, setStatus] = useState("");
  const rate = clamp(sessionBpm / trackBpm, 0.5, 2);
  const availableDurations = stems.map(stem => stem.duration).filter(duration => duration > 0);
  const maximumDuration = availableDurations.length ? Math.min(...availableDurations) : 0;
  const canControlTrack = LIVE_PHASES.includes(phase) || (["idle", "stopped", "complete"].includes(phase) && !disabled);

  useEffect(() => () => {
    audioRefs.current.forEach(element => element.pause());
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  useEffect(() => {
    for (const stem of stems) {
      const element = audioRefs.current.get(stem.id);
      if (!element) continue;
      element.volume = stem.volume;
      element.muted = stem.muted;
      element.playbackRate = rate;
      element.loop = false;
      if (disabled && !LIVE_PHASES.includes(phase)) { element.pause(); startedIds.current.delete(stem.id); continue; }
      if (playing && phase === "idle") continue;
      if (["paused", "count-in", "loading"].includes(phase)) { element.pause(); startedIds.current.delete(stem.id); continue; }
      if (["complete", "stopped", "idle"].includes(phase)) { element.pause(); element.currentTime = 0; startedIds.current.delete(stem.id); continue; }
      if (LIVE_PHASES.includes(phase) && !startedIds.current.has(stem.id)) {
        if (playing) element.pause();
        const lower = loop ? Math.min(loopStart, stem.duration) : 0;
        const upper = loop && loopEnd > lower ? Math.min(loopEnd, stem.duration) : stem.duration;
        const target = elapsedMs / 1000 * rate;
        element.currentTime = upper > lower ? lower + (target % (upper - lower) + (upper - lower)) % (upper - lower) : Math.min(target, Math.max(0, stem.duration - 0.05));
        void element.play().then(() => setStatus(t("Backing stems aligned to the session tempo."))).catch(() => setStatus(t("Tap Play backing stems to allow this browser to play local files.")));
        startedIds.current.add(stem.id);
      }
    }
  }, [stems, phase, elapsedMs, sessionBpm, trackBpm, rate, loop, loopStart, loopEnd, playing, disabled, t]);

  useEffect(() => {
    const elements = [...audioRefs.current.values()];
    const handleTime = (event: Event) => {
      const element = event.currentTarget as HTMLAudioElement;
      const stem = stems.find(item => audioRefs.current.get(item.id) === element);
      if (stem && loop && loopEnd > loopStart && element.currentTime >= Math.min(loopEnd, stem.duration)) element.currentTime = Math.min(loopStart, stem.duration);
    };
    const handleVisibility = () => {
      if (!document.hidden) return;
      audioRefs.current.forEach(element => element.pause());
      startedIds.current.clear(); setPlaying(false);
    };
    elements.forEach(element => element.addEventListener("timeupdate", handleTime));
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      elements.forEach(element => element.removeEventListener("timeupdate", handleTime));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stems, loop, loopStart, loopEnd]);

  const addStem = (file?: File) => {
    if (!file) return;
    if (stems.length >= 4) { setStatus(t("A mix can contain up to four local stems.")); return; }
    const hasAudioType = file.type.startsWith("audio/") || /\.(aac|flac|m4a|mp3|ogg|opus|wav|weba)$/i.test(file.name);
    if (!hasAudioType || file.size > 100_000_000) { setStatus(t("Choose an audio file smaller than 100 MB.")); if (fileInput.current) fileInput.current.value = ""; return; }
    const url = URL.createObjectURL(file), id = crypto.randomUUID(); objectUrls.current.add(url);
    setStems(previous => [...previous, { id, url, name: file.name, role: newRole, duration: 0, volume: 0.65, muted: false }]);
    setStatus(t("Loading local stem…"));
    if (fileInput.current) fileInput.current.value = "";
  };
  const updateStem = (id: string, update: Partial<Stem>) => setStems(previous => previous.map(stem => stem.id === id ? { ...stem, ...update } : stem));
  const removeStem = (id: string) => {
    const current = stems.find(stem => stem.id === id);
    const element = audioRefs.current.get(id); element?.pause(); audioRefs.current.delete(id); startedIds.current.delete(id);
    if (current) { URL.revokeObjectURL(current.url); objectUrls.current.delete(current.url); }
    setStems(previous => previous.filter(stem => stem.id !== id));
    setStatus(t("Local stem removed."));
  };
  const syncTime = (duration: number) => {
    const lower = loop ? Math.min(loopStart, duration) : 0, upper = loop && loopEnd > lower ? Math.min(loopEnd, duration) : duration;
    const target = elapsedMs / 1000 * rate;
    return upper > lower ? lower + (target % (upper - lower) + (upper - lower)) % (upper - lower) : Math.min(target, Math.max(0, duration - 0.05));
  };
  const togglePreview = async () => {
    const elements = stems.map(stem => ({ stem, element: audioRefs.current.get(stem.id) })).filter((item): item is { stem: Stem; element: HTMLAudioElement } => Boolean(item.element));
    if (!elements.length) return;
    if (playing) {
      elements.forEach(({ element }) => element.pause()); startedIds.current.clear(); setPlaying(false); setStatus(t("Backing stems stopped.")); return;
    }
    const outcomes = await Promise.all(elements.map(async ({ stem, element }) => {
      element.volume = stem.volume; element.muted = stem.muted; element.playbackRate = rate;
      element.currentTime = LIVE_PHASES.includes(phase) ? syncTime(stem.duration) : Math.min(loopStart, stem.duration);
      try { await element.play(); if (LIVE_PHASES.includes(phase)) startedIds.current.add(stem.id); return true; } catch { return false; }
    }));
    setPlaying(outcomes.some(Boolean));
    setStatus(outcomes.every(Boolean) ? t(LIVE_PHASES.includes(phase) ? "Backing stems aligned to the current session position." : "Backing stems preview is playing.") : t("Some stems could not play. Check the audio file and browser playback permission."));
  };

  return <section className={styles.backingTrack} aria-label={t("Local backing mixer")}>
    <h3>{t("Play with local backing stems")}</h3>
    <p>{t("Add up to four local audio stems. Files stay on this device and are never uploaded or included in session history.")}</p>
    <div className={styles.transport}>
      <label>{t("New stem type")}<select value={newRole} onChange={event => setNewRole(event.target.value as StemRole)}><option value="drums">{t("Drums")}</option><option value="bass">{t("Bass")}</option><option value="harmony">{t("Harmony")}</option><option value="other">{t("Other")}</option></select></label>
      <button type="button" className="button-secondary" disabled={disabled || stems.length >= 4} onClick={() => fileInput.current?.click()}>{t("Add local stem")}</button>
      <input ref={fileInput} type="file" accept="audio/*" aria-label={t("Choose a local audio stem")} onChange={event => addStem(event.currentTarget.files?.[0])} hidden />
    </div>
    {stems.length > 0 && <>
      {stems.map(stem => <fieldset key={stem.id} disabled={disabled && !LIVE_PHASES.includes(phase)} className={styles.settings}>
        <legend>{t(stem.role)} · {stem.name}</legend>
        <audio ref={element => { if (element) audioRefs.current.set(stem.id, element); else audioRefs.current.delete(stem.id); }} src={stem.url} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying([...audioRefs.current.values()].some(item => !item.paused))} onLoadedMetadata={event => {
          const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
          setStems(previous => previous.map(item => item.id === stem.id ? { ...item, duration } : item));
          if (duration > 0 && (loopEnd === 0 || duration < loopEnd)) setLoopEnd(duration);
          setStatus(t("Local stem ready. Set its role and mix level."));
        }} onError={() => setStatus(t("This browser could not decode one of the selected audio files."))} />
        <div className={styles.settings}>
          <label>{t("Stem type")}<select value={stem.role} onChange={event => updateStem(stem.id, { role: event.target.value as StemRole })}><option value="drums">{t("Drums")}</option><option value="bass">{t("Bass")}</option><option value="harmony">{t("Harmony")}</option><option value="other">{t("Other")}</option></select></label>
          <label>{t("Stem volume")}<input type="range" min="0" max="1" step="0.05" value={stem.volume} onChange={event => updateStem(stem.id, { volume: Number(event.target.value) })} /></label>
          <label className={styles.check}><input type="checkbox" checked={stem.muted} onChange={event => updateStem(stem.id, { muted: event.target.checked })} />{t("Mute stem")}</label>
          <button type="button" className="button-secondary" onClick={() => removeStem(stem.id)}>{t("Remove stem {name}", { name: stem.name })}</button>
        </div>
      </fieldset>)}
      <fieldset disabled={disabled && !LIVE_PHASES.includes(phase)} className={styles.settings}><legend>{t("Shared stem alignment")}</legend>
        <label>{t("Track tempo · {bpm} BPM", { bpm: trackBpm })}<input type="number" min="40" max="240" value={trackBpm} onChange={event => setTrackBpm(clamp(Number(event.target.value) || 100, 40, 240))} /></label>
        <label className={styles.check}><input type="checkbox" checked={loop} onChange={event => setLoop(event.target.checked)} />{t("Loop the same A/B section on every stem")}</label>
        <label>{t("Loop start · seconds")}<input type="number" min="0" max={maximumDuration} step="0.1" value={loopStart} onChange={event => setLoopStart(clamp(Number(event.target.value) || 0, 0, maximumDuration))} /></label>
        <label>{t("Loop end · seconds")}<input type="number" min={loopStart} max={maximumDuration} step="0.1" value={loopEnd} onChange={event => setLoopEnd(clamp(Number(event.target.value) || maximumDuration, loopStart, maximumDuration))} /></label>
      </fieldset>
      <button type="button" className="button-secondary" disabled={!canControlTrack} onClick={() => void togglePreview()}>{t(playing ? "Stop backing stems" : LIVE_PHASES.includes(phase) ? "Start backing stems at current position" : "Preview backing stems")}</button>
      <p>{t("Session tempo {session} BPM · playback speed {rate}×. Every stem follows session time after count-in and pause.", { session: sessionBpm, rate: rate.toFixed(2) })}</p>
      {rate !== sessionBpm / trackBpm && <p>{t("Tempo alignment is limited to 0.5×–2× playback speed.")}</p>}
      {maximumDuration > 0 && <p>{t("Loop controls use the shortest stem length ({seconds} seconds) so the parts stay aligned.", { seconds: maximumDuration.toFixed(1) })}</p>}
    </>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}
