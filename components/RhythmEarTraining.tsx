"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createDrumAudio, type DrumAudio } from "@/lib/audio";
import { adaptiveEarLevel, createEarExercise, earBarDurationMs, earHitOffsetMs, EAR_FEELS, EAR_HISTORY_KEY, EAR_LEVELS, EAR_METERS, explainEarAnswer, parseEarHistory, recommendedEarLevel, scoreEarAttempt, skillsForEarPattern, type EarAttempt, type EarExercise, type EarFeel, type EarLevel, type EarMeter, type EarMode, type EarResult, type EarSkill } from "@/lib/ear-training";
import { learnerStorageKey } from "@/lib/learner-profiles";
import { stepDurationMs } from "@/lib/scoring";
import type { Instrument, PracticePattern } from "@/lib/types";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";
import styles from "./RhythmEarTraining.module.css";

type Phase = "ready" | "loading" | "listening" | "preview" | "answer" | "count-in" | "playing" | "results";
const pads: Array<{ voice: Instrument; label: string; code: string; key: string }> = [
  { voice: "kick", label: "Kick", code: "Space", key: "Space" },
  { voice: "snare", label: "Snare", code: "KeyF", key: "F" },
  { voice: "hihat", label: "Hi-hat", code: "KeyJ", key: "J" },
];

const skillLabels: Record<EarSkill, string> = { rests: "Hearing rests", offbeats: "Hearing offbeats", "sixteenth-notes": "Sixteenth-note spacing", triplets: "Triplet timing", syncopation: "Groove syncopation", "voice-separation": "Separating drum voices", meter: "Recognizing meter", swing: "Hearing swing and shuffle" };
const timingLabels = { great: "Great", good: "Good", miss: "Missed", extra: "Extra" } as const;

function countInPulses(meter: EarMeter) { return meter === "6/8" ? 2 : meter === "3/4" ? 3 : 4; }
function countInPulseMs(bpm: number, meter: EarMeter) { return 60_000 / bpm * (meter === "6/8" ? 1.5 : 1); }
function countInDurationMs(bpm: number, meter: EarMeter, bars: number) { return countInPulseMs(bpm, meter) * countInPulses(meter) * bars; }
function localDayKey() { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; }
function modeForSkill(skill: EarSkill): EarMode { return skill === "meter" ? "meter" : skill === "swing" ? "feel" : skill === "voice-separation" || skill === "syncopation" ? "identify" : "play"; }

function RhythmGrid({ pattern, label, meter = "4/4", response }: { pattern: PracticePattern; label: string; meter?: EarMeter; response?: Array<ReturnType<typeof scoreEarAttempt>["rated"][number]> }) {
  const { t } = useLocalization();
  const steps = pattern.beats * pattern.subdivision / 4;
  const voices = pads.filter(pad => pattern.hits.some(hit => hit.instrument === pad.voice) || response?.some(hit => hit.instrument === pad.voice));
  const stepsPerPulse = meter === "6/8" ? pattern.subdivision * 3 / 8 : steps / pattern.beats;
  const stepsPerMeasure = pattern.subdivision * (meter === "4/4" ? 4 : 3) / 4;
  const subdivisionLabel = (step: number) => {
    const stepInMeasure = step % stepsPerMeasure;
    const withinPulse = stepInMeasure % stepsPerPulse;
    if (withinPulse === 0) return String(Math.floor(stepInMeasure / stepsPerPulse) + 1);
    if (stepsPerPulse === 2) return "&";
    if (stepsPerPulse === 3) return ["tri", "let"][withinPulse - 1] ?? "";
    if (stepsPerPulse === 6) return ["e", "&", "a", "&", "a"][withinPulse - 1] ?? "";
    return ["e", "&", "a"][withinPulse - 1] ?? "";
  };
  return <div className={styles.gridScroll} role="group" aria-label={label}>
    <table className={styles.grid}>
      <caption className={styles.srOnly}>{label} · {t(meter)} · {steps === 12 ? t("Triplet subdivisions") : `${steps / pattern.beats} ${t("subdivisions per beat")}`}</caption>
      <thead><tr><th scope="col">{t("Drum")}</th>{Array.from({ length: steps }, (_, step) => <th scope="col" key={step}>{subdivisionLabel(step)}</th>)}</tr></thead>
      <tbody>{voices.map(pad => {
        const targetAt = (step: number) => pattern.hits.find(hit => hit.step === step && hit.instrument === pad.voice);
        const resultAt = (step: number) => response?.filter(hit => hit.step === step && hit.instrument === pad.voice && hit.rating !== "miss") ?? [];
        const missAt = (step: number) => response?.some(hit => hit.step === step && hit.instrument === pad.voice && hit.rating === "miss") ?? false;
        return <Fragment key={pad.voice}>
          <tr key={`${pad.voice}-target`}><th scope="row">{t(pad.label)} · {t("Target")}</th>{Array.from({ length: steps }, (_, step) => { const target = targetAt(step); const missed = missAt(step); const isMeasureStart = step > 0 && step % stepsPerMeasure === 0; return <td key={step} className={`${step % stepsPerPulse === 0 ? styles.beatCell : ""} ${isMeasureStart ? styles.measureCell : ""} ${missed ? styles.missedTarget : ""}`}>{target ? <span role="img" className={`${styles.note} ${response && missed ? styles.missedNote : ""}`} title={missed ? t("Missed target") : t("Target hit")} aria-label={missed ? t("Missed target") : t("Target hit")}><span aria-hidden="true">●</span></span> : <span role="img" className={styles.rest} aria-label={t("Rest")}><span aria-hidden="true">·</span></span>}</td>})}</tr>
          {response ? <tr key={`${pad.voice}-response`}><th scope="row">{t("You")} · {t(pad.label)}</th>{Array.from({ length: steps }, (_, step) => { const hits = resultAt(step); const isMeasureStart = step > 0 && step % stepsPerMeasure === 0; return <td key={step} className={`${step % stepsPerPulse === 0 ? styles.beatCell : ""} ${isMeasureStart ? styles.measureCell : ""} ${hits.some(hit => hit.rating === "extra") ? styles.extraCell : ""}`}>{hits.length ? <span role="img" className={`${styles.responseNotes} ${styles[`rating_${hits[0]!.rating}`]}`} title={hits.map(hit => `${t(timingLabels[hit.rating])}${hit.offsetMs !== null ? ` ${hit.offsetMs > 0 ? "+" : ""}${hit.offsetMs} ms` : ""}`).join(", ")} aria-label={hits.map(hit => `${t(timingLabels[hit.rating])}${hit.offsetMs !== null ? ` ${hit.offsetMs > 0 ? "+" : ""}${hit.offsetMs} ms` : ""}`).join(", ")}><span aria-hidden="true">{hits.some(hit => hit.rating === "extra") ? "×" : "●"}</span></span> : <span role="img" className={styles.rest} aria-label={t("No hit played")}><span aria-hidden="true">·</span></span>}</td>})}</tr> : null}
        </Fragment>;
      })}</tbody>
    </table>
  </div>;
}

export function RhythmEarTraining() {
  const { profileId, hydrated } = useProgress();
  return hydrated ? <EarTrainingSession key={profileId} profileId={profileId} /> : <p role="status">Loading ear training…</p>;
}

function EarTrainingSession({ profileId }: { profileId: string }) {
  const { t } = useLocalization();
  const [level, setLevel] = useState<EarLevel>("pulse");
  const [mode, setMode] = useState<EarMode>("play");
  const [bpm, setBpm] = useState(80);
  const [phraseBars, setPhraseBars] = useState<1 | 2>(1);
  const [meter, setMeter] = useState<EarMeter>("4/4");
  const [feel, setFeel] = useState<EarFeel>("straight");
  const [countInBars, setCountInBars] = useState<0 | 1 | 2>(1);
  const [adaptive, setAdaptive] = useState(true);
  const [planScores, setPlanScores] = useState<number[] | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [previewSpeed, setPreviewSpeed] = useState<75 | 100>(75);
  const [previewVoice, setPreviewVoice] = useState<Instrument | "all">("all");
  const [exercise, setExercise] = useState<EarExercise | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [beat, setBeat] = useState(0);
  const [listens, setListens] = useState(0);
  const [assisted, setAssisted] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<ReturnType<typeof scoreEarAttempt> | null>(null);
  const [history, setHistory] = useState<EarResult[]>([]);
  const [message, setMessage] = useState("");
  const audio = useRef<DrumAudio | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const capture = useRef<{ start: number; end: number; hits: EarAttempt[] } | null>(null);
  const historyRef = useRef<EarResult[]>([]);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const storageKey = learnerStorageKey(EAR_HISTORY_KEY, profileId);
  const planStorageKey = learnerStorageKey("drum-hero:ear-training-plan:v1", profileId);
  const busy = ["loading", "listening", "preview", "count-in", "playing"].includes(phase);

  const stop = useCallback(() => {
    generation.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (ticker.current !== null) clearInterval(ticker.current);
    ticker.current = null;
    capture.current = null;
    audio.current?.close();
    audio.current = null;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        historyRef.current = parseEarHistory(localStorage.getItem(storageKey));
        setHistory(historyRef.current);
        const savedPlan: unknown = JSON.parse(localStorage.getItem(planStorageKey) ?? "null");
        if (savedPlan && typeof savedPlan === "object" && "version" in savedPlan && savedPlan.version === 1 && "day" in savedPlan && savedPlan.day === localDayKey() && "scores" in savedPlan && Array.isArray(savedPlan.scores) && savedPlan.scores.length <= 5 && savedPlan.scores.every((score: unknown) => Number.isFinite(score) && Number(score) >= 0 && Number(score) <= 100)) setPlanScores(savedPlan.scores as number[]);
      } catch { setMessage(t("Local history is unavailable. You can still practice.")); }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, planStorageKey, t]);

  useEffect(() => {
    const interrupt = () => {
      if (document.hidden) {
        stop();
      setPhase(current => ["loading", "listening", "preview", "count-in", "playing"].includes(current) ? "ready" : current);
      }
    };
    document.addEventListener("visibilitychange", interrupt);
    return () => { document.removeEventListener("visibilitychange", interrupt); stop(); };
  }, [stop]);

  useEffect(() => { if (phase === "results") resultHeading.current?.focus(); }, [phase]);

  const hit = useCallback((instrument: Instrument) => {
    const round = capture.current;
    const now = performance.now();
    if (!round || now < round.start - 100 || now > round.end + 100) return;
    round.hits.push({ instrument, atMs: now - round.start });
    audio.current?.hit(instrument);
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, select, textarea, [contenteditable=true], a, summary") || (target?.closest("button") && !target.closest("[data-ear-pad]"))) return;
      const pad = pads.find(pad => pad.code === event.code && (level === "groove" || pad.voice === "snare"));
      if (pad && capture.current) { event.preventDefault(); hit(pad.voice); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [hit, level]);

  const save = useCallback((score: number, skills: EarSkill[], modeOverride = mode, trainingExercise = exercise) => {
    const entry: EarResult = { id: crypto.randomUUID(), playedAt: new Date().toISOString(), level, mode: modeOverride, score, replays: Math.max(0, listens - 1), assisted, skills, meter: trainingExercise?.meter ?? meter, feel: trainingExercise?.feel ?? feel, bars: trainingExercise?.bars ?? phraseBars };
    const next = [...historyRef.current, entry].slice(-100);
    historyRef.current = next;
    setHistory(next);
    if (!assisted) setLastScore(score);
    const nextPlanScores = !assisted && planScores && planScores.length < 5 ? [...planScores, score] : planScores;
    if (nextPlanScores !== planScores) setPlanScores(nextPlanScores);
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, results: next })); }
    catch { setMessage(t("This result could not be saved. You can keep practicing.")); }
    if (nextPlanScores !== planScores) {
      try { localStorage.setItem(planStorageKey, JSON.stringify({ version: 1, day: localDayKey(), scores: nextPlanScores })); } catch { /* The session can continue if daily plan storage is unavailable. */ }
    }
  }, [level, mode, meter, feel, exercise, phraseBars, listens, assisted, planScores, storageKey, planStorageKey, t]);

  const newExercise = useCallback((nextLevel = level, options: { meter?: EarMeter; feel?: EarFeel; bars?: 1 | 2 } = { meter, feel, bars: phraseBars }, exerciseMode = mode) => {
    stop();
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const targetOptions = {
      meter: exerciseMode === "meter" ? EAR_METERS[seed % EAR_METERS.length]! : options.meter ?? meter,
      feel: exerciseMode === "feel" ? EAR_FEELS[(seed >>> 8) % EAR_FEELS.length]! : options.feel ?? feel,
      bars: options.bars ?? phraseBars,
    };
    const next = createEarExercise(nextLevel, seed, exercise?.pattern.id, targetOptions);
    setExercise(next); setPhase("ready"); setListens(0); setAssisted(false); setSelected(null); setResult(null); setLastScore(null); setMessage("");
    return next;
  }, [level, mode, meter, feel, phraseBars, exercise, stop]);

  const prepareAudio = useCallback(async () => {
    stop();
    const token = generation.current;
    setPhase("loading"); setMessage("");
    try {
      const player = createDrumAudio();
      audio.current = player;
      if (!player) throw new Error("Audio unavailable");
      player.setClickSound("woodblock");
      const ready = await player.ready;
      if (generation.current !== token) return null;
      if (!ready) throw new Error("Missing samples");
      return player;
    } catch {
      if (generation.current !== token) return null;
      stop(); setPhase("ready");
      setMessage(t("Drum sounds could not load. Check your audio connection and try Listen again."));
      return null;
    }
  }, [stop, t]);

  const listen = useCallback(async () => {
    const current = exercise ?? newExercise(level, { meter, feel });
    if (!exercise) setExercise(current);
    const player = await prepareAudio();
    if (!player) return;
    setListens(count => count + 1);
    setPhase("listening");
    const currentMeter = current.meter;
    const countDuration = countInDurationMs(bpm, currentMeter, countInBars);
    const countPulseMs = countInPulseMs(bpm, currentMeter);
    const countStart = performance.now() + 120;
    const phraseStart = countStart + countDuration;
    for (let i = 0; i < countInBars * countInPulses(currentMeter); i++) player.scheduleClick(countStart + i * countPulseMs, i % countInPulses(currentMeter) === 0);
    for (const note of current.pattern.hits) player.scheduleHit(note.instrument, phraseStart + note.step * stepDurationMs(bpm, current.pattern.subdivision) + earHitOffsetMs(note.step, bpm, current.pattern.subdivision, current.feel));
    timers.current.push(setTimeout(() => { player.silence(); setPhase("answer"); }, 120 + countDuration + earBarDurationMs(current.pattern, bpm) + 150));
  }, [exercise, level, meter, feel, countInBars, newExercise, prepareAudio, bpm]);

  const playAnswer = useCallback(async () => {
    if (!exercise) return;
    const player = await prepareAudio();
    if (!player) return;
    const countStart = performance.now() + 120;
    const currentMeter = exercise.meter;
    const pulseMs = countInPulseMs(bpm, currentMeter);
    const pulseCount = countInPulses(currentMeter);
    const countDuration = countInDurationMs(bpm, currentMeter, countInBars);
    const start = countStart + countDuration;
    const duration = earBarDurationMs(exercise.pattern, bpm);
    capture.current = { start, end: start + duration, hits: [] };
    setPhase("count-in"); setBeat(0);
    for (let i = 0; i < countInBars * pulseCount; i++) player.scheduleClick(countStart + i * pulseMs, i % pulseCount === 0);
    ticker.current = countInBars ? setInterval(() => { setBeat(Math.max(0, Math.min(pulseCount, Math.floor((performance.now() - countStart) / pulseMs) + 1))); }, 40) : null;
    timers.current.push(setTimeout(() => {
      if (ticker.current !== null) clearInterval(ticker.current);
      ticker.current = null; setPhase("playing");
    }, 120 + countDuration));
    timers.current.push(setTimeout(() => {
      const scored = scoreEarAttempt(exercise.pattern, bpm, capture.current?.hits ?? [], exercise.feel);
      capture.current = null; player.silence(); setResult(scored); save(scored.summary.score, skillsForEarPattern(exercise.pattern, level, exercise), mode, exercise); setPhase("results");
    }, 120 + countDuration + duration + 101));
  }, [exercise, prepareAudio, bpm, countInBars, save, level, mode]);

  function choose(index: number) {
    if (!exercise || phase !== "answer") return;
    const correct = mode === "meter" ? EAR_METERS[index] === exercise.meter : mode === "feel" ? EAR_FEELS[index] === exercise.feel : index === exercise.answer;
    setSelected(index); save(correct ? 100 : 0, skillsForEarPattern(exercise.pattern, level, exercise), mode, exercise); setPhase("results");
  }

  const preview = useCallback(async () => {
    if (!exercise) return;
    setAssisted(true);
    const player = await prepareAudio();
    if (!player) return;
    setPhase("preview");
    const playbackBpm = Math.round(bpm * previewSpeed / 100);
    const countDuration = countInDurationMs(playbackBpm, exercise.meter, countInBars);
    const countPulseMs = countInPulseMs(playbackBpm, exercise.meter);
    const countStart = performance.now() + 120;
    const phraseStart = countStart + countDuration;
    for (let index = 0; index < countInBars * countInPulses(exercise.meter); index++) player.scheduleClick(countStart + index * countPulseMs, index % countInPulses(exercise.meter) === 0);
    for (const note of exercise.pattern.hits) if (previewVoice === "all" || note.instrument === previewVoice) player.scheduleHit(note.instrument, phraseStart + note.step * stepDurationMs(playbackBpm, exercise.pattern.subdivision) + earHitOffsetMs(note.step, playbackBpm, exercise.pattern.subdivision, exercise.feel));
    timers.current.push(setTimeout(() => { player.silence(); setPhase("answer"); }, 120 + countDuration + earBarDurationMs(exercise.pattern, playbackBpm) + 150));
  }, [exercise, prepareAudio, bpm, previewSpeed, previewVoice, countInBars]);

  const visiblePads = pads.filter(pad => level === "groove" || pad.voice === "snare");
  const recent = history.filter(item => item.level === level && item.mode === mode && !item.assisted).slice(-10);
  const recommendation = recommendedEarLevel(history);
  const skillAverages = (Object.keys(skillLabels) as EarSkill[]).flatMap(skill => {
    const attempts = history.filter(item => !item.assisted && item.skills?.includes(skill)).slice(-10);
    return attempts.length ? [{ skill, average: Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length), count: attempts.length }] : [];
  });
  const correct = selected !== null && (mode === "meter" ? EAR_METERS[selected] === exercise?.meter : mode === "feel" ? EAR_FEELS[selected] === exercise?.feel : selected === exercise?.answer);
  const selectedAnswer = selected === null ? "" : mode === "meter" ? EAR_METERS[selected]! : mode === "feel" ? EAR_FEELS[selected]! : String.fromCharCode(65 + selected);
  const correctAnswer = mode === "meter" ? exercise?.meter ?? "" : mode === "feel" ? exercise?.feel ?? "" : String.fromCharCode(65 + (exercise?.answer ?? 0));
  const wrongPattern = selected !== null && mode === "identify" && !correct ? exercise?.choices[selected] : undefined;
  const answerExplanation = exercise ? explainEarAnswer(exercise.pattern, result?.rated ?? [], wrongPattern) : "";
  const modeExplanation = mode === "meter"
    ? `The bar is ${exercise?.meter}. ${exercise?.meter === "6/8" ? "Feel two broad pulses, each divided into three." : exercise?.meter === "3/4" ? "Feel three quarter-note pulses in each bar." : "Feel four quarter-note pulses in each bar."}`
    : mode === "feel" ? `The groove is ${exercise?.feel}. ${exercise?.feel === "straight" ? "The subdivisions are even." : exercise?.feel === "swing" ? "The offbeat eighth notes are delayed for a light long-short feel." : "The offbeat notes lean into a broader triplet shuffle."}` : "";
  const status = phase === "loading" ? "Loading drum sounds…" : phase === "listening" ? countInBars ? `Listen: ${countInBars} ${countInBars === 1 ? "count-in bar" : "count-in bars"}, then a ${phraseBars}-bar phrase. Remember the rhythm.` : `Listen: a ${phraseBars}-bar phrase. Remember the rhythm.` : phase === "preview" ? "Focused preview: listen for the selected drum voice." : phase === "count-in" ? "Get ready" : phase === "playing" ? `Your turn — play ${phraseBars === 1 ? "one bar" : "two bars"} from memory.` : phase === "answer" ? mode === "play" ? "Ready? Take the count-in, then play it back." : mode === "identify" ? "Which rhythm did you hear?" : mode === "meter" ? "Which meter did you hear?" : "Which feel did you hear?" : "Listen first. The rhythm stays hidden until you answer.";

  const continuePractice = () => {
    const nextRecommendation = adaptive ? recommendedEarLevel(historyRef.current) : null;
    const inPlan = planScores !== null && planScores.length < 5;
    const nextMode = inPlan && nextRecommendation ? modeForSkill(nextRecommendation.skill) : mode;
    const nextLevel = adaptive ? adaptiveEarLevel(historyRef.current, level, nextMode) : level;
    if (adaptive && lastScore !== null) setBpm(current => Math.max(40, Math.min(140, current + (lastScore >= 85 ? 5 : lastScore < 60 ? -5 : 0))));
    const nextPhraseBars = adaptive && lastScore !== null ? lastScore >= 90 ? 2 : lastScore < 55 ? 1 : phraseBars : phraseBars;
    if (adaptive && lastScore !== null && nextPhraseBars !== phraseBars) setPhraseBars(nextPhraseBars);
    if (nextMode !== mode) setMode(nextMode);
    if (nextRecommendation || nextLevel !== level) setLevel(nextLevel);
    newExercise(nextLevel, { meter, feel, bars: nextPhraseBars }, nextMode);
  };

  const startPracticePlan = () => {
    setPlanScores([]);
    setAdaptive(true);
    try { localStorage.setItem(planStorageKey, JSON.stringify({ version: 1, day: localDayKey(), scores: [] })); } catch { /* The in-memory plan remains usable. */ }
    const focus = recommendation;
    if (focus) setLevel(focus.level);
    const focusMode = focus ? modeForSkill(focus.skill) : mode;
    if (focusMode !== mode) setMode(focusMode);
    newExercise(focus?.level ?? level, { meter, feel }, focusMode);
  };

  return <div className={styles.layout}>
    <section className={`card ${styles.console}`} aria-label={t("Rhythm ear training")}>
      <div className={styles.settings}>
        <label>{t("Exercise")}<select value={mode} disabled={busy} onChange={event => { const value = event.target.value as EarMode; setMode(value); newExercise(level, { meter, feel }, value); }}><option value="play">{t("Listen and tap back")}</option><option value="identify">{t("Match the rhythm")}</option><option value="meter">{t("Name the meter")}</option><option value="feel">{t("Identify the feel")}</option></select></label>
        <label>{t("Difficulty")}<select value={level} disabled={busy} onChange={event => { const value = event.target.value as EarLevel; setLevel(value); newExercise(value, { meter, feel }); }}>{EAR_LEVELS.map(item => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label>
        {mode === "meter" ? <div className={styles.settingNote}><strong>{t("Meter")}</strong><span>{t("Mixed · 4/4, 3/4, 6/8")}</span></div> : <label>{t("Meter")}<select value={meter} disabled={busy} onChange={event => { const value = event.target.value as EarMeter; setMeter(value); newExercise(level, { meter: value, feel }); }}>{EAR_METERS.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>}
        {mode === "feel" ? <div className={styles.settingNote}><strong>{t("Feel")}</strong><span>{t("Mixed · straight, swing, shuffle")}</span></div> : <label>{t("Feel")}<select value={feel} disabled={busy} onChange={event => { const value = event.target.value as EarFeel; setFeel(value); newExercise(level, { meter, feel: value }); }}><option value="straight">{t("Straight")}</option><option value="swing">{t("Swing · light")}</option><option value="shuffle">{t("Shuffle · triplet")}</option></select></label>}
        <label>{t("Phrase length")}<select value={phraseBars} disabled={busy} onChange={event => { const value = Number(event.target.value) as 1 | 2; setPhraseBars(value); newExercise(level, { meter, feel, bars: value }); }}><option value={1}>{t("1 bar")}</option><option value={2}>{t("2 bars")}</option></select></label>
        <label>{t("Tempo")} · {bpm} BPM<input type="range" aria-label={t("Tempo")} min={40} max={140} step={5} value={bpm} disabled={busy} onChange={event => { setBpm(Number(event.target.value)); newExercise(level, { meter, feel }); }} /></label>
        <label>{t("Count-in")}<select value={countInBars} disabled={busy} onChange={event => setCountInBars(Number(event.target.value) as 0 | 1 | 2)}><option value={0}>{t("Off")}</option><option value={1}>{t("1 bar")}</option><option value={2}>{t("2 bars")}</option></select></label>
        <label className={styles.toggle}><input type="checkbox" checked={adaptive} disabled={busy} onChange={event => setAdaptive(event.target.checked)} />{t("Adaptive level and tempo")}</label>
      </div>
      <p className={styles.description}>{t(EAR_LEVELS.find(item => item.id === level)!.description)} {t(phraseBars === 1 ? "1 bar phrase" : "2 bar phrase")} · {t(mode === "meter" ? "mixed meter" : meter)} · {t(mode === "feel" ? "mixed feel" : feel)} · {t(countInBars ? `${countInBars} bar count-in` : "count-in off")}</p>
      <div className={styles.stage}>
        <span className="eyebrow">{t(phase === "results" ? "Review" : "Listen → Remember → Answer")}</span>
        <h2>{t(phase === "results" ? "Hear what happened" : "Trust your ears")}</h2>
        <p role="status" aria-live="polite">{t(phase === "results" ? "Compare the rhythm, then try again or hear something new." : status)}</p>
        {phase === "count-in" && countInBars > 0 ? <strong className={styles.count} aria-label={t("Count-in")}>{beat || "…"}</strong> : null}
        {phase !== "results" ? <div className={styles.hiddenPattern}><span aria-hidden="true">♫</span><p>{t("Target rhythm hidden")}</p><small>{t("No note-following clues. Listen for hits, rests, and the spaces between them.")}</small></div> : null}
        <div className={styles.actions}>
          {phase !== "results" ? <button className="button" disabled={busy} onClick={() => void listen()}>{t(listens ? "Listen again" : "Listen to rhythm")}</button> : null}
          {phase === "answer" ? <button className="button-secondary" onClick={() => void preview()}>{t("Preview with focus")}</button> : null}
          {phase === "answer" && mode === "play" ? <button className="button-secondary" onClick={event => { event.currentTarget.blur(); void playAnswer(); }}>{t("Play my answer")}</button> : null}
          {busy ? <button className="button-secondary" onClick={() => { stop(); setPhase(listens ? "answer" : "ready"); setMessage(t("Stopped. Start again when you are ready.")); }}>{t("Stop")}</button> : null}
          {phase === "answer" ? <button className="button-secondary" onClick={() => { setAssisted(true); setPhase("results"); }}>{t("Reveal rhythm")}</button> : null}
        </div>
        {listens > 0 ? <small>{t("Listens")}: {listens} · {t("Replay as often as you need.")}</small> : null}
        {phase === "answer" ? <div className={styles.previewControls} aria-label={t("Listening preview controls")}>
          <label>{t("Preview speed")}<select value={previewSpeed} onChange={event => setPreviewSpeed(Number(event.target.value) as 75 | 100)}><option value={75}>{t("Slower · 75%")}</option><option value={100}>{t("Original · 100%")}</option></select></label>
          {level === "groove" ? <label>{t("Hear a voice")}<select value={previewVoice} onChange={event => setPreviewVoice(event.target.value as Instrument | "all")}><option value="all">{t("All voices")}</option>{pads.map(pad => <option value={pad.voice} key={pad.voice}>{t(pad.label)}</option>)}</select></label> : null}
          <small>{t("A focused preview helps you study the rhythm. It marks this attempt as assisted.")}</small>
        </div> : null}
        {message ? <p role="status">{message}</p> : null}
      </div>
      {mode === "play" ? <div className={styles.pads} aria-label={t("Answer pads")}>
        {visiblePads.map(pad => <button data-ear-pad key={pad.voice} className={styles.pad} disabled={phase !== "playing" && phase !== "count-in"} onPointerDown={event => { event.preventDefault(); hit(pad.voice); }} onClick={event => { if (event.detail === 0) hit(pad.voice); }}><strong>{t(pad.label)}</strong><kbd>{pad.key}</kbd></button>)}
        <small>{t(`Use keys or touch. Play ${phraseBars === 1 ? "one bar" : "two bars"} from memory. Timing: Great ≤ 50 ms, Good ≤ 100 ms.`)}</small>
      </div> : null}
      {mode === "identify" && phase === "answer" && exercise ? <fieldset className={styles.choices}><legend>{t("Choose the rhythm you heard")}</legend>{exercise.choices.map((pattern, index) => <div className={styles.choice} key={pattern.id}><button className="button-secondary" onClick={() => choose(index)}>{t("Choose")} {String.fromCharCode(65 + index)}</button><RhythmGrid pattern={pattern} meter={meter} label={`${t("Option")} ${String.fromCharCode(65 + index)}`} /></div>)}</fieldset> : null}
      {(mode === "meter" || mode === "feel") && phase === "answer" && exercise ? <fieldset className={styles.quizChoices}><legend>{t(mode === "meter" ? "Choose the meter you heard" : "Choose the feel you heard")}</legend>{(mode === "meter" ? EAR_METERS : EAR_FEELS).map((option, index) => <button className="button-secondary" key={option} onClick={() => choose(index)}>{t(option)}</button>)}</fieldset> : null}
      {phase === "results" && exercise ? <section className={styles.results} aria-label={t("Ear training results")}>
        <h3 ref={resultHeading} tabIndex={-1}>{t(selected !== null ? correct ? "Correct rhythm!" : "Listen for the difference" : result ? "Your rhythm recap" : "Rhythm revealed")}</h3>
        {result ? <><p className={styles.score}>{result.summary.score}<small>/100</small></p><p>{t("Rhythm placement")}: {result.summary.placementScore}% · {t("Timing")}: {result.summary.timingScore}%</p><p>{t("Great")}: {result.summary.great} · {t("Good")}: {result.summary.good} · {t("Missed")}: {result.summary.miss} · {t("Extra")}: {result.summary.extra}</p><p>{t(answerExplanation)}</p></> : null}
        {selected !== null && (mode === "meter" || mode === "feel") ? <><p>{t("Your choice")}: {t(selectedAnswer)} · {t("Answer")}: {t(correctAnswer)}</p><p>{t(modeExplanation)}</p></> : null}
        {selected !== null && mode === "identify" && !correct ? <p>{t(answerExplanation)}</p> : null}
        <RhythmGrid pattern={exercise.pattern} meter={exercise.meter} label={t("Target rhythm")} response={result?.rated} />
        {selected !== null && !correct && mode === "identify" ? <RhythmGrid pattern={exercise.choices[selected]!} meter={meter} label={t("Your chosen rhythm")} /> : null}
        {result ? <details><summary>{t("Hit timing details")}</summary><ul>{result.rated.map((hit, index) => <li key={index}>{t(pads.find(pad => pad.voice === hit.instrument)?.label ?? hit.instrument)} · {t(({ great: "Great", good: "Good", miss: "Missed", extra: "Extra" })[hit.rating])}{hit.offsetMs !== null ? ` · ${hit.offsetMs > 0 ? "+" : ""}${hit.offsetMs} ms` : ""}</li>)}</ul></details> : null}
        <div className={styles.actions}><button className="button" onClick={continuePractice}>{t(planScores && planScores.length < 5 ? "Next plan drill" : "Next rhythm")}</button><button className="button-secondary" onClick={() => { stop(); setAssisted(true); setSelected(null); setResult(null); setPhase("ready"); }}>{t("Retry this rhythm")}</button></div>
        <small>{t("Retries after seeing the answer are practice and stay out of your first-attempt average.")}</small>
      </section> : null}
    </section>
    <aside className={`card ${styles.sidebar}`} aria-label={t("Ear training progress")}>
      <span className="eyebrow">{t("Your listening practice")}</span><h3>{t("Hear it. Hold it. Play it.")}</h3>
      <ol><li>{t("Listen to the count-in and the rhythm phrase.")}</li><li>{t("Remember the rhythm without looking at notes.")}</li><li>{t(mode === "play" ? "Tap it back on the drum pads or use Space, F, and J." : mode === "meter" ? "Name the time signature from the pulse grouping." : mode === "feel" ? "Listen for even notes or a long-short swing." : "Choose the matching rhythm grid.")}</li><li>{t("Review placement and timing, then keep practicing.")}</li></ol>
      <div className={styles.stat}><strong>{recent.length ? `${Math.round(recent.reduce((sum, item) => sum + item.score, 0) / recent.length)}%` : "—"}</strong><span>{t("Average of your last 10 first attempts at this exercise and difficulty")}</span></div>
      <section className={styles.practicePlan} aria-label={t("Five-drill practice plan")}><h4>{t("Daily focused practice plan")}</h4>{planScores === null || planScores.length >= 5 ? <><p>{t(planScores?.length === 5 ? `Today's five drills are complete · average ${Math.round(planScores.reduce((sum, score) => sum + score, 0) / 5)}%.` : recommendation ? `Five short drills will focus on ${skillLabels[recommendation.skill].toLowerCase()}, with tempo adjusted from your results.` : "Complete five short drills. Tempo and difficulty adapt as your first-attempt scores come in.")}</p><button className="button-secondary" disabled={busy} onClick={startPracticePlan}>{t(planScores?.length === 5 ? "Start another five-drill plan" : "Start five-drill plan")}</button></> : <><p>{t(`Plan progress: ${planScores.length} of 5 drills · average ${Math.round(planScores.reduce((sum, score) => sum + score, 0) / Math.max(1, planScores.length))}%.`)}</p><progress max={5} value={planScores.length} aria-label={t("Practice plan progress")} /></>}</section>
      <section className={styles.skillProgress} aria-label={t("Listening skill progress")}><h4>{t("Skills you are training")}</h4>{skillAverages.length ? <ul>{skillAverages.map(item => <li key={item.skill}><span>{t(skillLabels[item.skill])}</span><strong>{item.average}%</strong><small>{item.count} {t("first attempts")}</small></li>)}</ul> : <p>{t("Your listening skill breakdown will appear after your first few attempts.")}</p>}</section>
      <section className={styles.recommendation} aria-label={t("Practice recommendation")}><h4>{t("Suggested focus")}</h4>{recommendation ? <><p>{t(skillLabels[recommendation.skill])} · {recommendation.average}% {t("across your recent first attempts")}</p><button className="button-secondary" disabled={busy} onClick={() => { const focusMode = modeForSkill(recommendation.skill); setLevel(recommendation.level); setMode(focusMode); newExercise(recommendation.level, { meter, feel }, focusMode); }}>{t("Practice this focus")} · {t(EAR_LEVELS.find(item => item.id === recommendation.level)!.label)}</button></> : <p>{t("Complete three unassisted first attempts in a skill to get a focused recommendation.")}</p>}</section>
      <p>{history.length} {t("saved attempts on this learner profile")}</p><p>{t("Ear training history stays on this device, separate from Trainer mastery. Full local backups include it.")}</p>
      {history.length ? <button className="button-secondary" onClick={() => { if (window.confirm(t("Clear ear training history for this learner?"))) { try { localStorage.removeItem(storageKey); localStorage.removeItem(planStorageKey); historyRef.current = []; setHistory([]); setPlanScores(null); } catch { setMessage(t("History could not be cleared.")); } } }}>{t("Clear ear training history")}</button> : null}
    </aside>
  </div>;
}
