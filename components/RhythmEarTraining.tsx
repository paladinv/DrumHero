"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createDrumAudio, type DrumAudio } from "@/lib/audio";
import { adaptiveEarLevel, createEarComparison, createEarExercise, earBarDurationMs, earHitOffsetMs, earMeterGroups, earPatternBank, EAR_FEELS, EAR_GROOVE_STYLES, EAR_GROOVE_LESSONS, EAR_HISTORY_KEY, EAR_LEVELS, EAR_METERS, EAR_REVIEW_KEY, EAR_TEACHER_REPORTS_KEY, explainEarAnswer, parseEarChallengePack, parseEarChallengePacks, parseEarHistory, parseEarReviewSchedule, parseEarTeacherReport, parseEarTeacherReports, recommendedEarLevel, scoreEarAttempt, scoreEarDictation, skillsForEarPattern, updateEarReviewSchedule, type EarAssignment, type EarAttempt, type EarChallengeItem, type EarChallengePack, type EarChallengePackPayload, type EarExercise, type EarFeel, type EarGrooveStyle, type EarLevel, type EarMeter, type EarMode, type EarResult, type EarReviewItem, type EarSkill, type EarTeacherReport, type EarTimingCell, type EarVoiceStats } from "@/lib/ear-training";
import { learnerStorageKey } from "@/lib/learner-profiles";
import { stepDurationMs } from "@/lib/scoring";
import { trainerPatternMidi } from "@/lib/trainer-midi";
import type { Instrument, PatternHit, PracticePattern } from "@/lib/types";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";
import styles from "./RhythmEarTraining.module.css";
import { TrainerNotationView } from "./TrainerNotationView";

type Phase = "ready" | "loading" | "listening" | "preview" | "recall-delay" | "answer" | "locate" | "count-in" | "playing" | "results";
const pads: Array<{ voice: Instrument; label: string; code: string; key: string }> = [
  { voice: "kick", label: "Kick", code: "Space", key: "Space" },
  { voice: "snare", label: "Snare", code: "KeyF", key: "F" },
  { voice: "hihat", label: "Hi-hat", code: "KeyJ", key: "J" },
  { voice: "tom", label: "Tom", code: "KeyT", key: "T" },
  { voice: "crash", label: "Crash", code: "KeyY", key: "Y" },
];

const skillLabels: Record<EarSkill, string> = { rests: "Hearing rests", offbeats: "Hearing offbeats", "sixteenth-notes": "Sixteenth-note spacing", triplets: "Triplet timing", syncopation: "Groove syncopation", "voice-separation": "Separating drum voices", meter: "Recognizing meter", swing: "Hearing swing and shuffle", "error-detection": "Finding rhythmic changes", "pulse-stability": "Holding the pulse through silence", "cross-rhythm": "Hearing cross-rhythms", quintuplets: "Hearing quintuplets", "tempo-control": "Holding tempo as it changes" };
const timingLabels = { great: "Great", good: "Good", miss: "Missed", extra: "Extra" } as const;
const DEFAULT_EAR_MIDI_MAP: Record<Instrument, number> = { kick: 36, snare: 38, hihat: 42, tom: 50, crash: 49 };
type EarMidiMaps = Record<string, Partial<Record<Instrument, number>>>;

function parseEarMidiMaps(raw: string | null): EarMidiMaps {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).slice(0, 20).flatMap(([key, rawMap]) => {
      if (!key || key.length > 80 || !rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return [];
      const map: Partial<Record<Instrument, number>> = {};
      const used = new Set<number>();
      for (const voice of Object.keys(DEFAULT_EAR_MIDI_MAP) as Instrument[]) {
        const note = (rawMap as Record<string, unknown>)[voice];
        if (Number.isInteger(note) && Number(note) >= 0 && Number(note) <= 127 && !used.has(Number(note))) {
          map[voice] = Number(note);
          used.add(Number(note));
        }
      }
      if (new Set(Object.values({ ...DEFAULT_EAR_MIDI_MAP, ...map })).size !== Object.keys(DEFAULT_EAR_MIDI_MAP).length) return [];
      return [[key, map]];
    }));
  } catch { return {}; }
}

function timingCellsForPattern(pattern: PracticePattern, meter: EarMeter, rated: ReturnType<typeof scoreEarAttempt>["rated"]): EarTimingCell[] {
  const subdivisionsPerQuarter = pattern.subdivision / 4;
  const stepsPerBar = earMeterGroups(meter).reduce((sum, group) => sum + group, 0) * subdivisionsPerQuarter;
  const cells = new Map<string, EarTimingCell & { offsets: number[] }>();
  for (const hit of rated) {
    const stepInBar = (hit.step ?? 0) % stepsPerBar;
    const beat = Math.floor(stepInBar / subdivisionsPerQuarter) + 1;
    const subdivision = stepInBar % subdivisionsPerQuarter + 1;
    const key = `${beat}:${subdivision}`;
    const cell = cells.get(key) ?? { beat, subdivision, expected: 0, matched: 0, missed: 0, extra: 0, meanOffsetMs: null, offsets: [] };
    if (hit.rating === "extra") cell.extra += 1;
    else {
      cell.expected += 1;
      if (hit.rating === "miss") cell.missed += 1;
      else {
        cell.matched += 1;
        if (hit.offsetMs !== null) cell.offsets.push(hit.offsetMs);
      }
    }
    cells.set(key, cell);
  }
  return [...cells.values()].map(({ offsets, ...cell }) => ({ ...cell, meanOffsetMs: offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null })).sort((a, b) => a.beat - b.beat || a.subdivision - b.subdivision);
}

function downloadJsonFile(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function countInPulseDurations(bpm: number, meter: EarMeter) { return earMeterGroups(meter).map(group => 60_000 / bpm * group); }
function countInDurationMs(bpm: number, meter: EarMeter, bars: number) { return countInPulseDurations(bpm, meter).reduce((sum, duration) => sum + duration, 0) * bars; }
function countInBeatAt(elapsedMs: number, bpm: number, meter: EarMeter, bars: number) {
  const pulses = countInPulseDurations(bpm, meter);
  const barMs = pulses.reduce((sum, duration) => sum + duration, 0);
  const elapsed = Math.max(0, elapsedMs % (barMs * bars));
  let boundary = 0;
  for (let index = 0; index < pulses.length; index++) { boundary += pulses[index]!; if (elapsed < boundary) return index + 1; }
  return pulses.length;
}
function scheduleCountIn(player: DrumAudio, start: number, bpm: number, meter: EarMeter, bars: number) {
  const pulses = countInPulseDurations(bpm, meter);
  const barDuration = pulses.reduce((sum, duration) => sum + duration, 0);
  for (let bar = 0; bar < bars; bar++) {
    let offset = 0;
    for (let pulse = 0; pulse < pulses.length; pulse++) { player.scheduleClick(start + bar * barDuration + offset, pulse === 0); offset += pulses[pulse]!; }
  }
}
function localDayKey() { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`; }
function modeForSkill(skill: EarSkill): EarMode { return skill === "meter" ? "meter" : skill === "swing" ? "feel" : skill === "voice-separation" ? "voice" : skill === "syncopation" ? "identify" : skill === "error-detection" ? "error" : "play"; }
function levelForSkill(skill: EarSkill): EarLevel { return skill === "triplets" || skill === "swing" || skill === "quintuplets" ? "triplet" : skill === "voice-separation" || skill === "syncopation" || skill === "cross-rhythm" ? "groove" : skill === "sixteenth-notes" ? "rhythm" : "pulse"; }
type PlanFocus = "automatic" | EarSkill;
type SessionLength = 3 | 5 | 10;
type RecallSupport = "guided" | "faded" | "challenge";
type EarInputMode = "pads" | "microphone" | "midi";
type EarTimingProfile = { offsetMs: number; spreadMs: number; calibratedAt: string };
type EarTimingProfiles = Record<string, EarTimingProfile>;
type EarCalibrationCapture = { start: number; end: number; expected: number[]; taps: number[]; profileKey: string };
type MicCapture = { stream: MediaStream; context: AudioContext; analyser: AnalyserNode; data: Float32Array<ArrayBuffer>; frame: number; lastHit: number };
type EarMidiMessage = { data?: Uint8Array };
type EarMidiInput = { id?: string; name?: string; onmidimessage: ((event: EarMidiMessage) => void) | null };
type EarMidiAccess = { inputs: { values: () => IterableIterator<EarMidiInput> } };

function parseEarTimingProfiles(raw: string | null): EarTimingProfiles {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).slice(0, 20).flatMap(([key, entry]) => {
      if (!key || key.length > 80 || !entry || typeof entry !== "object") return [];
      const profile = entry as Partial<EarTimingProfile>;
      return Number.isFinite(profile.offsetMs) && Math.abs(Number(profile.offsetMs)) <= 200
        && Number.isFinite(profile.spreadMs) && Number(profile.spreadMs) >= 0 && Number(profile.spreadMs) <= 240
        && typeof profile.calibratedAt === "string" && Number.isFinite(Date.parse(profile.calibratedAt))
        ? [[key, { offsetMs: Number(profile.offsetMs), spreadMs: Number(profile.spreadMs), calibratedAt: profile.calibratedAt }]] : [];
    }));
  } catch { return {}; }
}

function midiProfileKey(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return `midi-${(hash >>> 0).toString(36)}`;
}

function closeMidiInputs(inputs: EarMidiInput[]) {
  inputs.forEach(input => { input.onmidimessage = null; });
  inputs.length = 0;
}
function closeMicCapture(mic: MicCapture | null) {
  if (!mic) return;
  cancelAnimationFrame(mic.frame);
  mic.stream.getTracks().forEach(track => track.stop());
  void mic.context.close();
}

function RhythmBuilder({ onSave }: { onSave: (pattern: PracticePattern, meter: EarMeter) => void }) {
  const { t } = useLocalization();
  const [meter, setMeter] = useState<EarMeter>("4/4");
  const [subdivision, setSubdivision] = useState<8 | 16>(8);
  const [target, setTarget] = useState<PracticePattern | null>(null);
  const [draft, setDraft] = useState<PatternHit[]>([]);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const audio = useRef<DrumAudio | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beats = meter === "4/4" ? 4 : meter === "3/4" || meter === "6/8" ? 3 : meter === "5/4" ? 5 : 3.5;
  const steps = beats * subdivision / 4;
  const draftPattern: PracticePattern = { id: "ear-builder-draft", name: "Your rhythm", level: "Intermediate", description: "Your multi-voice rhythm builder answer", beats, subdivision, defaultBpm: 84, tempoRange: [40, 140], hits: draft };

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); audio.current?.close(); }, []);

  const newExample = () => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const quarter = subdivision / 4;
    const eighth = subdivision / 8;
    const count = Math.ceil(steps);
    const hits: PatternHit[] = [];
    for (let step = 0; step < count; step++) {
      const beatPosition = step / quarter;
      if (Math.abs(beatPosition - Math.round(beatPosition)) < 0.001) {
        if (Math.round(beatPosition) % 2 === 0 || step === 0) hits.push({ step, instrument: "kick", ...(step === 0 ? { accent: true } : {}) });
        else hits.push({ step, instrument: "snare" });
      }
      if (eighth > 0 && step % eighth === 0) hits.push({ step, instrument: "hihat", velocityTarget: step % quarter === 0 ? 82 : 62 });
    }
    const variations = [0, quarter, quarter * 2, quarter * 3].filter(offset => offset < count);
    const offset = variations[seed % variations.length]!;
    const selected: PracticePattern = { id: `ear-builder-example-${seed}`, name: "Three-voice example", level: "Intermediate", description: "A generated kick, snare, and hi-hat phrase.", beats, subdivision, defaultBpm: 84, tempoRange: [40, 140], hits: hits.map(hit => ({ ...hit, step: (hit.step + offset) % count })).sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)) };
    setTarget(selected);
    setDraft([]); setChecked(false); setScore(null);
  };

  const toggleCell = (instrument: Instrument, step: number) => {
    setDraft(current => {
      const existing = current.find(hit => hit.instrument === instrument && hit.step === step);
      if (!existing) return [...current, { instrument, step }].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument));
      const isGhost = existing.velocityTarget !== undefined && existing.velocityTarget < 50;
      if (!existing.accent && !isGhost) return current.map(hit => hit === existing ? { ...hit, accent: true, velocityTarget: 118 } : hit);
      if (existing.accent) return current.map(hit => hit === existing ? { ...hit, accent: false, velocityTarget: 36 } : hit);
      return current.filter(hit => hit !== existing);
    });
    setChecked(false); setScore(null);
  };

  const playPattern = async (pattern: PracticePattern) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!audio.current) {
        const player = createDrumAudio();
        if (!player || !await player.ready) throw new Error("audio unavailable");
        player.setClickSound("woodblock");
        audio.current = player;
      }
      const player = audio.current;
      player.silence();
      const start = performance.now() + 120;
      const bpm = 84;
      for (const note of pattern.hits) player.scheduleHit(note.instrument, start + note.step * stepDurationMs(bpm, pattern.subdivision), note.accent, note.velocityTarget);
      timer.current = setTimeout(() => { audio.current?.silence(); setBusy(false); }, 120 + earBarDurationMs(pattern, bpm) + 120);
    } catch {
      audio.current?.close(); audio.current = null; setBusy(false);
    }
  };

  const checkAnswer = () => {
    if (!target) return;
    const expected = new Set(target.hits.map(hit => `${hit.instrument}:${hit.step}`));
    const actual = new Set(draft.map(hit => `${hit.instrument}:${hit.step}`));
    const matches = [...expected].filter(key => actual.has(key)).length;
    const precision = matches / Math.max(1, actual.size);
    const recall = matches / Math.max(1, expected.size);
    setScore(Math.round(precision + recall === 0 ? 0 : 200 * precision * recall / (precision + recall)));
    setChecked(true);
  };

  return <section className={`card ${styles.builder}`} aria-label={t("Rhythm builder")}>
    <span className="eyebrow">{t("Hear, build, compare")}</span><h3>{t("Rhythm builder")}</h3>
    <p>{t("Listen to a short groove, build its kick, snare, and hi-hat parts, then compare your rhythm with the target. Cycle each hit through normal, accent, and ghost-note levels.")}</p>
    <div className={styles.builderControls}>
      <label>{t("Meter")}<select value={meter} disabled={busy} onChange={event => { setMeter(event.target.value as EarMeter); setTarget(null); setDraft([]); setChecked(false); setScore(null); }}>
        {EAR_METERS.map(value => <option value={value} key={value}>{t(value)}</option>)}
      </select></label>
      <label>{t("Grid spacing")}<select value={subdivision} disabled={busy} onChange={event => { setSubdivision(Number(event.target.value) as 8 | 16); setTarget(null); setDraft([]); setChecked(false); setScore(null); }}><option value={8}>{t("Eighth notes")}</option><option value={16}>{t("Sixteenth notes")}</option></select></label>
      <button className="button-secondary" disabled={busy} onClick={newExample}>{t(target ? "New example" : "Create example")}</button>
      <button className="button-secondary" disabled={busy || !target} onClick={() => target && void playPattern(target)}>{t("Hear example")}</button>
      <button className="button-secondary" disabled={busy || draft.length === 0} onClick={() => void playPattern(draftPattern)}>{t("Play my rhythm")}</button>
      <button className="button" disabled={busy || !target} onClick={checkAnswer}>{t("Compare rhythms")}</button>
      <button className="button-secondary" disabled={busy || draft.length === 0} onClick={() => onSave(draftPattern, meter)}>{t("Save built rhythm to a challenge pack")}</button>
    </div>
    {target ? <>
      <fieldset className={styles.builderGrid}><legend>{t("Tap a cell to cycle: rest, hit, accent, ghost note")}</legend>{pads.slice(0, 3).map(pad => <div className={styles.builderVoiceRow} key={pad.voice}><strong>{t(pad.label)}</strong><div className={styles.stepButtons} role="group" aria-label={`${t(pad.label)} ${t("rhythm entry grid")}`}>{Array.from({ length: steps }, (_, step) => { const hit = draft.find(note => note.instrument === pad.voice && note.step === step); const ghost = hit?.velocityTarget !== undefined && hit.velocityTarget < 50; const symbol = !hit ? "·" : ghost ? "○" : hit.accent ? ">" : "●"; const label = !hit ? t("Rest") : ghost ? t("Ghost note") : hit.accent ? t("Accent") : t("Hit"); return <button type="button" aria-pressed={Boolean(hit)} aria-label={`${t(pad.label)} · ${t("Step")} ${step + 1} · ${label}`} title={label} disabled={busy} className={`${styles.stepButton} ${hit ? styles.stepActive : ""}`} key={step} onClick={() => toggleCell(pad.voice, step)}>{symbol}</button>; })}</div></div>)}</fieldset>
      {score !== null ? <p className={styles.builderScore} role="status">{t("Rhythm match")}: <strong>{score}%</strong> · {t("Compare your grid with the target and listen again.")}</p> : null}
      {checked ? <div className={styles.builderCompare}><RhythmGrid pattern={target} meter={meter} label={t("Target example")} /><RhythmGrid pattern={draftPattern} meter={meter} label={t("Your built rhythm")} /></div> : null}
    </> : <p className={styles.builderHint}>{t("Choose a meter and create an example to begin.")}</p>}
  </section>;
}

function scorePulseChallenge(expected: number[], attempts: EarAttempt[], bpm: number) {
  const windowMs = Math.max(110, Math.min(180, 60_000 / bpm * 0.3));
  const used = new Set<number>();
  const offsets: number[] = [];
  for (const attempt of [...attempts].sort((a, b) => a.atMs - b.atMs)) {
    let closest = -1;
    let distance = Infinity;
    expected.forEach((target, index) => {
      const offset = Math.abs(attempt.atMs - target);
      if (!used.has(index) && offset < distance) { closest = index; distance = offset; }
    });
    if (closest >= 0 && distance <= windowMs) { used.add(closest); offsets.push(distance); }
  }
  const recall = used.size / Math.max(1, expected.length);
  const precision = used.size / Math.max(1, attempts.length);
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const timing = offsets.length ? 1 - offsets.reduce((sum, value) => sum + value, 0) / offsets.length / windowMs * 0.3 : 0;
  return Math.round(100 * f1 * timing);
}

function scoreTempoRamp(expected: Array<{ atMs: number; bpm: number }>, attempts: EarAttempt[]) {
  const unused = new Set(expected.map((_, index) => index));
  const offsets: number[] = [];
  for (const attempt of [...attempts].sort((a, b) => a.atMs - b.atMs)) {
    let closest = -1;
    let distance = Infinity;
    for (const index of unused) {
      const target = expected[index]!;
      const nextDistance = Math.abs(attempt.atMs - target.atMs);
      if (nextDistance < distance) { closest = index; distance = nextDistance; }
    }
    const target = closest >= 0 ? expected[closest]! : undefined;
    const windowMs = target ? Math.max(110, Math.min(180, 60_000 / target.bpm * 0.3)) : 0;
    if (target && distance <= windowMs) { unused.delete(closest); offsets.push(distance / windowMs); }
  }
  const recall = (expected.length - unused.size) / Math.max(1, expected.length);
  const precision = (expected.length - unused.size) / Math.max(1, attempts.length);
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const timing = offsets.length ? 1 - offsets.reduce((sum, value) => sum + value, 0) / offsets.length * 0.3 : 0;
  return Math.round(100 * f1 * timing);
}

function PulseDropoutTrainer({ bpm, disabled, onScore }: { bpm: number; disabled?: boolean; onScore: (score: number, meter: EarMeter, bars: 3 | 4 | 5) => void }) {
  const { t } = useLocalization();
  const [phase, setPhase] = useState<"ready" | "loading" | "playing" | "results">("ready");
  const [meter, setMeter] = useState<EarMeter>("4/4");
  const [silentBars, setSilentBars] = useState<1 | 2 | 3>(2);
  const [score, setScore] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const playerRef = useRef<DrumAudio | null>(null);
  const startRef = useRef(0);
  const hitsRef = useRef<EarAttempt[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bars = (silentBars + 2) as 3 | 4 | 5;

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); playerRef.current?.close(); }, []);

  const stop = () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; playerRef.current?.close(); playerRef.current = null; setPhase("ready"); };
  const start = async () => {
    if (["loading", "playing"].includes(phase) || disabled) return;
    stop(); setPhase("loading"); setMessage(""); setScore(null);
    try {
      const player = createDrumAudio();
      if (!player || !await player.ready) throw new Error("Audio unavailable");
      playerRef.current = player; player.setClickSound("woodblock"); player.silence();
      const startAt = performance.now() + 150;
      const beatMs = 60_000 / bpm;
      const groups = earMeterGroups(meter);
      const barMs = groups.reduce((sum, group) => sum + group * beatMs, 0);
      const expected: number[] = [];
      startRef.current = startAt; hitsRef.current = [];
      for (let bar = 0; bar < bars; bar++) {
        let groupOffset = 0;
        for (let pulse = 0; pulse < groups.length; pulse++) {
          const at = bar * barMs + groupOffset * beatMs;
          expected.push(at);
          if (bar === 0 || bar === bars - 1) player.scheduleClick(startAt + at, pulse === 0);
          groupOffset += groups[pulse]!;
        }
      }
      setPhase("playing");
      timerRef.current = setTimeout(() => {
        const scored = scorePulseChallenge(expected, hitsRef.current, bpm);
        timerRef.current = null;
        setScore(scored); setPhase("results"); player.silence(); player.close(); playerRef.current = null;
        onScore(scored, meter, bars);
      }, 150 + bars * barMs + 120);
    } catch {
      playerRef.current?.close(); playerRef.current = null; setPhase("ready"); setMessage(t("Click audio could not start. Check your audio output and try again."));
    }
  };
  const tap = useCallback(() => {
    if (phase !== "playing") return;
    hitsRef.current.push({ instrument: "snare", atMs: performance.now() - startRef.current });
    playerRef.current?.hit("snare");
  }, [phase]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== "KeyF" || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input,select,textarea,button,a,[contenteditable=true]")) return;
      if (phase === "playing") { event.preventDefault(); tap(); }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [phase, tap]);

  return <section id="pulse-dropout" className={`card ${styles.dropout}`} aria-label={t("Click dropout pulse challenge")}>
    <span className="eyebrow">{t("Pulse control")}</span><h3>{t("Hold the beat through silence")}</h3>
    <p>{t("Tap each broad pulse. The click plays in the opening and final bars, with a silent middle section.")} · {bpm} BPM</p>
    <div className={styles.builderControls}>
      <label>{t("Meter")}<select value={meter} disabled={phase === "playing" || phase === "loading" || disabled} onChange={event => setMeter(event.target.value as EarMeter)}>{EAR_METERS.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label>{t("Silent bars")}<select value={silentBars} disabled={phase === "playing" || phase === "loading" || disabled} onChange={event => setSilentBars(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
    </div>
    <div className={styles.actions}>
      {phase !== "playing" ? <button className="button" disabled={disabled || phase === "loading"} onClick={() => void start()}>{t(phase === "results" ? "Try the dropout again" : phase === "loading" ? "Preparing click…" : bars === 4 ? "Start four-bar challenge" : `Start ${bars}-bar challenge`)}</button> : <button type="button" className={styles.pulseTap} onPointerDown={event => { event.preventDefault(); tap(); }} onClick={event => { if (event.detail === 0) tap(); }}>{t("Tap the pulse · F")}</button>}
      {phase === "playing" ? <button className="button-secondary" onClick={stop}>{t("Stop")}</button> : null}
    </div>
    <p className={styles.dropoutStatus} role="status" aria-live="polite">{phase === "playing" ? t(silentBars === 1 ? "Bar 1: click · Bar 2: silent · Bar 3: click returns. Keep tapping each pulse." : `Bar 1: click · Bars 2–${bars - 1}: silent · Bar ${bars}: click returns. Keep tapping each ${meter === "6/8" ? "dotted-quarter" : meter === "7/8" ? "grouped" : "meter"} pulse.`) : score !== null ? `${t("Pulse score")}: ${score}%` : message || t("Use the button or F key. The click marks the opening and final bars.")}</p>
  </section>;
}

function TempoEnduranceTrainer({ bpm, meter, disabled, onScore }: { bpm: number; meter: EarMeter; disabled?: boolean; onScore: (score: number, meter: EarMeter, bpm: number) => void }) {
  const { t } = useLocalization();
  const [phase, setPhase] = useState<"ready" | "loading" | "playing" | "results">("ready");
  const [increase, setIncrease] = useState<4 | 6 | 8>(4);
  const [score, setScore] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const playerRef = useRef<DrumAudio | null>(null);
  const startRef = useRef(0);
  const hitsRef = useRef<EarAttempt[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); playerRef.current?.close(); }, []);

  const stop = () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; playerRef.current?.close(); playerRef.current = null; setPhase("ready"); };
  const start = async () => {
    if (["loading", "playing"].includes(phase) || disabled) return;
    stop(); setPhase("loading"); setMessage(""); setScore(null);
    try {
      const player = createDrumAudio();
      if (!player || !await player.ready) throw new Error("Audio unavailable");
      playerRef.current = player; player.setClickSound("woodblock"); player.silence();
      const startAt = performance.now() + 180;
      const pulseGroups = earMeterGroups(meter);
      const expected: Array<{ atMs: number; bpm: number }> = [];
      let offset = 0;
      for (let bar = 0; bar < 8; bar++) {
        const barBpm = Math.min(200, bpm + Math.floor(bar / 2) * increase);
        let groupOffset = 0;
        for (let pulse = 0; pulse < pulseGroups.length; pulse++) {
          const atMs = offset + groupOffset * 60_000 / barBpm;
          expected.push({ atMs, bpm: barBpm });
          player.scheduleClick(startAt + atMs, pulse === 0);
          groupOffset += pulseGroups[pulse]!;
        }
        offset += pulseGroups.reduce((sum, group) => sum + group, 0) * 60_000 / barBpm;
      }
      startRef.current = startAt; hitsRef.current = [];
      setPhase("playing");
      timerRef.current = setTimeout(() => {
        const scored = scoreTempoRamp(expected, hitsRef.current);
        timerRef.current = null; setScore(scored); setPhase("results");
        player.silence(); player.close(); playerRef.current = null;
        onScore(scored, meter, bpm);
      }, 180 + offset + 160);
    } catch {
      playerRef.current?.close(); playerRef.current = null; setPhase("ready"); setMessage(t("Click audio could not start. Check your audio output and try again."));
    }
  };
  const tap = useCallback(() => {
    if (phase !== "playing") return;
    hitsRef.current.push({ instrument: "snare", atMs: performance.now() - startRef.current });
    playerRef.current?.hit("snare");
  }, [phase]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== "KeyF" || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input,select,textarea,button,a,[contenteditable=true]")) return;
      if (phase === "playing") { event.preventDefault(); tap(); }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [phase, tap]);

  return <section id="tempo-endurance" className={`card ${styles.dropout}`} aria-label={t("Tempo endurance challenge")}>
    <span className="eyebrow">{t("Tempo control")}</span><h3>{t("Hold the groove as it speeds up")}</h3>
    <p>{t("Tap the pulse for eight bars. Tempo rises every two bars; keep your timing steady through each change.")} · {bpm} BPM · {t(meter)}</p>
    <div className={styles.builderControls}><label>{t("Tempo increase")}<select value={increase} disabled={phase === "playing" || phase === "loading" || disabled} onChange={event => setIncrease(Number(event.target.value) as 4 | 6 | 8)}><option value={4}>+4 {t("BPM per stage")}</option><option value={6}>+6 {t("BPM per stage")}</option><option value={8}>+8 {t("BPM per stage")}</option></select></label></div>
    <div className={styles.actions}>{phase === "playing" ? <><button type="button" className={styles.pulseTap} onPointerDown={event => { event.preventDefault(); tap(); }} onClick={event => { if (event.detail === 0) tap(); }}>{t("Tap the pulse · F")}</button><button className="button-secondary" onClick={stop}>{t("Stop")}</button></> : <button className="button" disabled={disabled || phase === "loading"} onClick={() => void start()}>{t(phase === "results" ? "Try tempo endurance again" : phase === "loading" ? "Preparing click…" : "Start eight-bar tempo challenge")}</button>}</div>
    <p className={styles.dropoutStatus} role="status" aria-live="polite">{phase === "playing" ? t("Follow the click and tap each broad pulse. The last four bars are faster than the first four.") : score !== null ? `${t("Tempo endurance score")}: ${score}%` : message || t("Uses the current session tempo and meter. Your score reflects pulse coverage and timing accuracy across the full ramp.")}</p>
  </section>;
}

function RhythmGrid({ pattern, label, meter = "4/4", response }: { pattern: PracticePattern; label: string; meter?: EarMeter; response?: Array<ReturnType<typeof scoreEarAttempt>["rated"][number]> }) {
  const { t } = useLocalization();
  const steps = pattern.beats * pattern.subdivision / 4;
  const voices = pads.filter(pad => pattern.hits.some(hit => hit.instrument === pad.voice) || response?.some(hit => hit.instrument === pad.voice));
  const groupSteps = earMeterGroups(meter).map(group => group * pattern.subdivision / 4);
  const stepsPerMeasure = groupSteps.reduce((sum, group) => sum + group, 0);
  const pulseAt = (step: number) => {
    const stepInMeasure = step % stepsPerMeasure;
    let boundary = 0;
    for (let index = 0; index < groupSteps.length; index++) {
      if (stepInMeasure < boundary + groupSteps[index]!) return { index, within: stepInMeasure - boundary, length: groupSteps[index]! };
      boundary += groupSteps[index]!;
    }
    return { index: 0, within: 0, length: groupSteps[0] ?? 1 };
  };
  const subdivisionLabel = (step: number) => {
    const stepInMeasure = step % stepsPerMeasure;
    const pulse = pulseAt(step);
    if (pulse.within === 0) return String(pulse.index + 1);
    if (pulse.length === 2) return "&";
    if (pulse.length === 3) return ["tri", "let"][Math.round(pulse.within) - 1] ?? "";
    if (pulse.length === 5) return ["ta", "ka", "di", "mi"][Math.round(pulse.within) - 1] ?? "";
    return ["e", "&", "a", "&", "a"][Math.round(pulse.within) - 1] ?? "";
  };
  return <div className={styles.gridScroll} role="group" aria-label={label}>
    <table className={styles.grid}>
      <caption className={styles.srOnly}>{label} · {t(meter)} · {pattern.subdivision === 12 ? t("Triplet subdivisions") : `${pattern.subdivision / 4} ${t("subdivisions per quarter-note beat")}`}</caption>
      <thead><tr><th scope="col">{t("Drum")}</th>{Array.from({ length: steps }, (_, step) => <th scope="col" key={step}>{subdivisionLabel(step)}</th>)}</tr></thead>
      <tbody>{voices.map(pad => {
        const targetAt = (step: number) => pattern.hits.find(hit => hit.step === step && hit.instrument === pad.voice);
        const resultAt = (step: number) => response?.filter(hit => hit.step === step && hit.instrument === pad.voice && hit.rating !== "miss") ?? [];
        const missAt = (step: number) => response?.some(hit => hit.step === step && hit.instrument === pad.voice && hit.rating === "miss") ?? false;
        return <Fragment key={pad.voice}>
          <tr key={`${pad.voice}-target`}><th scope="row">{t(pad.label)} · {t("Target")}</th>{Array.from({ length: steps }, (_, step) => { const target = targetAt(step); const missed = missAt(step); const pulse = pulseAt(step); const isMeasureStart = step > 0 && step % stepsPerMeasure === 0; const ghost = target?.velocityTarget !== undefined && target.velocityTarget < 50; const symbol = ghost ? "○" : target?.accent ? ">" : "●"; const targetLabel = ghost ? t("Ghost note") : target?.accent ? t("Accent") : t("Target hit"); return <td key={step} className={`${pulse.within === 0 ? styles.beatCell : ""} ${isMeasureStart ? styles.measureCell : ""} ${missed ? styles.missedTarget : ""}`}>{target ? <span role="img" className={`${styles.note} ${response && missed ? styles.missedNote : ""}`} title={missed ? t("Missed target") : targetLabel} aria-label={missed ? t("Missed target") : targetLabel}><span aria-hidden="true">{symbol}</span></span> : <span role="img" className={styles.rest} aria-label={t("Rest")}><span aria-hidden="true">·</span></span>}</td>})}</tr>
          {response ? <tr key={`${pad.voice}-response`}><th scope="row">{t("You")} · {t(pad.label)}</th>{Array.from({ length: steps }, (_, step) => { const hits = resultAt(step); const pulse = pulseAt(step); const isMeasureStart = step > 0 && step % stepsPerMeasure === 0; return <td key={step} className={`${pulse.within === 0 ? styles.beatCell : ""} ${isMeasureStart ? styles.measureCell : ""} ${hits.some(hit => hit.rating === "extra") ? styles.extraCell : ""}`}>{hits.length ? <span role="img" className={`${styles.responseNotes} ${styles[`rating_${hits[0]!.rating}`]}`} title={hits.map(hit => `${t(timingLabels[hit.rating])}${hit.offsetMs !== null ? ` ${hit.offsetMs > 0 ? "+" : ""}${hit.offsetMs} ms` : ""}`).join(", ")} aria-label={hits.map(hit => `${t(timingLabels[hit.rating])}${hit.offsetMs !== null ? ` ${hit.offsetMs > 0 ? "+" : ""}${hit.offsetMs} ms` : ""}`).join(", ")}><span aria-hidden="true">{hits.some(hit => hit.rating === "extra") ? "×" : "●"}</span></span> : <span role="img" className={styles.rest} aria-label={t("No hit played")}><span aria-hidden="true">·</span></span>}</td>})}</tr> : null}
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
  const [grooveStyle, setGrooveStyle] = useState<EarGrooveStyle>("free");
  const [complexity, setComplexity] = useState<1 | 2 | 3>(2);
  const [focusSkill, setFocusSkill] = useState<EarSkill | undefined>(undefined);
  const [countInBars, setCountInBars] = useState<0 | 1 | 2>(1);
  const [recallSupport, setRecallSupport] = useState<RecallSupport>("guided");
  const [inputMode, setInputMode] = useState<EarInputMode>("pads");
  const [adaptive, setAdaptive] = useState(true);
  const [recallDelay, setRecallDelay] = useState<0 | 3 | 5>(0);
  const [planScores, setPlanScores] = useState<number[] | null>(null);
  const [planSettings, setPlanSettings] = useState<{ length: SessionLength; focus: PlanFocus } | null>(null);
  const [sessionLength, setSessionLength] = useState<SessionLength>(5);
  const [sessionFocus, setSessionFocus] = useState<PlanFocus>("automatic");
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [previewSpeed, setPreviewSpeed] = useState<75 | 100>(75);
  const [previewVoice, setPreviewVoice] = useState<Instrument | "all">("all");
  const [reviewSegment, setReviewSegment] = useState<"full" | "1" | "2">("full");
  const [exercise, setExercise] = useState<EarExercise | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [beat, setBeat] = useState(0);
  const [listens, setListens] = useState(0);
  const [assisted, setAssisted] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [errorLocation, setErrorLocation] = useState<number | null>(null);
  const [dictationDraft, setDictationDraft] = useState<Array<{ instrument: Instrument; step: number }>>([]);
  const [result, setResult] = useState<ReturnType<typeof scoreEarAttempt> | null>(null);
  const [history, setHistory] = useState<EarResult[]>([]);
  const [reviewSchedule, setReviewSchedule] = useState<EarReviewItem[]>([]);
  const [timingProfiles, setTimingProfiles] = useState<EarTimingProfiles>({});
  const [timingProfilesReady, setTimingProfilesReady] = useState(false);
  const [calibrationPhase, setCalibrationPhase] = useState<"idle" | "loading" | "playing" | "done">("idle");
  const [calibrationTapCount, setCalibrationTapCount] = useState(0);
  const [calibrationMessage, setCalibrationMessage] = useState("");
  const [midiDevices, setMidiDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [midiDeviceId, setMidiDeviceId] = useState("");
  const [midiNoteMaps, setMidiNoteMaps] = useState<EarMidiMaps>({});
  const [midiMapsReady, setMidiMapsReady] = useState(false);
  const [microphoneProfileId, setMicrophoneProfileId] = useState("microphone-default");
  const [challengePacks, setChallengePacks] = useState<EarChallengePack[]>([]);
  const [challengePacksReady, setChallengePacksReady] = useState(false);
  const [challengePackName, setChallengePackName] = useState("My rhythm pack");
  const [importedPack, setImportedPack] = useState<EarChallengePackPayload | null>(null);
  const [assignmentPackId, setAssignmentPackId] = useState("");
  const [assignmentLearnerName, setAssignmentLearnerName] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [importedTeacherReport, setImportedTeacherReport] = useState<EarTeacherReport | null>(null);
  const [teacherReports, setTeacherReports] = useState<EarTeacherReport[]>([]);
  const [teacherReportsReady, setTeacherReportsReady] = useState(false);
  const [packMessage, setPackMessage] = useState("");
  const [activeChallenge, setActiveChallenge] = useState<{ packId: string; index: number } | null>(null);
  const [reviewClock, setReviewClock] = useState(0);
  const [message, setMessage] = useState("");
  const audio = useRef<DrumAudio | null>(null);
  const microphone = useRef<MicCapture | null>(null);
  const midiInputs = useRef<EarMidiInput[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const calibrationTimer = useRef<number | null>(null);
  const calibrationActiveRef = useRef(false);
  const generation = useRef(0);
  const capture = useRef<{ start: number; end: number; hits: EarAttempt[] } | null>(null);
  const calibrationCapture = useRef<EarCalibrationCapture | null>(null);
  const midiProfileKeyRef = useRef("midi-default");
  const microphoneProfileKeyRef = useRef("microphone-default");
  const historyRef = useRef<EarResult[]>([]);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const storageKey = learnerStorageKey(EAR_HISTORY_KEY, profileId);
  const reviewStorageKey = learnerStorageKey(EAR_REVIEW_KEY, profileId);
  const planStorageKey = learnerStorageKey("drum-hero:ear-training-plan:v1", profileId);
  const challengePackStorageKey = learnerStorageKey("drum-hero:ear-training-packs:v1", profileId);
  const timingProfileStorageKey = learnerStorageKey("drum-hero:ear-training-calibration:v1", profileId);
  const midiMapStorageKey = learnerStorageKey("drum-hero:ear-training-midi-map:v1", profileId);
  const teacherReportsStorageKey = learnerStorageKey(EAR_TEACHER_REPORTS_KEY, profileId);
  const currentMidiMapKey = midiDeviceId ? midiProfileKey(midiDeviceId) : "midi-default";
  const currentMidiMap = { ...DEFAULT_EAR_MIDI_MAP, ...(midiNoteMaps[currentMidiMapKey] ?? {}) };
  const busy = ["loading", "listening", "preview", "recall-delay", "count-in", "playing"].includes(phase) || calibrationPhase === "loading" || calibrationPhase === "playing";
  const currentTimingProfileKey = inputMode === "midi" ? midiDeviceId ? midiProfileKey(midiDeviceId) : "midi-default" : inputMode === "microphone" ? microphoneProfileId : "pads";
  const timingProfile = timingProfiles[currentTimingProfileKey];

  const stop = useCallback(() => {
    generation.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (ticker.current !== null) clearInterval(ticker.current);
    ticker.current = null;
    if (calibrationTimer.current !== null) clearTimeout(calibrationTimer.current);
    calibrationTimer.current = null;
    calibrationActiveRef.current = false;
    calibrationCapture.current = null;
    capture.current = null;
    closeMicCapture(microphone.current);
    microphone.current = null;
    closeMidiInputs(midiInputs.current);
    audio.current?.close();
    audio.current = null;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        historyRef.current = parseEarHistory(localStorage.getItem(storageKey));
        setHistory(historyRef.current);
        setReviewSchedule(parseEarReviewSchedule(localStorage.getItem(reviewStorageKey)));
        setTimingProfiles(parseEarTimingProfiles(localStorage.getItem(timingProfileStorageKey)));
        setTimingProfilesReady(true);
        setChallengePacks(parseEarChallengePacks(localStorage.getItem(challengePackStorageKey)));
        setChallengePacksReady(true);
        setMidiNoteMaps(parseEarMidiMaps(localStorage.getItem(midiMapStorageKey)));
        setMidiMapsReady(true);
        setTeacherReports(parseEarTeacherReports(localStorage.getItem(teacherReportsStorageKey)));
        setTeacherReportsReady(true);
        const savedPlan: unknown = JSON.parse(localStorage.getItem(planStorageKey) ?? "null");
        if (savedPlan && typeof savedPlan === "object" && "version" in savedPlan && (savedPlan.version === 1 || savedPlan.version === 2) && "day" in savedPlan && savedPlan.day === localDayKey() && "scores" in savedPlan && Array.isArray(savedPlan.scores) && savedPlan.scores.length <= 10 && savedPlan.scores.every((score: unknown) => Number.isFinite(score) && Number(score) >= 0 && Number(score) <= 100)) {
          setPlanScores(savedPlan.scores as number[]);
          if (savedPlan.version === 2 && "length" in savedPlan && [3, 5, 10].includes(Number(savedPlan.length)) && "focus" in savedPlan && (savedPlan.focus === "automatic" || Object.keys(skillLabels).includes(String(savedPlan.focus)))) {
            const settings = { length: Number(savedPlan.length) as SessionLength, focus: savedPlan.focus as PlanFocus };
            setPlanSettings(settings); setSessionLength(settings.length); setSessionFocus(settings.focus);
          } else { setPlanSettings({ length: 5, focus: "automatic" }); setSessionLength(5); setSessionFocus("automatic"); }
        }
      } catch {
        setTimingProfilesReady(true);
        setChallengePacksReady(true);
        setMidiMapsReady(true);
        setTeacherReportsReady(true);
        setMessage(t("Local history is unavailable. You can still practice."));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, reviewStorageKey, planStorageKey, challengePackStorageKey, timingProfileStorageKey, midiMapStorageKey, teacherReportsStorageKey, t]);

  useEffect(() => {
    if (!timingProfilesReady) return;
    try { localStorage.setItem(timingProfileStorageKey, JSON.stringify(timingProfiles)); }
    catch { setCalibrationMessage(t("Timing calibration could not be saved in this browser.")); }
  }, [timingProfiles, timingProfileStorageKey, timingProfilesReady, t]);

  useEffect(() => {
    if (!challengePacksReady) return;
    try { localStorage.setItem(challengePackStorageKey, JSON.stringify({ version: 1, packs: challengePacks })); }
    catch { setPackMessage(t("Challenge packs could not be saved in this browser.")); }
  }, [challengePacks, challengePackStorageKey, challengePacksReady, t]);

  useEffect(() => {
    if (!midiMapsReady) return;
    try { localStorage.setItem(midiMapStorageKey, JSON.stringify(midiNoteMaps)); }
    catch { setCalibrationMessage(t("MIDI note mappings could not be saved in this browser.")); }
  }, [midiNoteMaps, midiMapStorageKey, midiMapsReady, t]);

  useEffect(() => {
    if (!teacherReportsReady) return;
    try { localStorage.setItem(teacherReportsStorageKey, JSON.stringify({ version: 1, reports: teacherReports })); }
    catch { setPackMessage(t("Teacher reports could not be saved in this browser.")); }
  }, [teacherReports, teacherReportsStorageKey, teacherReportsReady, t]);

  useEffect(() => {
    const interrupt = () => {
      if (document.hidden) {
        const calibrationWasActive = calibrationActiveRef.current;
        stop();
        setPhase(current => ["loading", "listening", "preview", "recall-delay", "count-in", "playing"].includes(current) ? "ready" : current);
        if (calibrationWasActive) {
          setCalibrationPhase("idle");
          setCalibrationMessage(t("Timing calibration stopped because the page was hidden."));
        }
      }
    };
    document.addEventListener("visibilitychange", interrupt);
    return () => { document.removeEventListener("visibilitychange", interrupt); stop(); };
  }, [stop, t]);

  useEffect(() => { if (phase === "results") resultHeading.current?.focus(); }, [phase]);
  useEffect(() => { const tick = () => setReviewClock(Date.now()); tick(); const timer = setInterval(tick, 60_000); return () => clearInterval(timer); }, []);

  const hit = useCallback((instrument: Instrument, velocity?: number) => {
    const calibration = calibrationCapture.current;
    const now = performance.now();
    if (calibration) {
      if (now < calibration.start - 100 || now > calibration.end + 100) return;
      calibration.taps.push(now - calibration.start);
      setCalibrationTapCount(calibration.taps.length);
      if (inputMode !== "microphone") audio.current?.hit(instrument, false, velocity);
      return;
    }
    const round = capture.current;
    if (!round || now < round.start - 100 || now > round.end + 100) return;
    round.hits.push({ instrument, atMs: now - round.start, ...(inputMode === "midi" && velocity !== undefined ? { velocity } : {}) });
    if (inputMode !== "microphone") audio.current?.hit(instrument, false, velocity);
  }, [inputMode]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.metaKey || event.ctrlKey) return;
      if (calibrationCapture.current && inputMode !== "pads") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, select, textarea, [contenteditable=true], a, summary") || (target?.closest("button") && !target.closest("[data-ear-pad]"))) return;
      const pad = pads.find(pad => pad.code === event.code && (mode === "voice" && exercise?.voice
        ? pad.voice === exercise.voice
        : exercise?.pattern.hits.some(hit => hit.instrument === pad.voice)));
      if (pad && (capture.current || calibrationCapture.current)) { event.preventDefault(); hit(pad.voice); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [hit, mode, exercise, inputMode]);

  const save = useCallback((score: number, skills: EarSkill[], modeOverride = mode, trainingExercise = exercise, assistedOverride = assisted, overrides: Partial<Pick<EarResult, "meter" | "bars" | "bpm">> = {}, scoredResult?: ReturnType<typeof scoreEarAttempt>) => {
    const timed = modeOverride === "play" || modeOverride === "voice" ? scoredResult?.rated.filter(hit => hit.offsetMs !== null) ?? [] : [];
    const meanOffsetMs = timed.length ? Math.round(timed.reduce((sum, hit) => sum + (hit.offsetMs ?? 0), 0) / timed.length) : null;
    const analyzedPattern = trainingExercise ? modeOverride === "voice" && trainingExercise.voice ? { ...trainingExercise.pattern, hits: trainingExercise.pattern.hits.filter(hit => hit.instrument === trainingExercise.voice) } : trainingExercise.pattern : null;
    const timingCells = analyzedPattern && scoredResult && (modeOverride === "play" || modeOverride === "voice") ? timingCellsForPattern(analyzedPattern, overrides.meter ?? trainingExercise!.meter, scoredResult.rated) : undefined;
    const voiceStats: EarVoiceStats[] = analyzedPattern ? [...new Set([...analyzedPattern.hits.map(hit => hit.instrument), ...(scoredResult?.rated.map(hit => hit.instrument) ?? [])])].map(instrument => {
      const expected = analyzedPattern.hits.filter(hit => hit.instrument === instrument).length;
      const rated = scoredResult?.rated.filter(hit => hit.instrument === instrument) ?? [];
      const offsets = rated.flatMap(hit => hit.offsetMs === null ? [] : [hit.offsetMs]);
      return { instrument, expected, matched: rated.filter(hit => hit.rating === "great" || hit.rating === "good").length, extra: rated.filter(hit => hit.rating === "extra").length, meanOffsetMs: offsets.length ? Math.round(offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length) : null };
    }) : [];
    const activePack = activeChallenge ? challengePacks.find(pack => pack.id === activeChallenge.packId) : undefined;
    const entry: EarResult = { id: crypto.randomUUID(), playedAt: new Date().toISOString(), level: modeOverride === "dropout" || modeOverride === "tempo-ramp" ? "pulse" : level, mode: modeOverride, score, replays: Math.max(0, listens - 1), assisted: assistedOverride, skills, meter: overrides.meter ?? (modeOverride === "dropout" ? "4/4" : trainingExercise?.meter ?? meter), feel: modeOverride === "dropout" || modeOverride === "tempo-ramp" ? "straight" : trainingExercise?.feel ?? feel, bars: overrides.bars ?? (modeOverride === "dropout" ? 4 : trainingExercise?.bars ?? phraseBars), style: trainingExercise?.style ?? grooveStyle, focus: trainingExercise?.focus, complexity: trainingExercise?.complexity ?? complexity, voice: trainingExercise?.voice, lessonId: trainingExercise?.lessonId, ...(trainingExercise || overrides.bpm ? { bpm: overrides.bpm ?? bpm, ...(trainingExercise ? { subdivision: trainingExercise.pattern.subdivision } : {}) } : {}), ...((modeOverride === "play" || modeOverride === "voice") ? { input: inputMode } : {}), ...(scoredResult ? { meanOffsetMs, timedHits: timed.length, voiceStats, ...(timingCells ? { timingCells } : {}), ...(scoredResult.summary.dynamicsScore === undefined ? {} : { dynamicsScore: scoredResult.summary.dynamicsScore }) } : {}), ...(activeChallenge && modeOverride !== "tempo-ramp" ? { challengePackId: activeChallenge.packId, challengePackIndex: activeChallenge.index } : {}), ...(activePack?.assignment && modeOverride !== "tempo-ramp" ? { assignmentId: activePack.assignment.id } : {}) };
    const next = [...historyRef.current, entry].slice(-100);
    historyRef.current = next;
    setHistory(next);
    if (!assistedOverride) setLastScore(score);
    const targetLength = planSettings?.length ?? 5;
    const nextPlanScores = !activeChallenge && !assistedOverride && modeOverride !== "dropout" && planScores && planScores.length < targetLength ? [...planScores, score] : planScores;
    if (nextPlanScores !== planScores) setPlanScores(nextPlanScores);
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, results: next })); }
    catch { setMessage(t("This result could not be saved. You can keep practicing.")); }
    if (!assistedOverride && skills.length) {
      const nextReviews = updateEarReviewSchedule(reviewSchedule, skills, score);
      setReviewSchedule(nextReviews);
      try { localStorage.setItem(reviewStorageKey, JSON.stringify(nextReviews)); } catch { /* Review scheduling stays usable in memory. */ }
    }
    if (nextPlanScores !== planScores) {
      try { localStorage.setItem(planStorageKey, JSON.stringify({ version: 2, day: localDayKey(), scores: nextPlanScores, length: targetLength, focus: planSettings?.focus ?? "automatic" })); } catch { /* The session can continue if daily plan storage is unavailable. */ }
    }
  }, [level, mode, meter, feel, grooveStyle, complexity, exercise, phraseBars, listens, assisted, inputMode, bpm, planScores, planSettings, activeChallenge, challengePacks, reviewSchedule, storageKey, reviewStorageKey, planStorageKey, t]);

  const newExercise = useCallback((nextLevel = level, options: { meter?: EarMeter; feel?: EarFeel; bars?: 1 | 2; style?: EarGrooveStyle; focus?: EarSkill; complexity?: 1 | 2 | 3 } = { meter, feel, bars: phraseBars, style: grooveStyle, ...(focusSkill ? { focus: focusSkill } : {}), complexity }, exerciseMode = mode) => {
    stop();
    setActiveChallenge(null);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const targetFocus = options.focus ?? focusSkill;
    const metersForRound = options.focus === "meter" ? EAR_METERS.filter(value => value !== "4/4") : EAR_METERS;
    const feelsForRound = options.focus === "swing" ? EAR_FEELS.filter(value => value !== "straight") : EAR_FEELS;
    const targetOptions = {
      meter: targetFocus === "cross-rhythm" || targetFocus === "quintuplets" ? "4/4" as const : exerciseMode === "meter" ? metersForRound[seed % metersForRound.length]! : options.meter ?? meter,
      feel: exerciseMode === "feel" ? feelsForRound[(seed >>> 8) % feelsForRound.length]! : options.feel ?? feel,
      bars: options.bars ?? phraseBars,
      style: options.style ?? grooveStyle,
      complexity: options.complexity ?? complexity,
      ...(targetFocus ? { focus: targetFocus } : {}),
    };
    if ((targetFocus === "cross-rhythm" || targetFocus === "quintuplets") && meter !== "4/4") setMeter("4/4");
    const base = createEarExercise(nextLevel, seed, exercise?.pattern.id, targetOptions);
    const voices = [...new Set(base.pattern.hits.map(hit => hit.instrument))];
    const next: EarExercise = { ...base, comparison: createEarComparison(base.pattern, seed ^ 0x417cb9), ...(exerciseMode === "voice" && voices.length ? { voice: voices[(seed >>> 13) % voices.length]! } : {}) };
    setExercise(next); setPhase("ready"); setListens(0); setAssisted(false); setSelected(null); setErrorLocation(null); setDictationDraft([]); setResult(null); setLastScore(null); setMessage("");
    return next;
  }, [level, mode, meter, feel, phraseBars, exercise, stop, grooveStyle, focusSkill, complexity]);

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

  const openMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new Error("Microphone capture is unavailable in this browser.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    const deviceId = stream.getAudioTracks()[0]?.getSettings().deviceId;
    const profileKey = deviceId ? `microphone-${midiProfileKey(deviceId).slice(5)}` : "microphone-default";
    microphoneProfileKeyRef.current = profileKey; setMicrophoneProfileId(profileKey);
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    context.createMediaStreamSource(stream).connect(analyser);
    const state: MicCapture = { stream, context, analyser, data: new Float32Array(analyser.fftSize), frame: 0, lastHit: -Infinity };
    microphone.current = state;
    const detect = () => {
      if (microphone.current !== state) return;
      analyser.getFloatTimeDomainData(state.data);
      let energy = 0;
      for (const sample of state.data) energy += sample * sample;
      const rms = Math.sqrt(energy / state.data.length);
      const now = performance.now();
      const round = capture.current;
      const calibration = calibrationCapture.current;
      if (rms > 0.035 && now - state.lastHit > 140) {
        if (calibration && now >= calibration.start - 100 && now <= calibration.end + 100) {
          calibration.taps.push(now - calibration.start);
          setCalibrationTapCount(calibration.taps.length);
          state.lastHit = now;
        } else if (round && now >= round.start - 100 && now <= round.end + 100) {
          round.hits.push({ instrument: "snare", atMs: now - round.start });
          state.lastHit = now;
        }
      }
      state.frame = requestAnimationFrame(detect);
    };
    state.frame = requestAnimationFrame(detect);
    await context.resume();
  }, []);

  const changeMidiNote = (voice: Instrument, note: number) => {
    if (!Number.isInteger(note) || note < 0 || note > 127) return;
    if ((Object.entries(currentMidiMap) as Array<[Instrument, number]>).some(([mappedVoice, mappedNote]) => mappedVoice !== voice && mappedNote === note)) {
      setCalibrationMessage(t("Each drum voice needs a different MIDI note."));
      return;
    }
    setMidiNoteMaps(current => ({ ...current, [currentMidiMapKey]: { ...(current[currentMidiMapKey] ?? {}), [voice]: note } }));
    setCalibrationMessage(t(`Mapped ${voice} to MIDI note ${note}.`));
  };

  const openMidiInput = useCallback(async () => {
    const midiNavigator = navigator as unknown as { requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<EarMidiAccess> };
    if (!midiNavigator.requestMIDIAccess) throw new Error("Web MIDI is unavailable in this browser.");
    const access = await midiNavigator.requestMIDIAccess({ sysex: false });
    const inputs = [...access.inputs.values()];
    if (!inputs.length) throw new Error("No MIDI input is connected.");
    const usableInputs = inputs.filter(input => typeof input.id === "string" && input.id.length > 0);
    setMidiDevices(usableInputs.map(input => ({ id: input.id!, name: input.name?.trim() || "MIDI drum controller" })));
    const chosen = usableInputs.find(input => input.id === midiDeviceId) ?? usableInputs[0];
    if (!chosen) throw new Error("No identifiable MIDI input is connected.");
    setMidiDeviceId(chosen.id!);
    midiProfileKeyRef.current = midiProfileKey(chosen.id!);
    const noteMap = { ...DEFAULT_EAR_MIDI_MAP, ...(midiNoteMaps[midiProfileKey(chosen.id!)] ?? {}) };
    closeMidiInputs(midiInputs.current);
    midiInputs.current = [chosen];
    chosen.onmidimessage = event => {
      const bytes = event.data;
      if (!bytes || bytes.length < 3 || (bytes[0]! & 0xf0) !== 0x90 || bytes[2] === 0) return;
      const mapped = Object.entries(noteMap).find(([, note]) => note === bytes[1]);
      if (mapped) hit(mapped[0] as Instrument, bytes[2]!);
    };
  }, [hit, midiDeviceId, midiNoteMaps]);

  const finishTimingCalibration = useCallback(() => {
    const capture = calibrationCapture.current;
    calibrationCapture.current = null;
    calibrationTimer.current = null;
    calibrationActiveRef.current = false;
    if (!capture) return;
    const unused = new Set(capture.expected.map((_, index) => index));
    const offsets: number[] = [];
    for (const tap of [...capture.taps].sort((a, b) => a - b)) {
      let closest = -1;
      let distance = Infinity;
      for (const index of unused) {
        const nextDistance = Math.abs(tap - capture.expected[index]!);
        if (nextDistance < distance) { distance = nextDistance; closest = index; }
      }
      if (closest >= 0 && distance <= 240) { offsets.push(tap - capture.expected[closest]!); unused.delete(closest); }
    }
    if (offsets.length < 4) {
      setCalibrationMessage(t(`Only ${offsets.length} taps lined up with the click. Try again and tap all eight beats.`));
      setCalibrationPhase("done");
    } else {
      const sorted = [...offsets].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      const deviations = offsets.map(value => Math.abs(value - median)).sort((a, b) => a - b);
      const profile = { offsetMs: Math.max(-200, Math.min(200, Math.round(median))), spreadMs: Math.round(deviations[Math.floor(deviations.length / 2)] ?? 0), calibratedAt: new Date().toISOString() };
      setTimingProfiles(current => ({ ...current, [capture.profileKey]: profile }));
      setCalibrationMessage(t(`Timing profile saved: ${profile.offsetMs > 0 ? "+" : ""}${profile.offsetMs} ms input offset · ${offsets.length} taps.`));
      setCalibrationPhase("done");
    }
    closeMicCapture(microphone.current); microphone.current = null;
    closeMidiInputs(midiInputs.current);
    audio.current?.silence(); audio.current?.close(); audio.current = null;
  }, [t]);

  const startTimingCalibration = useCallback(async () => {
    if (busy) return;
    stop(); const token = generation.current;
    calibrationActiveRef.current = true;
    setCalibrationPhase("loading"); setCalibrationTapCount(0); setCalibrationMessage(t("Preparing an eight-click timing check…"));
    try {
      if (inputMode === "microphone") await openMicrophone();
      else if (inputMode === "midi") await openMidiInput();
      if (generation.current !== token) {
        closeMicCapture(microphone.current); microphone.current = null;
        closeMidiInputs(midiInputs.current);
        return;
      }
      const player = createDrumAudio();
      if (!player || !await player.ready) throw new Error("Audio unavailable");
      if (generation.current !== token) { player.close(); return; }
      player.setClickSound("woodblock"); player.silence(); audio.current = player;
      const beatMs = 60_000 / bpm;
      const start = performance.now() + 300;
      const expected = Array.from({ length: 8 }, (_, index) => index * beatMs);
      const duration = 8 * beatMs;
      const profileKey = inputMode === "midi" ? midiProfileKeyRef.current : inputMode === "microphone" ? microphoneProfileKeyRef.current : "pads";
      calibrationCapture.current = { start, end: start + duration, expected, taps: [], profileKey };
      expected.forEach((offset, index) => player.scheduleClick(start + offset, index === 0 || index === 4));
      setCalibrationPhase("playing"); setCalibrationMessage(t(inputMode === "pads" ? "Tap along with all eight clicks using the large pad or your keyboard." : inputMode === "midi" ? "Play a drum pad with all eight clicks on the selected MIDI controller." : "Make a desk tap or clap with all eight clicks. Use headphones to prevent speaker bleed."));
      calibrationTimer.current = window.setTimeout(finishTimingCalibration, duration + 320);
    } catch (error) {
      if (generation.current !== token) return;
      calibrationActiveRef.current = false;
      calibrationCapture.current = null;
      closeMicCapture(microphone.current); microphone.current = null;
      closeMidiInputs(midiInputs.current);
      audio.current?.close(); audio.current = null;
      setCalibrationPhase("done");
      setCalibrationMessage(t(error instanceof Error && error.message.includes("MIDI") ? "MIDI timing calibration could not connect. Check the selected controller and allow MIDI access." : error instanceof Error && error.message.includes("Microphone") ? "Microphone timing calibration could not connect. Allow microphone access and try again." : "Timing calibration could not start. Check audio output and try again."));
    }
  }, [busy, stop, t, inputMode, openMicrophone, openMidiInput, bpm, finishTimingCalibration]);

  const listen = useCallback(async () => {
    const maxListens = recallSupport === "challenge" ? 1 : recallSupport === "faded" ? 2 : Infinity;
    if (listens >= maxListens) return;
    const current = exercise ?? newExercise(level, { meter, feel });
    if (!exercise) setExercise(current);
    const player = await prepareAudio();
    if (!player) return;
    setListens(count => count + 1);
    setPhase("listening");
    const currentMeter = current.meter;
    const activeCountIn = recallSupport === "challenge" ? 0 : recallSupport === "faded" ? Math.min(countInBars, 1) : countInBars;
    const countDuration = countInDurationMs(bpm, currentMeter, activeCountIn);
    const countStart = performance.now() + 120;
    const phraseStart = countStart + countDuration;
    scheduleCountIn(player, countStart, bpm, currentMeter, activeCountIn);
    for (const note of current.pattern.hits) player.scheduleHit(note.instrument, phraseStart + note.step * stepDurationMs(bpm, current.pattern.subdivision) + earHitOffsetMs(note.step, bpm, current.pattern.subdivision, current.feel), note.accent, note.velocityTarget);
    const phraseDuration = earBarDurationMs(current.pattern, bpm);
    const compareMode = mode === "error" || mode === "voice";
    if (mode === "error" && current.comparison) {
      for (const note of current.comparison.pattern.hits) player.scheduleHit(note.instrument, phraseStart + phraseDuration + 350 + note.step * stepDurationMs(bpm, current.comparison.pattern.subdivision) + earHitOffsetMs(note.step, bpm, current.comparison.pattern.subdivision, current.feel), note.accent, note.velocityTarget);
    } else if (mode === "voice" && current.voice) {
      for (const note of current.pattern.hits) if (note.instrument === current.voice) player.scheduleHit(note.instrument, phraseStart + phraseDuration + 350 + note.step * stepDurationMs(bpm, current.pattern.subdivision) + earHitOffsetMs(note.step, bpm, current.pattern.subdivision, current.feel), note.accent, note.velocityTarget);
    }
    const phraseEndDelay = 120 + countDuration + phraseDuration * (compareMode ? 2 : 1) + (compareMode ? 350 : 0) + 150;
    timers.current.push(setTimeout(() => {
      player.silence();
      if (recallDelay) {
        setPhase("recall-delay");
        timers.current.push(setTimeout(() => setPhase("answer"), recallDelay * 1000));
      } else setPhase("answer");
    }, phraseEndDelay));
  }, [exercise, level, meter, feel, countInBars, newExercise, prepareAudio, bpm, recallSupport, listens, mode, recallDelay]);

  const playAnswer = useCallback(async () => {
    if (!exercise) return;
    const player = await prepareAudio();
    if (!player) return;
    const roundToken = generation.current;
    if (inputMode === "microphone") {
      try { await openMicrophone(); }
      catch {
        stop(); setPhase("answer");
        setMessage(t("Microphone access failed. Allow microphone access or switch back to drum pads."));
        return;
      }
      if (generation.current !== roundToken) { closeMicCapture(microphone.current); microphone.current = null; return; }
    } else if (inputMode === "midi") {
      try { await openMidiInput(); }
      catch (error) {
        stop(); setPhase("answer");
        setMessage(error instanceof Error && error.message.includes("unavailable")
          ? t("Web MIDI is unavailable in this browser. Switch to drum pads to answer.")
          : error instanceof Error && error.message.includes("No MIDI")
            ? t("No MIDI input found. Connect a drum pad or MIDI controller and try again.")
            : t("MIDI access was denied. Allow MIDI access or switch back to drum pads."));
        return;
      }
      if (generation.current !== roundToken) { closeMidiInputs(midiInputs.current); return; }
    }
    const countStart = performance.now() + 120;
    const currentMeter = exercise.meter;
    const activeCountIn = recallSupport === "challenge" ? 0 : recallSupport === "faded" ? Math.min(countInBars, 1) : countInBars;
    const pulseCount = earMeterGroups(currentMeter).length;
    const countDuration = countInDurationMs(bpm, currentMeter, activeCountIn);
    const start = countStart + countDuration;
    const answerPattern = mode === "voice" && exercise.voice ? { ...exercise.pattern, hits: exercise.pattern.hits.filter(hit => hit.instrument === exercise.voice) } : exercise.pattern;
    const duration = earBarDurationMs(exercise.pattern, bpm);
    capture.current = { start, end: start + duration, hits: [] };
    setPhase("count-in"); setBeat(0);
    scheduleCountIn(player, countStart, bpm, currentMeter, activeCountIn);
    ticker.current = activeCountIn ? setInterval(() => { setBeat(Math.max(0, Math.min(pulseCount, countInBeatAt(performance.now() - countStart, bpm, currentMeter, activeCountIn)))); }, 40) : null;
    timers.current.push(setTimeout(() => {
      if (ticker.current !== null) clearInterval(ticker.current);
      ticker.current = null; setPhase("playing");
    }, 120 + countDuration));
    timers.current.push(setTimeout(() => {
      const correction = timingProfiles[inputMode === "midi" ? midiProfileKeyRef.current : inputMode === "microphone" ? microphoneProfileKeyRef.current : "pads"]?.offsetMs ?? 0;
      const scored = scoreEarAttempt(answerPattern, bpm, capture.current?.hits ?? [], exercise.feel, correction);
      capture.current = null; closeMicCapture(microphone.current); microphone.current = null; closeMidiInputs(midiInputs.current); player.silence(); setResult(scored); save(scored.summary.score, skillsForEarPattern(exercise.pattern, level, exercise), mode, exercise, false, {}, scored); setPhase("results");
    }, 120 + countDuration + duration + 101));
  }, [exercise, prepareAudio, bpm, countInBars, save, level, mode, inputMode, openMicrophone, openMidiInput, recallSupport, timingProfiles, t, stop]);

  function choose(index: number) {
    if (!exercise || phase !== "answer") return;
    if (mode === "error") {
      setSelected(index); setErrorLocation(null);
      if (index === 1 && exercise.comparison?.changed) { setPhase("locate"); return; }
      const isCorrect = (index === 1) === Boolean(exercise.comparison?.changed);
      save(isCorrect ? 100 : 0, ["error-detection"], mode, exercise); setPhase("results"); return;
    }
    const correct = mode === "meter" ? EAR_METERS[index] === exercise.meter
      : mode === "feel" ? EAR_FEELS[index] === exercise.feel
      : index === exercise.answer;
    const skills = skillsForEarPattern(exercise.pattern, level, exercise);
    setSelected(index); save(correct ? 100 : 0, skills, mode, exercise); setPhase("results");
  }

  const chooseErrorStep = (step: number) => {
    if (!exercise?.comparison?.changed || phase !== "locate") return;
    const isCorrect = step === exercise.comparison.toStep;
    setErrorLocation(step); save(isCorrect ? 100 : 50, ["error-detection"], mode, exercise); setPhase("results");
  };

  const checkDictation = () => {
    if (!exercise || mode !== "dictation" || phase !== "answer") return;
    const scored = scoreEarDictation(exercise.pattern, dictationDraft);
    const hitResult = scoreEarAttempt(exercise.pattern, bpm, dictationDraft.map(hit => ({ instrument: hit.instrument, atMs: hit.step * stepDurationMs(bpm, exercise.pattern.subdivision) })), "straight");
    setResult({ ...hitResult, summary: { ...hitResult.summary, score: scored.score, placementScore: scored.score, timingScore: 100 } });
    save(scored.score, skillsForEarPattern(exercise.pattern, level, exercise), mode, exercise, false, {}, hitResult);
    setPhase("results");
  };

  const startGrooveLesson = (lesson: (typeof EAR_GROOVE_LESSONS)[number]) => {
    const lessonLevel = lesson.level ?? "groove";
    const lessonFocus = lesson.focus ?? "voice-separation";
    stop(); setActiveChallenge(null); setMode("play"); setLevel(lessonLevel); setMeter(lesson.meter); setFeel(lesson.feel); setGrooveStyle(lesson.style);
    const bars = lesson.pattern.beats > 4 ? 2 : 1;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const next: EarExercise = { pattern: lesson.pattern, choices: [], answer: 0, meter: lesson.meter, feel: lesson.feel, bars, style: lesson.style, complexity: 1, focus: lessonFocus, lessonId: lesson.id, comparison: createEarComparison(lesson.pattern, seed) };
    setExercise(next); setPhraseBars(bars); setFocusSkill(lessonFocus); setPhase("ready"); setListens(0); setAssisted(false); setSelected(null); setErrorLocation(null); setDictationDraft([]); setResult(null); setLastScore(null); setMessage("");
  };

  const loadChallengeItem = (item: EarChallengeItem) => {
    stop();
    setMode("play"); setLevel(item.level); setMeter(item.meter); setFeel(item.feel); setPhraseBars(item.bars);
    setGrooveStyle(item.style); setComplexity(item.complexity); setFocusSkill(undefined); setInputMode("pads");
    setBpm(Math.max(40, Math.min(140, item.pattern.defaultBpm)));
    setExercise({ pattern: item.pattern, choices: [], answer: 0, meter: item.meter, feel: item.feel, bars: item.bars, style: item.style, complexity: item.complexity });
    setPhase("ready"); setListens(0); setAssisted(false); setSelected(null); setErrorLocation(null); setDictationDraft([]); setResult(null); setLastScore(null); setMessage("");
  };

  const startChallengePack = (pack: EarChallengePack) => {
    if (!pack.items.length) return;
    setActiveChallenge({ packId: pack.id, index: 0 });
    setPackMessage(t(`Starting ${pack.name} · ${pack.items.length} rhythms.`));
    loadChallengeItem(pack.items[0]!);
  };

  const saveRhythmToPack = (item: EarChallengeItem) => {
    if (!challengePacksReady) { setPackMessage(t("Challenge packs are still loading. Try saving again in a moment.")); return; }
    const name = challengePackName.trim().slice(0, 60) || t("My rhythm pack");
    const existing = challengePacks.find(pack => pack.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing && existing.items.length >= 12) { setPackMessage(t("Each pack can hold up to 12 rhythms.")); return; }
    if (!existing && challengePacks.length >= 20) { setPackMessage(t("This learner profile already has 20 packs. Export or delete a pack before adding another.")); return; }
    if (existing) setChallengePacks(current => current.map(pack => pack.id === existing.id ? { ...pack, items: [...pack.items, item] } : pack));
    else setChallengePacks(current => [...current, { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), items: [item] }]);
    setPackMessage(t(`Saved ${item.pattern.name} to ${name}.`));
  };

  const saveCurrentToPack = () => {
    if (!exercise) { setPackMessage(t("Listen to or create a rhythm before saving it to a pack.")); return; }
    saveRhythmToPack({
      id: crypto.randomUUID(), level, meter: exercise.meter, feel: exercise.feel, bars: exercise.bars,
      style: exercise.style, complexity: exercise.complexity,
      pattern: { ...exercise.pattern, hits: exercise.pattern.hits.map(hit => ({ ...hit })) },
    });
  };

  const exportCurrentMidi = () => {
    if (!exercise) return;
    const patternName = exercise.pattern.name.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "rhythm";
    const pattern = { ...exercise.pattern, meter: exercise.meter };
    const blob = trainerPatternMidi(pattern, bpm);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${patternName}.mid`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPackMessage(t(`Exported ${exercise.pattern.name} as MIDI.`));
  };

  const saveBuiltPatternToPack = (pattern: PracticePattern, patternMeter: EarMeter) => {
    const voices = new Set(pattern.hits.map(hit => hit.instrument));
    const itemLevel: EarLevel = voices.size > 1 ? "groove" : pattern.subdivision === 12 || pattern.subdivision === 20 ? "triplet" : pattern.subdivision === 16 ? "rhythm" : "pulse";
    saveRhythmToPack({ id: crypto.randomUUID(), level: itemLevel, meter: patternMeter, feel: "straight", bars: 1, style: "free", complexity: voices.size > 1 ? 2 : 1, pattern: { ...pattern, hits: pattern.hits.map(hit => ({ ...hit })) } });
  };

  const exportChallengePack = (pack: EarChallengePack) => {
    const payload = { version: 1, name: pack.name, items: pack.items };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${pack.name.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "rhythm-pack"}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPackMessage(t(`Exported ${pack.name}. Share the JSON file with a practice partner.`));
  };

  const exportTeacherAssignment = (pack: EarChallengePack) => {
    const learnerName = assignmentLearnerName.trim().slice(0, 60);
    if (!learnerName) { setPackMessage(t("Enter the learner name before creating the assignment.")); return; }
    const dueAt = assignmentDueAt ? new Date(`${assignmentDueAt}T23:59:59`).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const assignment: EarAssignment = { id: crypto.randomUUID(), learnerName, dueAt, assignedAt: new Date().toISOString() };
    const filename = `${pack.name.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "rhythm-assignment"}-assignment.json`;
    downloadJsonFile(filename, { version: 1, type: "drum-hero-ear-assignment", assignment, pack: { version: 1, name: pack.name, items: pack.items } });
    setChallengePacks(current => current.map(item => item.id === pack.id ? { ...item, assignment } : item));
    setAssignmentPackId(""); setPackMessage(t(`Assignment for ${learnerName} exported. Send the file to the learner.`));
  };

  const exportLearnerReport = (pack: EarChallengePack) => {
    if (!pack.assignment) return;
    const attempts = history.filter(item => !item.assisted && item.assignmentId === pack.assignment!.id && item.challengePackId === pack.id).slice(-100);
    if (!attempts.length) { setPackMessage(t("No unassisted results are available for this assignment yet.")); return; }
    const payload = {
      version: 1,
      type: "drum-hero-ear-report",
      assignment: pack.assignment,
      packName: pack.name,
      submittedAt: new Date().toISOString(),
      results: attempts.map(item => ({
        score: item.score, playedAt: item.playedAt, mode: item.mode,
        ...(item.bpm === undefined ? {} : { bpm: item.bpm }), ...(item.meter === undefined ? {} : { meter: item.meter }),
        ...(item.dynamicsScore === undefined || item.dynamicsScore === null ? {} : { dynamicsScore: item.dynamicsScore }),
        ...(item.challengePackIndex === undefined ? {} : { challengeIndex: item.challengePackIndex }),
        ...(item.challengePackIndex === undefined ? {} : { itemName: pack.items[item.challengePackIndex]?.pattern.name ?? "Rhythm" }),
      })),
    };
    downloadJsonFile(`${pack.assignment.learnerName.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "learner"}-rhythm-results.json`, payload);
    setPackMessage(t(`Exported ${attempts.length} unassisted assignment results for ${pack.assignment.learnerName}.`));
  };

  const previewTeacherReport = async (file: File | undefined) => {
    setImportedTeacherReport(null);
    if (!file) return;
    if (file.size > 128_000) { setPackMessage(t("That learner report is over the 128 KB import limit.")); return; }
    try {
      const report = parseEarTeacherReport(await file.text());
      if (!report) { setPackMessage(t("That file is not a valid Drum Hero ear-training report.")); return; }
      setImportedTeacherReport(report);
    } catch { setPackMessage(t("The learner report could not be read. Choose a valid JSON file and try again.")); }
  };

  const acceptTeacherReport = () => {
    if (!importedTeacherReport) return;
    setTeacherReports(current => [...current.filter(report => report.id !== importedTeacherReport.id), importedTeacherReport].slice(-50));
    setPackMessage(t(`Saved ${importedTeacherReport.learnerName}'s report from ${importedTeacherReport.packName}.`));
    setImportedTeacherReport(null);
  };

  const previewChallengePack = async (file: File | undefined) => {
    setImportedPack(null); setPackMessage("");
    if (!file) return;
    if (file.size > 256_000) { setPackMessage(t("That rhythm pack is over the 256 KB import limit.")); return; }
    try {
      const raw = await file.text();
      let decoded: unknown;
      try { decoded = JSON.parse(raw); } catch { decoded = null; }
      const decodedObject = decoded && typeof decoded === "object" ? decoded as Record<string, unknown> : null;
      const isAssignment = decodedObject?.type === "drum-hero-ear-assignment";
      const assignmentEnvelope = isAssignment && decodedObject?.pack && typeof decodedObject.pack === "object"
        ? { ...(decodedObject.pack as Record<string, unknown>), version: 1, assignment: decodedObject.assignment }
        : decoded;
      const parsed = parseEarChallengePack(JSON.stringify(assignmentEnvelope));
      if (!parsed || isAssignment && !parsed.assignment) { setPackMessage(t("That file is not a valid rhythm pack or teacher assignment. Use a version 1 Drum Hero JSON file under 256 KB with up to 12 rhythms.")); return; }
      setImportedPack(parsed);
    } catch { setPackMessage(t("The rhythm pack could not be read. Choose a valid JSON file and try again.")); }
  };

  const acceptImportedPack = () => {
    if (!importedPack) return;
    if (challengePacks.length >= 20) { setPackMessage(t("This learner profile already has 20 packs. Export or delete a pack before importing.")); return; }
    const pack: EarChallengePack = { ...importedPack, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setChallengePacks(current => [...current, pack]); setImportedPack(null);
    setPackMessage(t(`Added ${pack.name} to your challenge packs.`));
  };

  const startSkillReview = (skill: EarSkill) => {
    if (skill === "pulse-stability") {
      document.getElementById("pulse-dropout")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (skill === "tempo-control") {
      document.getElementById("tempo-endurance")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const nextMode = modeForSkill(skill);
    const nextLevel = levelForSkill(skill);
    const nextMeter = skill === "cross-rhythm" || skill === "quintuplets" ? "4/4" : meter;
    setFocusSkill(skill); setMode(nextMode); setLevel(nextLevel); if (nextMeter !== meter) setMeter(nextMeter);
    newExercise(nextLevel, { meter: nextMeter, feel, bars: phraseBars, style: grooveStyle, complexity, focus: skill }, nextMode);
  };
  const startDueReview = (item: EarReviewItem) => startSkillReview(item.skill);

  const preview = useCallback(async () => {
    if (!exercise) return;
    setAssisted(true);
    const player = await prepareAudio();
    if (!player) return;
    setPhase("preview");
    const playbackBpm = Math.round(bpm * previewSpeed / 100);
    const countDuration = countInDurationMs(playbackBpm, exercise.meter, countInBars);
    const countStart = performance.now() + 120;
    const phraseStart = countStart + countDuration;
    scheduleCountIn(player, countStart, playbackBpm, exercise.meter, countInBars);
    for (const note of exercise.pattern.hits) if (previewVoice === "all" || note.instrument === previewVoice) player.scheduleHit(note.instrument, phraseStart + note.step * stepDurationMs(playbackBpm, exercise.pattern.subdivision) + earHitOffsetMs(note.step, playbackBpm, exercise.pattern.subdivision, exercise.feel), note.accent, note.velocityTarget);
    timers.current.push(setTimeout(() => { player.silence(); setPhase("answer"); }, 120 + countDuration + earBarDurationMs(exercise.pattern, playbackBpm) + 150));
  }, [exercise, prepareAudio, bpm, previewSpeed, previewVoice, countInBars]);

  const playResultReview = useCallback(async (kind: "target" | "answer") => {
    if (!exercise || kind === "answer" && !result) return;
    const player = await prepareAudio();
    if (!player) return;
    setPhase("preview");
    const playbackBpm = Math.round(bpm * previewSpeed / 100);
    const countDuration = countInDurationMs(playbackBpm, exercise.meter, 1);
    const countStart = performance.now() + 120;
    const phraseStart = countStart + countDuration;
    scheduleCountIn(player, countStart, playbackBpm, exercise.meter, 1);
    const speedScale = bpm / playbackBpm;
    const totalSteps = exercise.pattern.beats * exercise.pattern.subdivision / 4;
    const stepsPerBar = totalSteps / exercise.bars;
    const startStep = reviewSegment === "full" ? 0 : (Number(reviewSegment) - 1) * stepsPerBar;
    const endStep = reviewSegment === "full" ? totalSteps : startStep + stepsPerBar;
    const startAtMs = startStep * stepDurationMs(bpm, exercise.pattern.subdivision);
    const stopAtMs = endStep * stepDurationMs(bpm, exercise.pattern.subdivision);
    const events = kind === "target"
      ? exercise.pattern.hits.filter(note => note.step >= startStep && note.step < endStep && (previewVoice === "all" || note.instrument === previewVoice)).map(note => ({ instrument: note.instrument, atMs: (note.step - startStep) * stepDurationMs(playbackBpm, exercise.pattern.subdivision) + earHitOffsetMs(note.step, playbackBpm, exercise.pattern.subdivision, exercise.feel), accent: note.accent ?? false, velocityTarget: note.velocityTarget }))
      : result!.rated.filter((hit): hit is typeof hit & { atMs: number } => hit.rating !== "miss" && typeof hit.atMs === "number" && hit.atMs >= startAtMs && hit.atMs < stopAtMs && (previewVoice === "all" || hit.instrument === previewVoice)).map(hit => ({ instrument: hit.instrument, atMs: (hit.atMs - startAtMs) * speedScale, accent: false, velocityTarget: hit.velocity }));
    for (const event of events) player.scheduleHit(event.instrument, phraseStart + event.atMs, event.accent, event.velocityTarget);
    const duration = reviewSegment === "full" ? earBarDurationMs(exercise.pattern, playbackBpm) : exercise.pattern.beats / exercise.bars * 60_000 / playbackBpm;
    timers.current.push(setTimeout(() => { player.silence(); setPhase("results"); }, 120 + countDuration + duration + 180));
  }, [exercise, result, prepareAudio, bpm, previewSpeed, previewVoice, reviewSegment]);

  const visiblePads = pads.filter(pad => {
    if (mode === "voice" && exercise?.voice) return pad.voice === exercise.voice;
    return exercise ? exercise.pattern.hits.some(hit => hit.instrument === pad.voice) : pad.voice === "snare";
  });
  const microphoneCompatible = level !== "groove" && (exercise?.pattern.hits.every(hit => hit.instrument === "snare") ?? true);
  const recent = history.filter(item => item.level === level && item.mode === mode && !item.assisted).slice(-10);
  const recommendation = recommendedEarLevel(history);
  const skillAverages = (Object.keys(skillLabels) as EarSkill[]).flatMap(skill => {
    const attempts = history.filter(item => !item.assisted && item.skills?.includes(skill)).slice(-10);
    return attempts.length ? [{ skill, average: Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length), count: attempts.length }] : [];
  });
  const dimensionSummary = (dimension: "meter" | "feel" | "subdivision") => {
    const grouped = new Map<string, EarResult[]>();
    for (const item of history.filter(entry => !entry.assisted).slice(-60)) {
      const value = dimension === "subdivision" ? item.subdivision : item[dimension];
      if (value === undefined || value === null) continue;
      const key = String(value);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return [...grouped.entries()].map(([key, items]) => ({ key, average: Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length), count: items.length })).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  };
  const meterAverages = dimensionSummary("meter");
  const feelAverages = dimensionSummary("feel");
  const subdivisionNames: Record<string, string> = { "4": "Quarter-note grid", "8": "Eighth-note grid", "12": "Triplet grid", "16": "Sixteenth-note grid" };
  const subdivisionAverages = dimensionSummary("subdivision");
  const voiceAverages = (() => {
    const grouped = new Map<Instrument, { expected: number; matched: number; extra: number }>();
    for (const entry of history.filter(item => !item.assisted).slice(-60)) for (const stat of entry.voiceStats ?? []) {
      const current = grouped.get(stat.instrument) ?? { expected: 0, matched: 0, extra: 0 };
      current.expected += stat.expected; current.matched += stat.matched; current.extra += stat.extra; grouped.set(stat.instrument, current);
    }
    return [...grouped.entries()].map(([instrument, stat]) => ({ instrument, ...stat, average: stat.expected ? Math.round(100 * stat.matched / stat.expected) : 0 })).sort((a, b) => a.average - b.average);
  })();
  const timingSummary = (() => {
    const timed = history.filter(item => !item.assisted && item.meanOffsetMs !== null && item.meanOffsetMs !== undefined && (item.timedHits ?? 0) > 0).slice(-60);
    const count = timed.reduce((sum, item) => sum + (item.timedHits ?? 0), 0);
    return count ? { mean: Math.round(timed.reduce((sum, item) => sum + (item.meanOffsetMs ?? 0) * (item.timedHits ?? 0), 0) / count), count } : null;
  })();
  const timingHeatmap = (() => {
    const grouped = new Map<string, { grid: number; beat: number; subdivision: number; expected: number; matched: number; missed: number; extra: number; offsetSum: number; offsetCount: number }>();
    for (const attempt of history.filter(item => !item.assisted && item.timingCells?.length).slice(-60)) {
      for (const cell of attempt.timingCells ?? []) {
        const grid = attempt.subdivision ?? 8;
        const key = `${grid}:${cell.beat}:${cell.subdivision}`;
        const current = grouped.get(key) ?? { grid, beat: cell.beat, subdivision: cell.subdivision, expected: 0, matched: 0, missed: 0, extra: 0, offsetSum: 0, offsetCount: 0 };
        current.expected += cell.expected; current.matched += cell.matched; current.missed += cell.missed; current.extra += cell.extra;
        if (cell.meanOffsetMs !== null && cell.matched) { current.offsetSum += cell.meanOffsetMs * cell.matched; current.offsetCount += cell.matched; }
        grouped.set(key, current);
      }
    }
    return [...grouped.values()].map(cell => ({ ...cell, accuracy: cell.expected ? Math.round(100 * cell.matched / cell.expected) : 0, meanOffsetMs: cell.offsetCount ? Math.round(cell.offsetSum / cell.offsetCount) : null })).sort((a, b) => a.grid - b.grid || a.beat - b.beat || a.subdivision - b.subdivision);
  })();
  const dynamicsSummary = (() => {
    const attempts = history.filter(item => !item.assisted && item.dynamicsScore !== null && item.dynamicsScore !== undefined).slice(-60);
    return attempts.length ? { average: Math.round(attempts.reduce((sum, item) => sum + (item.dynamicsScore ?? 0), 0) / attempts.length), count: attempts.length } : null;
  })();
  const correct = selected !== null && (mode === "meter" ? EAR_METERS[selected] === exercise?.meter : mode === "feel" ? EAR_FEELS[selected] === exercise?.feel : mode === "error" ? (selected === 1) === Boolean(exercise?.comparison?.changed) && (!exercise?.comparison?.changed || errorLocation === exercise.comparison.toStep) : selected === exercise?.answer);
  const selectedAnswer = selected === null ? "" : mode === "meter" ? EAR_METERS[selected]! : mode === "feel" ? EAR_FEELS[selected]! : mode === "error" ? selected === 1 ? "Different" : "Same" : String.fromCharCode(65 + selected);
  const correctAnswer = mode === "meter" ? exercise?.meter ?? "" : mode === "feel" ? exercise?.feel ?? "" : mode === "error" ? exercise?.comparison?.changed ? "Different" : "Same" : String.fromCharCode(65 + (exercise?.answer ?? 0));
  const wrongPattern = selected !== null && mode === "identify" && !correct ? exercise?.choices[selected] : undefined;
  const answerExplanation = exercise ? explainEarAnswer(exercise.pattern, result?.rated ?? [], wrongPattern) : "";
  const modeExplanation = mode === "meter"
    ? `The bar is ${exercise?.meter}. ${exercise?.meter === "6/8" ? "Feel two broad pulses, each divided into three." : exercise?.meter === "7/8" ? "Feel the uneven 2 + 2 + 3 eighth-note grouping." : `Feel ${earMeterGroups(exercise?.meter ?? "4/4").length} pulse groups in each bar.`}`
    : mode === "feel" ? `The groove is ${exercise?.feel}. ${exercise?.feel === "straight" ? "The subdivisions are even." : exercise?.feel === "swing" ? "The offbeat eighth notes are delayed for a light long-short feel." : "The offbeat notes lean into a broader triplet shuffle."}`
    : mode === "error" && exercise?.comparison?.changed ? `The second phrase shifted the ${exercise.comparison.instrument} from grid step ${(exercise.comparison.fromStep ?? 0) + 1} to ${(exercise.comparison.toStep ?? 0) + 1}. Listen for that space changing.`
    : mode === "error" ? "Both phrases kept the same hits in the same places. Listen for an unchanged pattern." : "";
  const maxListens = recallSupport === "challenge" ? 1 : recallSupport === "faded" ? 2 : Infinity;
  const activeCountIn = recallSupport === "challenge" ? 0 : recallSupport === "faded" ? Math.min(countInBars, 1) : countInBars;
  const status = phase === "loading" ? "Loading drum sounds…" : phase === "listening" ? mode === "error" ? "Listen to two phrases. Decide whether the second one changed." : mode === "voice" ? "Listen to the full groove, then hear one drum part by itself." : activeCountIn ? `Listen: ${activeCountIn} ${activeCountIn === 1 ? "count-in bar" : "count-in bars"}, then a ${phraseBars}-bar phrase. Remember the rhythm.` : `Listen: a ${phraseBars}-bar phrase. Remember the rhythm.` : phase === "locate" ? "Choose the grid step where the changed hit landed." : phase === "preview" ? "Focused preview: listen for the selected drum voice." : phase === "recall-delay" ? `Hold the rhythm in your head for ${recallDelay} seconds. Get ready to answer.` : phase === "count-in" ? "Get ready" : phase === "playing" ? mode === "voice" ? "Play only the drum part you just heard in isolation." : `Your turn — play ${phraseBars === 1 ? "one bar" : "two bars"} from memory.` : phase === "answer" ? mode === "dictation" ? "Write the rhythm you heard on the grid." : mode === "error" ? "Did the second phrase change?" : mode === "voice" ? "Play only the part that was isolated." : mode === "play" ? inputMode === "microphone" ? "Allow mic input, then tap or clap the rhythm." : inputMode === "midi" ? "Play the rhythm on your connected MIDI drum controller." : "Ready? Take the count-in, then play it back." : mode === "identify" ? "Which rhythm did you hear?" : mode === "meter" ? "Which meter did you hear?" : "Which feel did you hear?" : "Listen first. The rhythm stays hidden until you answer.";

  const continuePractice = () => {
    if (activeChallenge) {
      const pack = challengePacks.find(item => item.id === activeChallenge.packId);
      const nextIndex = activeChallenge.index + 1;
      if (pack?.items[nextIndex]) {
        setActiveChallenge({ packId: pack.id, index: nextIndex });
        loadChallengeItem(pack.items[nextIndex]!);
        return;
      }
      setActiveChallenge(null);
      setPackMessage(t(`Finished ${pack?.name ?? "the challenge pack"}. Your rhythm answers are saved in ear training history.`));
      newExercise(level, { meter, feel, bars: phraseBars, style: grooveStyle, complexity });
      return;
    }
    const nextRecommendation = adaptive ? recommendedEarLevel(historyRef.current) : null;
    const inPlan = planScores !== null && planSettings !== null && planScores.length < planSettings.length;
    const chosenFocus = inPlan ? planSettings.focus === "automatic" ? nextRecommendation?.skill : planSettings.focus : nextRecommendation?.skill;
    if (chosenFocus === "tempo-control") {
      document.getElementById("tempo-endurance")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const nextMode = chosenFocus ? modeForSkill(chosenFocus) : mode;
    let nextLevel = level;
    if (chosenFocus) nextLevel = levelForSkill(chosenFocus);
    let nextBpm = bpm;
    let nextPhraseBars = phraseBars;
    let nextComplexity = complexity;
    if (adaptive && !chosenFocus && lastScore !== null && lastScore >= 85) {
      if (complexity < 3) nextComplexity = (complexity + 1) as 2 | 3;
      else if (phraseBars === 1) nextPhraseBars = 2;
      else nextBpm = Math.min(140, bpm + 5);
    } else if (adaptive && !chosenFocus && lastScore !== null && lastScore < 55) {
      if (bpm > 40) nextBpm = Math.max(40, bpm - 5);
      else if (complexity > 1) nextComplexity = (complexity - 1) as 1 | 2;
      else if (phraseBars === 2) nextPhraseBars = 1;
    }
    if (nextBpm !== bpm) setBpm(nextBpm);
    if (adaptive && lastScore !== null && nextPhraseBars !== phraseBars) setPhraseBars(nextPhraseBars);
    if (nextComplexity !== complexity) setComplexity(nextComplexity);
    if (adaptive && !chosenFocus && nextBpm === bpm && nextPhraseBars === phraseBars && nextComplexity === complexity) nextLevel = adaptiveEarLevel(historyRef.current, level, nextMode);
    if (nextMode !== mode) setMode(nextMode);
    if (nextRecommendation || nextLevel !== level) setLevel(nextLevel);
    if (nextLevel === "groove" && inputMode === "microphone") setInputMode("pads");
    setFocusSkill(chosenFocus);
    newExercise(nextLevel, { meter, feel, bars: nextPhraseBars, style: grooveStyle, complexity: nextComplexity, ...(chosenFocus ? { focus: chosenFocus } : {}) }, nextMode);
  };

  const startPracticePlan = () => {
    setPlanScores([]);
    setPlanSettings({ length: sessionLength, focus: sessionFocus });
    setAdaptive(true);
    const focusSkillTarget = sessionFocus === "automatic" ? recommendation?.skill : sessionFocus;
    if (focusSkillTarget === "tempo-control") {
      document.getElementById("tempo-endurance")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const focusLevel = focusSkillTarget ? levelForSkill(focusSkillTarget) : level;
    const focusMode = focusSkillTarget ? modeForSkill(focusSkillTarget) : mode;
    setFocusSkill(focusSkillTarget);
    setLevel(focusLevel);
    if (focusMode !== mode) setMode(focusMode);
    try { localStorage.setItem(planStorageKey, JSON.stringify({ version: 2, day: localDayKey(), scores: [], length: sessionLength, focus: sessionFocus })); } catch { /* The in-memory plan remains usable. */ }
    newExercise(focusLevel, { meter, feel, style: grooveStyle, complexity, ...(focusSkillTarget ? { focus: focusSkillTarget } : {}) }, focusMode);
  };

  const activePlanLength = planSettings?.length ?? 5;
  const activePlan = planScores !== null && planSettings !== null && planScores.length < activePlanLength;
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const scores = history.filter(item => !item.assisted && (() => { const played = new Date(item.playedAt); return `${played.getFullYear()}-${String(played.getMonth() + 1).padStart(2, "0")}-${String(played.getDate()).padStart(2, "0")}` === key; })()).map(item => item.score);
    return { key, label: date.toLocaleDateString(undefined, { weekday: "short" }), score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null, count: scores.length };
  });
  const completedLessons = new Set(EAR_GROOVE_LESSONS.filter(lesson => history.filter(item => !item.assisted && item.lessonId === lesson.id && item.score >= 80).length >= 2).map(lesson => lesson.id));
  const unlockedLessons = EAR_GROOVE_LESSONS.findIndex((lesson, index) => index > 0 && !completedLessons.has(EAR_GROOVE_LESSONS[index - 1]!.id));
  const lessonLimit = unlockedLessons < 0 ? EAR_GROOVE_LESSONS.length : Math.max(1, unlockedLessons);
  const dueReviews = reviewClock ? reviewSchedule.filter(item => Date.parse(item.dueAt) <= reviewClock) : [];
  const upcomingReview = reviewClock ? reviewSchedule.filter(item => Date.parse(item.dueAt) > reviewClock).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0] : undefined;
  const activeLesson = exercise?.lessonId ? EAR_GROOVE_LESSONS.find(lesson => lesson.id === exercise.lessonId) : undefined;
  const activeChallengePack = activeChallenge ? challengePacks.find(pack => pack.id === activeChallenge.packId) : undefined;
  const selectedAssignmentPack = assignmentPackId ? challengePacks.find(pack => pack.id === assignmentPackId) : undefined;

  return <div className={styles.layout}>
    <section className={`card ${styles.console}`} aria-label={t("Rhythm ear training")}>
      <div className={styles.settings}>
        <label>{t("Exercise")}<select value={mode} disabled={busy} onChange={event => { const value = event.target.value as EarMode; const nextLevel = value === "voice" ? "groove" : level; setMode(value); setLevel(nextLevel); if (value === "voice" && inputMode === "microphone") setInputMode("pads"); newExercise(nextLevel, { meter, feel, style: grooveStyle, complexity }, value); }}><option value="play">{t("Listen and tap back")}</option><option value="identify">{t("Match the rhythm")}</option><option value="meter">{t("Name the meter")}</option><option value="feel">{t("Identify the feel")}</option><option value="dictation">{t("Write it on the grid")}</option><option value="error">{t("Find the rhythmic change")}</option><option value="voice">{t("Isolate a drum voice")}</option></select></label>
        <label>{t("Difficulty")}<select value={level} disabled={busy} onChange={event => { const value = event.target.value as EarLevel; setLevel(value); if (value === "groove" && inputMode === "microphone") setInputMode("pads"); newExercise(value, { meter, feel, style: grooveStyle, complexity }); }}>{EAR_LEVELS.map(item => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label>
        {mode === "meter" ? <div className={styles.settingNote}><strong>{t("Meter")}</strong><span>{t("Mixed · 4/4, 3/4, 6/8, 5/4, 7/8")}</span></div> : <label>{t("Meter")}<select value={meter} disabled={busy} onChange={event => { const value = event.target.value as EarMeter; setMeter(value); newExercise(level, { meter: value, feel, style: grooveStyle, complexity }); }}>{EAR_METERS.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>}
        {mode === "feel" ? <div className={styles.settingNote}><strong>{t("Feel")}</strong><span>{t("Mixed · straight, swing, shuffle")}</span></div> : <label>{t("Feel")}<select value={feel} disabled={busy} onChange={event => { const value = event.target.value as EarFeel; setFeel(value); newExercise(level, { meter, feel: value }); }}><option value="straight">{t("Straight")}</option><option value="swing">{t("Swing · light")}</option><option value="shuffle">{t("Shuffle · triplet")}</option></select></label>}
        {level === "groove" ? <label>{t("Groove family")}<select value={grooveStyle} disabled={busy} onChange={event => { const value = event.target.value as EarGrooveStyle; setGrooveStyle(value); newExercise(level, { meter, feel, style: value, complexity }); }}>{EAR_GROOVE_STYLES.map(value => <option key={value} value={value}>{t(value === "free" ? "Open groove" : value)}</option>)}</select></label> : null}
        <label>{t("Rhythm density")}<select value={complexity} disabled={busy} onChange={event => { const value = Number(event.target.value) as 1 | 2 | 3; setComplexity(value); newExercise(level, { meter, feel, style: grooveStyle, complexity: value }); }}><option value={1}>{t("Sparse")}</option><option value={2}>{t("Balanced")}</option><option value={3}>{t("Dense")}</option></select></label>
        <label>{t("Phrase length")}<select value={phraseBars} disabled={busy} onChange={event => { const value = Number(event.target.value) as 1 | 2; setPhraseBars(value); newExercise(level, { meter, feel, bars: value }); }}><option value={1}>{t("1 bar")}</option><option value={2}>{t("2 bars")}</option></select></label>
        <label>{t("Tempo")} · {bpm} BPM<input type="range" aria-label={t("Tempo")} min={40} max={140} step={5} value={bpm} disabled={busy} onChange={event => { setBpm(Number(event.target.value)); newExercise(level, { meter, feel }); }} /></label>
        <label>{t("Count-in")}<select value={countInBars} disabled={busy} onChange={event => setCountInBars(Number(event.target.value) as 0 | 1 | 2)}><option value={0}>{t("Off")}</option><option value={1}>{t("1 bar")}</option><option value={2}>{t("2 bars")}</option></select></label>
        <label>{t("Recall support")}<select value={recallSupport} disabled={busy} onChange={event => setRecallSupport(event.target.value as RecallSupport)}><option value="guided">{t("Guided · replays and count-in")}</option><option value="faded">{t("Faded · 2 listens, 1 count-in bar")}</option><option value="challenge">{t("Recall challenge · 1 listen, no count-in")}</option></select></label>
        <label>{t("Recall delay")}<select value={recallDelay} disabled={busy} onChange={event => setRecallDelay(Number(event.target.value) as 0 | 3 | 5)}><option value={0}>{t("No delay")}</option><option value={3}>{t("3 seconds")}</option><option value={5}>{t("5 seconds")}</option></select></label>
        {(mode === "play" || mode === "voice") ? <label>{t("Answer input")}<select value={inputMode} disabled={busy} onChange={event => setInputMode(event.target.value as EarInputMode)}><option value="pads">{t("Drum pads")}</option>{microphoneCompatible ? <option value="microphone">{t("Microphone taps")}</option> : null}<option value="midi">{t("MIDI drum controller")}</option></select></label> : null}
        <label className={styles.toggle}><input type="checkbox" checked={adaptive} disabled={busy} onChange={event => setAdaptive(event.target.checked)} />{t("Adaptive level and tempo")}</label>
      </div>
      <p className={styles.description}>{t(EAR_LEVELS.find(item => item.id === level)!.description)} {t(phraseBars === 1 ? "1 bar phrase" : "2 bar phrase")} · {t(mode === "meter" ? "mixed meter" : meter)} · {t(mode === "feel" ? "mixed feel" : feel)} · {t(activeCountIn ? `${activeCountIn} bar count-in` : "count-in off")}</p>
      {adaptive ? <p className={styles.description}>{t("Adaptive practice changes one difficulty step at a time, so it is clear whether tempo, rhythm density, or phrase length got harder.")}</p> : null}
      {activeLesson ? <p className={styles.lessonContext}><strong>{t(activeLesson.name)}</strong> · {t(activeLesson.concept)}</p> : null}
      {activeChallenge ? <p className={styles.lessonContext}><strong>{t(activeChallengePack?.name ?? "Challenge pack")}</strong> · {t("Rhythm")} {activeChallenge.index + 1} {t("of")} {activeChallengePack?.items.length ?? 0}</p> : null}
      {(mode === "play" || mode === "voice") ? <section className={styles.calibration} aria-label={t("Input timing calibration")}>
        <div><h3>{t("Input timing calibration")}</h3><p>{timingProfile ? t(`This input is corrected by ${timingProfile.offsetMs > 0 ? "+" : ""}${timingProfile.offsetMs} ms. Tap spread: ${timingProfile.spreadMs} ms.`) : t("Calibrate pads, MIDI, or microphone taps to compensate for device timing before scored rounds.")}</p></div>
        {inputMode === "midi" && midiDevices.length ? <label>{t("MIDI input")}<select value={midiDeviceId} disabled={busy} onChange={event => { setMidiDeviceId(event.target.value); midiProfileKeyRef.current = midiProfileKey(event.target.value); setCalibrationMessage(""); }} aria-label={t("MIDI input device")}>{midiDevices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label> : null}
        {inputMode === "midi" ? <fieldset className={styles.midiNoteMap}><legend>{t("MIDI note mapping · saved per controller")}</legend><p>{t("Set the incoming note number for each drum voice. Use 0–127; each voice must have a unique note.")}</p>{pads.map(pad => <label key={pad.voice}>{t(pad.label)}<input type="number" min={0} max={127} step={1} value={currentMidiMap[pad.voice]} disabled={busy || !midiMapsReady} aria-label={`${t(pad.label)} ${t("MIDI note")}`} onChange={event => changeMidiNote(pad.voice, Number(event.target.value))} /></label>)}</fieldset> : null}
        {calibrationPhase === "playing" ? <>{inputMode === "pads" ? <button type="button" className={styles.pulseTap} onPointerDown={event => { event.preventDefault(); hit("snare"); }} onClick={event => { if (event.detail === 0) hit("snare"); }}>{t("Tap with the click · Space")}</button> : <p>{t(inputMode === "midi" ? "Play your selected MIDI drum pad with each click." : "Clap or tap near the selected microphone with each click.")}</p>}<p>{t("Clicks tapped")}: {calibrationTapCount} / 8</p><button className="button-secondary" onClick={() => { stop(); setCalibrationPhase("idle"); setCalibrationMessage(t("Timing calibration stopped.")); }}>{t("Stop calibration")}</button></> : <button className="button-secondary" disabled={busy || !timingProfilesReady} onClick={() => void startTimingCalibration()}>{t(calibrationPhase === "loading" ? "Preparing calibration…" : "Calibrate this input")}</button>}
        {inputMode === "microphone" ? <small>{t("Use headphones during microphone calibration to avoid hearing the speaker click as a tap.")}</small> : null}
        {calibrationMessage ? <p role="status" aria-live="polite">{t(calibrationMessage)}</p> : null}
      </section> : null}
      <div className={styles.stage}>
        <span className="eyebrow">{t(phase === "results" ? "Review" : "Listen → Remember → Answer")}</span>
        <h2>{t(phase === "results" ? "Hear what happened" : "Trust your ears")}</h2>
        <p role="status" aria-live="polite">{t(phase === "results" ? "Compare the rhythm, then try again or hear something new." : status)}</p>
        {phase === "count-in" && activeCountIn > 0 ? <strong className={styles.count} aria-label={t("Count-in")}>{beat || "…"}</strong> : null}
        {phase !== "results" ? <div className={styles.hiddenPattern}><span aria-hidden="true">♫</span><p>{t("Target rhythm hidden")}</p><small>{t("No note-following clues. Listen for hits, rests, and the spaces between them.")}</small></div> : null}
        <div className={styles.actions}>
          {phase !== "results" && phase !== "locate" ? <button className="button" disabled={busy || listens >= maxListens} onClick={() => void listen()}>{t(listens ? "Listen again" : "Listen to rhythm")}</button> : null}
          {phase === "answer" && recallSupport !== "challenge" ? <button className="button-secondary" onClick={() => void preview()}>{t("Preview with focus")}</button> : null}
          {phase === "answer" && (mode === "play" || mode === "voice") ? <button className="button-secondary" onClick={event => { event.currentTarget.blur(); void playAnswer(); }}>{t(inputMode === "midi" ? "Start MIDI answer" : mode === "voice" ? "Play isolated voice back" : inputMode === "microphone" ? "Start microphone answer" : "Play my answer")}</button> : null}
          {busy ? <button className="button-secondary" onClick={() => { stop(); setPhase(listens ? "answer" : "ready"); setMessage(t("Stopped. Start again when you are ready.")); }}>{t("Stop")}</button> : null}
          {phase === "answer" ? <button className="button-secondary" onClick={() => { setAssisted(true); setPhase("results"); }}>{t("Reveal rhythm")}</button> : null}
        </div>
        {listens > 0 ? <small>{t("Listens")}: {listens} · {t(recallSupport === "challenge" ? "One listen allowed." : recallSupport === "faded" ? "Up to two listens allowed." : "Replay as often as you need.")}{recallDelay ? ` · ${t("Answer delay")}: ${recallDelay}s` : ""}</small> : null}
        {phase === "answer" ? <div className={styles.previewControls} aria-label={t("Listening preview controls")}>
          <label>{t("Preview speed")}<select value={previewSpeed} onChange={event => setPreviewSpeed(Number(event.target.value) as 75 | 100)}><option value={75}>{t("Slower · 75%")}</option><option value={100}>{t("Original · 100%")}</option></select></label>
          {level === "groove" ? <label>{t("Hear a voice")}<select value={previewVoice} onChange={event => setPreviewVoice(event.target.value as Instrument | "all")}><option value="all">{t("All voices")}</option>{pads.map(pad => <option value={pad.voice} key={pad.voice}>{t(pad.label)}</option>)}</select></label> : null}
          <small>{t("A focused preview helps you study the rhythm. It marks this attempt as assisted.")}</small>
        </div> : null}
        {message ? <p role="status">{message}</p> : null}
      </div>
      {mode === "dictation" && phase === "answer" && exercise ? <section className={styles.dictation} aria-label={t("Rhythm dictation answer")}><h3>{t("Write what you heard")}</h3><p>{t("Place every drum hit on the grid. Empty cells are rests; check your answer to reveal the target.")}</p>{pads.filter(pad => exercise.pattern.hits.some(hit => hit.instrument === pad.voice)).map(pad => <fieldset className={styles.dictationVoice} key={pad.voice}><legend>{t(pad.label)}</legend><div className={styles.stepButtons}>{Array.from({ length: exercise.pattern.beats * exercise.pattern.subdivision / 4 }, (_, step) => { const active = dictationDraft.some(hit => hit.instrument === pad.voice && hit.step === step); return <button key={step} type="button" className={`${styles.stepButton} ${active ? styles.stepActive : ""}`} aria-pressed={active} aria-label={`${t(pad.label)} · ${t("Step")} ${step + 1} · ${t(active ? "Hit" : "Rest")}`} onClick={() => setDictationDraft(current => active ? current.filter(hit => hit.instrument !== pad.voice || hit.step !== step) : [...current, { instrument: pad.voice, step }])}>{active ? "●" : "·"}</button>; })}</div></fieldset>)}<button className="button" onClick={checkDictation}>{t("Check transcription")}</button></section> : null}
      {mode === "error" && phase === "answer" ? <fieldset className={styles.quizChoices}><legend>{t("Did the second phrase change?")}</legend><button className="button-secondary" onClick={() => choose(0)}>{t("Same rhythm")}</button><button className="button-secondary" onClick={() => choose(1)}>{t("A hit moved")}</button></fieldset> : null}
      {mode === "error" && phase === "locate" && exercise ? <fieldset className={styles.quizChoices}><legend>{t("Which step did the moved hit land on?")}</legend>{Array.from({ length: exercise.pattern.beats * exercise.pattern.subdivision / 4 }, (_, step) => <button className="button-secondary" key={step} onClick={() => chooseErrorStep(step)}>{t("Step")} {step + 1}</button>)}</fieldset> : null}
      {(mode === "play" || mode === "voice") && inputMode === "pads" ? <div className={styles.pads} aria-label={t("Answer pads")}>
        {visiblePads.map(pad => <button data-ear-pad key={pad.voice} className={styles.pad} disabled={phase !== "playing" && phase !== "count-in"} onPointerDown={event => { event.preventDefault(); hit(pad.voice); }} onClick={event => { if (event.detail === 0) hit(pad.voice); }}><strong>{t(pad.label)}</strong><kbd>{pad.key}</kbd></button>)}
        <small>{t(`Use keys Space, F, J, T, Y or touch. Play ${phraseBars === 1 ? "one bar" : "two bars"} from memory. Timing: Great ≤ 50 ms, Good ≤ 100 ms.`)}</small>
      </div> : null}
      {mode === "play" && inputMode === "microphone" ? <p className={styles.micNote} role="note">{t("Microphone detects clap or desk-tap onsets for single-drum rhythms. Use headphones to prevent speaker bleed; mic access starts only when you begin your answer.")}</p> : null}
      {(mode === "play" || mode === "voice") && inputMode === "midi" ? <p className={styles.micNote} role="note">{t("Connect a MIDI drum controller, configure its note map above, then allow MIDI access when you start your answer. MIDI velocity is used for accent and ghost-note scoring when a rhythm contains dynamic targets.")}</p> : null}
      {mode === "identify" && phase === "answer" && exercise ? <fieldset className={styles.choices}><legend>{t("Choose the rhythm you heard")}</legend>{exercise.choices.map((pattern, index) => <div className={styles.choice} key={pattern.id}><button className="button-secondary" onClick={() => choose(index)}>{t("Choose")} {String.fromCharCode(65 + index)}</button><RhythmGrid pattern={pattern} meter={meter} label={`${t("Option")} ${String.fromCharCode(65 + index)}`} /></div>)}</fieldset> : null}
      {(mode === "meter" || mode === "feel") && phase === "answer" && exercise ? <fieldset className={styles.quizChoices}><legend>{t(mode === "meter" ? "Choose the meter you heard" : "Choose the feel you heard")}</legend>{(mode === "meter" ? EAR_METERS : EAR_FEELS).map((option, index) => <button className="button-secondary" key={option} onClick={() => choose(index)}>{t(option)}</button>)}</fieldset> : null}
      {phase === "results" && exercise ? <section className={styles.results} aria-label={t("Ear training results")}>
        <h3 ref={resultHeading} tabIndex={-1}>{t(selected !== null ? correct ? "Correct rhythm!" : "Listen for the difference" : result ? "Your rhythm recap" : "Rhythm revealed")}</h3>
        {result ? <><p className={styles.score}>{result.summary.score}<small>/100</small></p><p>{t("Rhythm placement")}: {result.summary.placementScore}% · {t("Timing")}: {result.summary.timingScore}%</p>{result.summary.dynamicsScore !== null ? <p>{t("Accent and ghost-note dynamics")}: {result.summary.dynamicsScore}%</p> : null}<p>{t("Great")}: {result.summary.great} · {t("Good")}: {result.summary.good} · {t("Missed")}: {result.summary.miss} · {t("Extra")}: {result.summary.extra}</p><p>{t(answerExplanation)}</p></> : null}
        {selected !== null && (mode === "meter" || mode === "feel") ? <><p>{t("Your choice")}: {t(selectedAnswer)} · {t("Answer")}: {t(correctAnswer)}</p><p>{t(modeExplanation)}</p></> : null}
        {selected !== null && mode === "error" ? <><p>{t("Your choice")}: {t(selectedAnswer)} · {t("Answer")}: {t(correctAnswer)}</p>{errorLocation !== null ? <p>{t("You chose grid step")} {errorLocation + 1}.</p> : null}<p>{t(modeExplanation)}</p><RhythmGrid pattern={exercise.comparison?.pattern ?? exercise.pattern} meter={exercise.meter} label={t("Second phrase")} /></> : null}
        {selected !== null && mode === "identify" && !correct ? <p>{t(answerExplanation)}</p> : null}
        {mode === "voice" && exercise.voice ? <><p>{t("Isolated part")}: {t(pads.find(pad => pad.voice === exercise.voice)?.label ?? exercise.voice)}</p><RhythmGrid pattern={{ ...exercise.pattern, hits: exercise.pattern.hits.filter(hit => hit.instrument === exercise.voice) }} meter={exercise.meter} label={t("Isolated voice rhythm")} /></> : null}
        <RhythmGrid pattern={exercise.pattern} meter={exercise.meter} label={t("Target rhythm")} response={result?.rated} />
        <section className={styles.notationBridge} aria-label={t("Drum notation and count")}><h4>{t("Read and count the rhythm")}</h4><p>{t(exercise.pattern.subdivision === 20 ? "Count five equal notes across four quarter-note beats. The hi-hat marks the steady beat while the snare crosses it." : exercise.pattern.subdivision === 16 ? "Count sixteenths as 1-e-&-a across each beat." : exercise.pattern.subdivision === 12 ? "Count triplets as 1-trip-let across each beat." : exercise.meter === "6/8" ? "Feel two broad pulses and count each as 1-la-li." : "Count the steady subdivisions shown below each beat.")}</p><TrainerNotationView pattern={exercise.pattern} meter={exercise.meter} showRhythmStems /></section>
        {selected !== null && !correct && mode === "identify" ? <RhythmGrid pattern={exercise.choices[selected]!} meter={meter} label={t("Your chosen rhythm")} /> : null}
        <div className={styles.previewControls} aria-label={t("Compare the heard rhythm and your answer")}>
          <label>{t("Replay speed")}<select value={previewSpeed} onChange={event => setPreviewSpeed(Number(event.target.value) as 75 | 100)}><option value={75}>{t("Slower · 75%")}</option><option value={100}>{t("Original · 100%")}</option></select></label>
          {exercise.bars > 1 ? <label>{t("Replay section")}<select value={reviewSegment} onChange={event => setReviewSegment(event.target.value as "full" | "1" | "2")}><option value="full">{t("Full phrase")}</option><option value="1">{t("Bar 1")}</option><option value="2">{t("Bar 2")}</option></select></label> : null}
          {level === "groove" ? <label>{t("Hear a voice")}<select value={previewVoice} onChange={event => setPreviewVoice(event.target.value as Instrument | "all")}><option value="all">{t("All voices")}</option>{pads.map(pad => <option value={pad.voice} key={pad.voice}>{t(pad.label)}</option>)}</select></label> : null}
          <button className="button-secondary" disabled={busy} onClick={() => void playResultReview("target")}>{t("Hear target")}</button>
          {result ? <button className="button-secondary" disabled={busy} onClick={() => void playResultReview("answer")}>{t("Hear my answer")}</button> : null}
          <small>{t("Listen to the target and your recorded hits back-to-back in separate replays. This review does not change your score.")}</small>
        </div>
        {result ? <details><summary>{t("Hit timing details")}</summary><ul>{result.rated.map((hit, index) => <li key={index}>{t(pads.find(pad => pad.voice === hit.instrument)?.label ?? hit.instrument)} · {t(({ great: "Great", good: "Good", miss: "Missed", extra: "Extra" })[hit.rating])}{hit.offsetMs !== null ? ` · ${hit.offsetMs > 0 ? "+" : ""}${hit.offsetMs} ms` : ""}</li>)}</ul></details> : null}
        <div className={styles.actions}><button className="button" onClick={continuePractice}>{t(activePlan ? "Next plan drill" : activeChallenge ? "Next pack rhythm" : "Next rhythm")}</button><button className="button-secondary" onClick={() => { stop(); setAssisted(true); setSelected(null); setErrorLocation(null); setResult(null); setListens(0); setPhase("ready"); }}>{t("Retry this rhythm")}</button></div>
        <small>{t(activeChallenge ? "This is a saved challenge pack rhythm. Continue to the next rhythm in the pack." : "Retries after seeing the answer are practice and stay out of your first-attempt average.")}</small>
      </section> : null}
    </section>
    <aside className={`card ${styles.sidebar}`} aria-label={t("Ear training progress")}>
      <span className="eyebrow">{t("Your listening practice")}</span><h3>{t("Hear it. Hold it. Play it.")}</h3>
      <ol><li>{t("Listen to the count-in and the rhythm phrase.")}</li><li>{t("Remember the rhythm without looking at notes.")}</li><li>{t(mode === "play" ? inputMode === "microphone" ? "Tap or clap the rhythm into your microphone." : inputMode === "midi" ? "Play the rhythm on a MIDI drum controller." : "Tap it back on the drum pads or use Space, F, J, T, and Y." : mode === "voice" ? "Play only the isolated drum voice on pads, keys, or MIDI." : mode === "meter" ? "Name the time signature from the pulse grouping." : mode === "feel" ? "Listen for even notes or a long-short swing." : "Choose the matching rhythm grid.")}</li><li>{t("Review placement and timing, then keep practicing.")}</li></ol>
      <div className={styles.stat}><strong>{recent.length ? `${Math.round(recent.reduce((sum, item) => sum + item.score, 0) / recent.length)}%` : "—"}</strong><span>{t("Average of your last 10 first attempts at this exercise and difficulty")}</span></div>
      <section className={styles.trend} aria-label={t("Seven-day progress trend")}><h4>{t("Last seven days")}</h4>{recentDays.some(day => day.score !== null) ? <div className={styles.trendChart} role="img" aria-label={t("Daily average first-attempt scores for the last seven days")}>{recentDays.map(day => <div className={styles.trendDay} key={day.key} title={`${day.key}: ${day.score === null ? t("No attempts") : `${day.score}% · ${day.count} ${t("attempts")}`}`}><span className={styles.trendBar} style={{ "--bar-height": `${Math.max(4, day.score ?? 0)}%` } as CSSProperties} /><small>{t(day.label)}</small></div>)}</div> : <p>{t("Your unassisted daily averages will appear after you practice.")}</p>}</section>
      <section className={styles.practicePlan} aria-label={t("Custom practice session")}><h4>{t("Custom focused session")}</h4>{!activePlan ? <><label>{t("Session length")}<select value={sessionLength} disabled={busy} onChange={event => setSessionLength(Number(event.target.value) as SessionLength)}><option value={3}>{t("3 drills")}</option><option value={5}>{t("5 drills")}</option><option value={10}>{t("10 drills")}</option></select></label><label>{t("Focus skill")}<select value={sessionFocus} disabled={busy} onChange={event => setSessionFocus(event.target.value as PlanFocus)}><option value="automatic">{t("Automatic weak-skill focus")}</option>{(Object.keys(skillLabels) as EarSkill[]).filter(skill => skill !== "pulse-stability" && skill !== "tempo-control").map(skill => <option key={skill} value={skill}>{t(skillLabels[skill])}</option>)}</select></label><p>{t(planScores?.length === activePlanLength ? `Session complete · average ${Math.round(planScores.reduce((sum, score) => sum + score, 0) / activePlanLength)}%.` : recommendation ? `Automatic focus currently recommends ${skillLabels[recommendation.skill].toLowerCase()}.` : "Choose a skill or let your recent results guide the session.")}</p><button className="button-secondary" disabled={busy} onClick={startPracticePlan}>{t(planScores?.length === activePlanLength ? "Start another session" : "Start focused session")}</button></> : <><p>{t(`Session progress: ${planScores.length} of ${activePlanLength} drills · average ${Math.round(planScores.reduce((sum, score) => sum + score, 0) / Math.max(1, planScores.length))}%.`)}</p><progress max={activePlanLength} value={planScores.length} aria-label={t("Practice plan progress")} /></>}</section>
      <section className={styles.skillProgress} aria-label={t("Listening skill progress")}><h4>{t("Skills you are training")}</h4>{skillAverages.length ? <ul>{skillAverages.map(item => <li key={item.skill}><span>{t(skillLabels[item.skill])}</span><strong>{item.average}%</strong><small>{item.count} {t("first attempts")}</small></li>)}</ul> : <p>{t("Your listening skill breakdown will appear after your first few attempts.")}</p>}</section>
      <section className={styles.analytics} aria-label={t("Rhythm diagnostics")}><h4>{t("Rhythm diagnostics")}</h4><p>{t("Recent first attempts, grouped by the rhythm choices and drum voices you practiced. Each group shows its sample count.")}</p>
        {[{ label: "By meter", items: meterAverages.map(item => ({ ...item, label: item.key })) }, { label: "By feel", items: feelAverages.map(item => ({ ...item, label: t(item.key) })) }, { label: "By subdivision", items: subdivisionAverages.map(item => ({ ...item, label: t(subdivisionNames[item.key] ?? item.key) })) }].map(group => group.items.length ? <div className={styles.analyticsGroup} key={group.label}><strong>{t(group.label)}</strong><ul>{group.items.map(item => <li key={item.label}><span>{item.label}</span><small>{item.average}% · n={item.count}</small></li>)}</ul></div> : null)}
        {voiceAverages.length ? <div className={styles.analyticsGroup}><strong>{t("Placement by drum voice")}</strong><ul>{voiceAverages.map(item => <li key={item.instrument}><span>{t(pads.find(pad => pad.voice === item.instrument)?.label ?? item.instrument)}</span><small>{item.average}% · {item.matched}/{item.expected} {t("hits matched")} · {item.extra} {t("extra")}</small></li>)}</ul></div> : null}
        {timingSummary ? <p className={styles.timingInsight}>{t("Timing tendency")}: <strong>{Math.abs(timingSummary.mean)} ms {t(timingSummary.mean > 18 ? "late" : timingSummary.mean < -18 ? "early" : "from the pulse")}</strong> · {timingSummary.count} {t("timed hits")}</p> : null}
        {timingHeatmap.length ? <div className={styles.heatmap} role="group" aria-label={t("Timing by beat and subdivision")}><strong>{t("Timing by beat and subdivision")}</strong><ul>{timingHeatmap.map(cell => <li key={`${cell.grid}:${cell.beat}:${cell.subdivision}`} className={`${styles.heatCell} ${cell.accuracy >= 85 ? styles.heatStrong : cell.accuracy >= 60 ? styles.heatMedium : styles.heatNeedsWork}`} aria-label={`${cell.grid} ${t("grid")}, ${t("beat")} ${cell.beat}, ${t("slot")} ${cell.subdivision}: ${cell.accuracy}% ${t("matched")}, ${cell.meanOffsetMs === null ? t("no timing sample") : `${cell.meanOffsetMs > 0 ? "+" : ""}${cell.meanOffsetMs} ms`}`}><span>{cell.grid} {t("grid")} · {t("beat")} {cell.beat}.{cell.subdivision}</span><small>{cell.accuracy}% · {cell.matched}/{cell.expected} · {cell.meanOffsetMs === null ? t("no timing sample") : `${cell.meanOffsetMs > 0 ? "+" : ""}${cell.meanOffsetMs} ms`} · n={cell.expected + cell.extra}</small></li>)}</ul></div> : null}
        {dynamicsSummary ? <p className={styles.timingInsight}>{t("Accent and ghost-note dynamics")}: <strong>{dynamicsSummary.average}%</strong> · {dynamicsSummary.count} {t("MIDI attempts")}</p> : null}
        {!meterAverages.length && !feelAverages.length && !subdivisionAverages.length && !voiceAverages.length && !timingHeatmap.length ? <p>{t("More detailed rhythm diagnostics will appear after you complete a few unassisted tap-back rounds.")}</p> : null}
      </section>
      <section className={styles.recommendation} aria-label={t("Spaced review schedule")}><h4>{t("Spaced review")}</h4>{dueReviews.length ? <><p>{t(`${dueReviews.length} skills are due for a short review.`)}</p><ul className={styles.reviewList}>{dueReviews.map(item => <li key={item.skill}><span>{t(skillLabels[item.skill])}</span><small>{t("Last score")}: {item.lastScore}%</small><button className="button-secondary" disabled={busy} onClick={() => startDueReview(item)}>{t(item.skill === "pulse-stability" ? "Review pulse challenge" : "Review now")}</button></li>)}</ul></> : upcomingReview ? <p>{t("Next review")}: {t(skillLabels[upcomingReview.skill])} · {new Date(upcomingReview.dueAt).toLocaleDateString()}</p> : <p>{t("Unassisted results schedule skills for review. Strong scores stretch the interval; missed rhythms return sooner.")}</p>}</section>
      <section className={styles.recommendation} aria-label={t("Practice recommendation")}><h4>{t("Suggested focus")}</h4>{recommendation ? <><p>{t(skillLabels[recommendation.skill])} · {recommendation.average}% {t("across your recent first attempts")}</p><button className="button-secondary" disabled={busy} onClick={() => startSkillReview(recommendation.skill)}>{t(recommendation.skill === "pulse-stability" ? "Practice the pulse dropout" : "Practice this focus")} · {t(EAR_LEVELS.find(item => item.id === recommendation.level)!.label)}</button></> : <p>{t("Complete three unassisted first attempts in a skill to get a focused recommendation.")}</p>}</section>
      <p>{history.length} {t("saved attempts on this learner profile")}</p><p>{t("Ear training history stays on this device, separate from Trainer mastery. Full local backups include it.")}</p>
      {history.length ? <button className="button-secondary" onClick={() => { if (window.confirm(t("Clear ear training history for this learner?"))) { try { localStorage.removeItem(storageKey); localStorage.removeItem(reviewStorageKey); localStorage.removeItem(planStorageKey); historyRef.current = []; setHistory([]); setReviewSchedule([]); setPlanScores(null); setPlanSettings(null); } catch { setMessage(t("History could not be cleared.")); } } }}>{t("Clear ear training history")}</button> : null}
    </aside>
    <RhythmBuilder onSave={saveBuiltPatternToPack} />
    <section className={`card ${styles.builder}`} aria-label={t("Personal challenge packs")}>
      <span className="eyebrow">{t("Shareable practice sets")}</span><h3>{t("Personal challenge packs")}</h3>
      <p>{t("Save up to 12 rhythms in a pack, export a small JSON file, and share it with a teacher or practice partner. Imported packs are previewed before they are saved.")}</p>
      <div className={styles.builderControls}>
        <label>{t("Pack name")}<input type="text" maxLength={60} value={challengePackName} disabled={!challengePacksReady || busy} onChange={event => setChallengePackName(event.target.value)} /></label>
        <button className="button-secondary" disabled={!challengePacksReady || !exercise || busy} onClick={saveCurrentToPack}>{t("Save current rhythm to pack")}</button>
        <button className="button-secondary" disabled={!exercise || busy} onClick={exportCurrentMidi}>{t("Export current rhythm as MIDI")}</button>
        <label className={styles.packFile}>{t("Preview an imported pack")}<input type="file" accept="application/json,.json" disabled={!challengePacksReady || busy} onChange={event => { void previewChallengePack(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
      </div>
      {importedPack ? <section className={styles.packPreview} aria-label={t("Imported challenge pack preview")}>
        <h4>{t("Preview")}: {importedPack.name}</h4><p>{importedPack.items.length} {t("rhythms · preview before adding to this learner profile")}</p>
        {importedPack.assignment ? <p><strong>{t("Assigned to")}: {importedPack.assignment.learnerName}</strong> · {t("Due")}: {new Date(importedPack.assignment.dueAt).toLocaleDateString()}</p> : null}
        <ol>{importedPack.items.map((item, index) => <li key={item.id}>{index + 1}. {item.pattern.name} · {t(item.meter)} · {item.bars} {t("bars")} · {item.pattern.hits.length} {t("hits")}</li>)}</ol>
        <button className="button" disabled={!challengePacksReady || challengePacks.length >= 20} onClick={acceptImportedPack}>{t("Add imported pack")}</button>
        <button className="button-secondary" onClick={() => setImportedPack(null)}>{t("Cancel import")}</button>
      </section> : null}
      {challengePacks.length ? <ul className={styles.packList}>{challengePacks.map(pack => <li key={pack.id}>
        <div><strong>{pack.name}</strong><small>{pack.items.length} {t("rhythms")} · {new Date(pack.createdAt).toLocaleDateString()}</small><small>{pack.items.map(item => item.pattern.name).join(" · ")}</small>{pack.assignment ? <><small>{t("Assigned to")}: {pack.assignment.learnerName} · {t("Due")}: {new Date(pack.assignment.dueAt).toLocaleDateString()}</small>{teacherReports.some(report => report.assignmentId === pack.assignment?.id) ? <small>{t("Learner report received")}</small> : null}</> : null}</div>
        <div className={styles.packActions}><button className="button-secondary" disabled={!challengePacksReady || busy} onClick={() => startChallengePack(pack)}>{t("Practice pack")}</button><button className="button-secondary" disabled={!challengePacksReady} onClick={() => exportChallengePack(pack)}>{t("Export JSON")}</button><button className="button-secondary" disabled={!challengePacksReady} onClick={() => { setAssignmentPackId(pack.id); setPackMessage(""); }}>{t("Assign to learner")}</button>{pack.assignment ? <button className="button-secondary" disabled={!challengePacksReady} onClick={() => exportLearnerReport(pack)}>{t("Export learner report")}</button> : null}<button className="button-secondary" disabled={!challengePacksReady} onClick={() => { if (!window.confirm(t(`Delete the ${pack.name} challenge pack?`))) return; setChallengePacks(current => current.filter(item => item.id !== pack.id)); if (activeChallenge?.packId === pack.id) setActiveChallenge(null); }}>{t("Delete pack")}</button></div>
      </li>)}</ul> : <p>{t("Your saved challenge packs will appear here.")}</p>}
      {selectedAssignmentPack ? <section className={styles.packPreview} aria-label={t("Create teacher assignment")}><h4>{t("Assign rhythm pack")}: {selectedAssignmentPack.name}</h4><p>{t("Create a portable assignment file with the pack, learner name, and due date. The learner can send back a score report file.")}</p><div className={styles.builderControls}><label>{t("Learner name")}<input type="text" maxLength={60} value={assignmentLearnerName} onChange={event => setAssignmentLearnerName(event.target.value)} /></label><label>{t("Due date")}<input type="date" min={localDayKey()} value={assignmentDueAt} onChange={event => setAssignmentDueAt(event.target.value)} /><small>{t("Leave blank to set the due date one week from today.")}</small></label><button className="button" disabled={!assignmentLearnerName.trim()} onClick={() => exportTeacherAssignment(selectedAssignmentPack)}>{t("Export assignment file")}</button><button className="button-secondary" onClick={() => setAssignmentPackId("")}>{t("Cancel")}</button></div></section> : null}
      <section className={styles.teacherReports} aria-label={t("Teacher reports")}><h4>{t("Teacher assignments and reports")}</h4><p>{t("Import a learner report file to review first-attempt scores for an assigned rhythm pack. Reports stay in this browser profile.")}</p><label className={styles.packFile}>{t("Import learner report")}<input type="file" accept="application/json,.json" disabled={!teacherReportsReady} onChange={event => { void previewTeacherReport(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
        {importedTeacherReport ? <div className={styles.packPreview} aria-label={t("Learner report preview")}><h5>{importedTeacherReport.learnerName} · {importedTeacherReport.packName}</h5><p>{importedTeacherReport.results.length} {t("results")} · {t("Average")}: {importedTeacherReport.results.length ? Math.round(importedTeacherReport.results.reduce((sum, item) => sum + item.score, 0) / importedTeacherReport.results.length) : 0}% · {t("Due")}: {new Date(importedTeacherReport.dueAt).toLocaleDateString()}</p><ul>{importedTeacherReport.results.map((item, index) => <li key={`${item.playedAt}:${index}`}>{item.challengeIndex === undefined ? t("Attempt") : `${t("Rhythm")} ${item.challengeIndex + 1}`} · {item.itemName ?? t(item.mode)} · {item.score}% · {new Date(item.playedAt).toLocaleDateString()}{item.dynamicsScore === undefined ? "" : ` · ${t("Dynamics")}: ${item.dynamicsScore}%`}</li>)}</ul><button className="button" disabled={!teacherReportsReady} onClick={acceptTeacherReport}>{t("Save report")}</button><button className="button-secondary" onClick={() => setImportedTeacherReport(null)}>{t("Cancel")}</button></div> : null}
        {teacherReports.length ? <ul className={styles.packList}>{teacherReports.map(report => <li key={report.id}><div><strong>{report.learnerName} · {report.packName}</strong><small>{report.results.length} {t("results")} · {t("Average")}: {report.results.length ? Math.round(report.results.reduce((sum, item) => sum + item.score, 0) / report.results.length) : 0}%</small><small>{t("Submitted")}: {new Date(report.submittedAt).toLocaleDateString()} · {t("Due")}: {new Date(report.dueAt).toLocaleDateString()}</small><small>{report.results.map((item, index) => `${item.challengeIndex === undefined ? index + 1 : item.challengeIndex + 1}. ${item.itemName ?? t(item.mode)} ${item.score}%`).join(" · ")}</small></div><button className="button-secondary" onClick={() => setTeacherReports(current => current.filter(item => item.id !== report.id))}>{t("Remove report")}</button></li>)}</ul> : <p>{t("Imported learner reports will appear here.")}</p>}
      </section>
      {packMessage ? <p role="status" aria-live="polite">{packMessage}</p> : null}
    </section>
    <section className={`card ${styles.builder}`} aria-label={t("Curated groove lessons")}><span className="eyebrow">{t("Guided listening path")}</span><h3>{t("Curated groove lessons")}</h3><p>{t("Learn a groove by listening, echoing it, and noticing what each drum voice contributes. Earn two unassisted scores of 80% to unlock the next lesson.")}</p><ol className={styles.grooveLessons}>{EAR_GROOVE_LESSONS.map((lesson, index) => { const attempts = history.filter(item => !item.assisted && item.lessonId === lesson.id); const complete = attempts.filter(item => item.score >= 80).length >= 2; const locked = index >= lessonLimit; return <li key={lesson.id} className={locked ? styles.lessonLocked : ""}><div><strong>{t(lesson.name)}</strong><p>{t(lesson.concept)}</p><small>{t(lesson.hint)}</small>{complete ? <span className={styles.lessonComplete}>{t("Lesson complete")}</span> : null}</div><button className="button-secondary" disabled={busy || locked} onClick={() => startGrooveLesson(lesson)}>{t(locked ? "Complete the previous lesson" : complete ? "Practice again" : "Start lesson")}</button></li>; })}</ol></section>
    <PulseDropoutTrainer bpm={bpm} disabled={busy} onScore={(score, meter, bars) => save(score, ["pulse-stability"], "dropout", null, false, { meter, bars })} />
    <TempoEnduranceTrainer bpm={bpm} meter={meter} disabled={busy} onScore={(score, meter, challengeBpm) => save(score, ["tempo-control"], "tempo-ramp", null, false, { meter, bars: 8, bpm: challengeBpm })} />
  </div>;
}
