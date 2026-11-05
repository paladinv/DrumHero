"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDrumAudio, type DrumAudio } from "@/lib/audio";
import { demonstrationPhrase, improvisationScoreGrid, improvisationSoundInstrument, meterParts, notationFlagCount, stepDuration, virtualDrummerResponse, type ImprovisationSettings } from "@/lib/improvisation";
import { DrumStaffNotation, type DrumNotationEvent, type DrumNotationFrame } from "./TrainerNotationView";
import { useLocalization } from "./LocalizationProvider";
import styles from "./ImprovisationStudio.module.css";

export function ImprovisationPhrasePreview({ settings, disabled = false }: { settings: ImprovisationSettings; disabled?: boolean }) {
  const { t } = useLocalization();
  const audio = useRef<DrumAudio | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null), generation = useRef(0);
  const [playing, setPlaying] = useState(false), [atMs, setAtMs] = useState<number | null>(null), [status, setStatus] = useState("");
  const { stepsPerBar, stepsPerPulse } = meterParts(settings), totalSteps = settings.bars * stepsPerBar, stepMs = stepDuration(settings);
  const hits = useMemo(() => settings.mode === "guided" ? demonstrationPhrase(settings) : virtualDrummerResponse(0, settings), [settings]);
  const events: DrumNotationEvent[] = hits.map(hit => ({ step: hit.step, instrument: hit.instrument, source: "reference", flagCount: notationFlagCount(settings, hit.step), velocityTarget: hit.velocityTarget, accent: (hit.velocityTarget ?? 0) >= 108 }));
  const grid = improvisationScoreGrid(settings);
  const frame: DrumNotationFrame = { name: t(settings.mode === "guided" ? "Guided example" : "Virtual drummer preview"), meter: settings.meter, bars: settings.bars, stepsPerBar, totalSteps, stepsPerPulse, flagCount: settings.subdivision === "sixteenth" ? 2 : 1, grid, events, ...(atMs === null ? {} : { playheadStep: atMs / stepMs, playheadTransitionMs: 0 }), autoFollow: atMs !== null };
  const stop = useCallback(() => {
    generation.current++;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    audio.current?.close(); audio.current = null;
    setPlaying(false); setAtMs(null);
  }, []);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (!disabled || !playing) return;
    const task = window.setTimeout(stop, 0);
    return () => window.clearTimeout(task);
  }, [disabled, playing, stop]);
  useEffect(() => {
    const hidden = () => { if (document.hidden && playing) { stop(); setStatus(t("Preview stopped because the page was hidden.")); } };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [playing, stop, t]);
  const play = async () => {
    stop(); const token = generation.current; setStatus(t("Loading phrase preview…"));
    try {
      const player = createDrumAudio(undefined, undefined, () => { if (token === generation.current) { stop(); setStatus(t("Preview audio was interrupted. Try again.")); } });
      audio.current = player;
      if (!player || !await player.ready || token !== generation.current) { if (token === generation.current) { stop(); setStatus(t("Preview sounds could not load. Try again.")); } return; }
      const epoch = performance.now() + 80, durationMs = totalSteps * stepMs;
      hits.forEach(hit => player.scheduleHit(improvisationSoundInstrument({ instrument: hit.instrument }), epoch + hit.step * stepMs, false, hit.velocityTarget));
      setPlaying(true); setStatus(t("Phrase preview is playing."));
      const tick = () => {
        if (token !== generation.current) return;
        const elapsed = performance.now() - epoch;
        if (elapsed < 0) return;
        setAtMs(Math.min(durationMs, elapsed));
        if (elapsed >= durationMs + 120) { stop(); setStatus(t("Phrase preview complete.")); }
      };
      tick(); timer.current = setInterval(tick, 40);
    } catch { if (token === generation.current) { stop(); setStatus(t("Preview sounds could not load. Try again.")); } }
  };
  return <details className={`card ${styles.preview}`}>
    <summary>{t("Preview this setup")}</summary>
    <p>{t("Hear and read a sample phrase using the current meter, groove, tempo, and phrase length. The live score can reveal less detail if you prefer to listen first.")}</p>
    <DrumStaffNotation frame={frame} showRhythmStems />
    <div className="transport"><button type="button" className="button-secondary" disabled={disabled || playing} onClick={() => void play()}>{t("Play phrase preview")}</button>{playing && <button type="button" className="button-secondary" onClick={() => { stop(); setStatus(t("Preview stopped.")); }}>{t("Stop preview")}</button>}</div>
    <p role="status">{status}</p>
  </details>;
}
