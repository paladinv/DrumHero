"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { assessmentContent, appliedAssessment, assessmentRecommendation, assessmentRecommendationReason, comparableAssessmentRound } from "@/lib/assessment";
import { useAssessment } from "./useAssessment";
import { lessons, patterns } from "@/lib/curriculum";
import { readCustomGrooves } from "@/lib/custom-grooves";
import { allSongs, readActiveSongLibrary, songPartPattern, type DrumSong } from "@/lib/song-library";
import { trainerStorageKey, parseTrainerState, type TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";
import { recommendNext } from "@/lib/progress";
import { localizedPattern } from "@/lib/teaching-pattern-display";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";
import { dailySessionStorageKey, parseDailyPracticeSession, type DailyPracticeSession } from "@/lib/daily-practice-session";
import { learnerStorageKey } from "@/lib/learner-profiles";

type PlanKind = "warmup" | "focus" | "transfer" | "music";
type BridgeArea = "reading" | "listening" | "creative";
type PlanItem = { kind: PlanKind; title: string; reason: string; pattern: PracticePattern; activity?: BridgeArea };

const planTitles: Record<PlanKind, string> = { warmup: "Warm up", focus: "Focus", transfer: "Try it another way", music: "Apply musically" };
const bundledOptions = [...patterns].sort((a, b) => a.name.localeCompare(b.name));
const DAILY_DURATION_KEY = "drum-hero:daily-practice-duration:v1";
const DAILY_BRIDGE_KEY = "drum-hero:daily-practice-bridge:v1";
const bridgeOptions: Record<BridgeArea, { label: string; reason: string; href: string }> = {
  reading: { label: "Read a fresh rhythm", reason: "Reading gives you a new phrase to apply; its score stays in the reading activity.", href: "/sight-reading" },
  listening: { label: "Hear it, play it back", reason: "Listen to a fresh rhythm, then play it back from memory.", href: "/ear-training" },
  creative: { label: "Create a phrase", reason: "Use the focus pattern as a starting point for a short creative phrase.", href: "/improvisation" }
};

function assessmentBridge(goal: string | undefined): BridgeArea {
  if (goal === "read-notation") return "reading";
  if (goal === "play-expressively") return "creative";
  return "listening";
}

function parseBridgeArea(value: string | null): BridgeArea | null {
  return value === "reading" || value === "listening" || value === "creative" ? value : null;
}

function dueSongPattern(songs: DrumSong[], reviews: ReturnType<typeof readActiveSongLibrary>["reviews"], progress: ReturnType<typeof readActiveSongLibrary>["progress"]): PracticePattern | undefined {
  const now = Date.now();
  const due = [
    ...reviews.map((review) => ({ songId: review.songId, sectionId: review.sectionId, dueAt: review.dueAt })),
    ...progress.flatMap((item) => item.dueAt ? [{ songId: item.songId, sectionId: item.sectionId, dueAt: item.dueAt }] : [])
  ].filter((item) => Date.parse(item.dueAt) <= now).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  if (!due) return undefined;
  const song = songs.find((item) => item.id === due.songId);
  const section = song?.sections.find((item) => item.id === due.sectionId) ?? song?.sections[0];
  const part = section?.parts[0];
  return song && section && part ? songPartPattern(song, section, part) : undefined;
}

function weakestPattern(rounds: TrainerRound[], choices: PracticePattern[], allowAdapted = false): PracticePattern | undefined {
  const recent = rounds.filter((round) => round.mode === "scored" && round.result && !round.uncertainDetections && !round.inputClipped && !round.focusedDrill && !round.learningMode && (allowAdapted || !round.adaptation || round.adaptation === "standard")).sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 50);
  const grouped = new Map<string, TrainerRound[]>();
  for (const round of recent) grouped.set(round.patternId, [...(grouped.get(round.patternId) ?? []), round]);
  const ranked = [...grouped.entries()].flatMap(([id, roundsForPattern]) => {
    const sample = roundsForPattern.slice(0, 5);
    if (sample.length < 2) return [];
    return [{ id, accuracy: sample.reduce((sum, round) => sum + (round.result?.accuracy ?? 0), 0) / sample.length, count: sample.length }];
  }).sort((a, b) => a.accuracy - b.accuracy || b.count - a.count);
  return choices.find((item) => item.id === ranked[0]?.id);
}

export function DailyPracticePlan() {
  const { progress, profileId } = useProgress();
  const router = useRouter();
  const { formatNumber, locale, t } = useLocalization();
  const { store } = useAssessment(profileId);
  const baseline = appliedAssessment(store);
  const [choices, setChoices] = useState<PracticePattern[]>(bundledOptions);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [savedSession, setSavedSession] = useState<DailyPracticeSession | null>(null);
  const [duration, setDuration] = useState<5 | 12 | 20>(12);
  const [bridgeArea, setBridgeArea] = useState<BridgeArea>("listening");

  useEffect(() => {
    const durationKey = learnerStorageKey(DAILY_DURATION_KEY, profileId);
    const bridgeKey = learnerStorageKey(DAILY_BRIDGE_KEY, profileId);
    const loadPreferences = () => {
      let preferredBridge = assessmentBridge(baseline?.goal);
      try {
        const storedDuration = Number(window.localStorage.getItem(durationKey));
        if (storedDuration === 5 || storedDuration === 12 || storedDuration === 20) setDuration(storedDuration);
        else setDuration(12);
        preferredBridge = parseBridgeArea(window.localStorage.getItem(bridgeKey)) ?? preferredBridge;
      } catch {
        setDuration(12);
      }
      setBridgeArea(preferredBridge);
      setItems((current) => current.map((item) => item.kind === "transfer"
        ? { ...item, activity: preferredBridge, reason: bridgeOptions[preferredBridge].reason }
        : item));
    };
    loadPreferences();
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === durationKey || event.key === bridgeKey) loadPreferences(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [profileId, baseline?.goal]);

  useEffect(() => {
    const key = dailySessionStorageKey(profileId);
    const load = () => {
      try { setSavedSession(parseDailyPracticeSession(window.localStorage.getItem(key))); }
      catch { setSavedSession(null); }
    };
    const timer = window.setTimeout(load, 0);
    const onStorage = (event: StorageEvent) => { if (event.key === key) load(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("drum-hero:daily-session-change", load);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", onStorage); window.removeEventListener("drum-hero:daily-session-change", load); };
  }, [profileId]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      let preferredBridge = assessmentBridge(baseline?.goal);
      try {
        preferredBridge = parseBridgeArea(window.localStorage.getItem(learnerStorageKey(DAILY_BRIDGE_KEY, profileId))) ?? preferredBridge;
      } catch { /* Use the assessment-based default when browser storage is unavailable. */ }
      const localChoices = [
        ...bundledOptions,
        ...readCustomGrooves(),
        ...allSongs(readActiveSongLibrary()).flatMap((song) => song.sections.flatMap((section) => section.parts.map((part) => songPartPattern(song, section, part))))
      ];
      const library = readActiveSongLibrary();
      const dueSong = dueSongPattern(allSongs(library), library.reviews, library.progress);
      let rounds: TrainerRound[] = [];
      try { rounds = parseTrainerState(window.localStorage.getItem(trainerStorageKey(profileId))).rounds; }
      catch { /* Build a curriculum-based plan when browser storage is unavailable. */ }
      const weakest = weakestPattern(baseline ? rounds.filter(r => comparableAssessmentRound(r, baseline)) : rounds, localChoices, !!baseline);
      const nextLesson = lessons.find(l => l.id === (baseline ? assessmentRecommendation(baseline) : null)) ?? recommendNext(progress.completedLessons);
      const warmup = localChoices.find((item) => item.id === "quarter-pulse") ?? bundledOptions[0];
      const musical = dueSong ?? localChoices.find((item) => item.id === "motown-pocket") ?? bundledOptions[0];
      const fallbackFocusId = assessmentContent.focusPatterns[nextLesson.id] ?? nextLesson.practicePatternId ?? "first-beat";
      const focus = weakest && weakest.id !== warmup.id && weakest.id !== musical.id
        ? weakest
        : localChoices.find((item) => item.id === fallbackFocusId) ?? localChoices.find((item) => item.id !== warmup.id && item.id !== musical.id) ?? bundledOptions[1];
      const focusReason = weakest && weakest.id === focus.id
        ? "Your lowest recent reliable scored pattern; take it slowly and build control."
        : baseline
          ? t(assessmentRecommendationReason(baseline))
          : t("Practice the exercise for “{lesson}”. Scored results will personalize this step.", { lesson: t(nextLesson.title) });
      setChoices(localChoices);
      setItems([
        { kind: "warmup", title: planTitles.warmup, reason: "Settle into an even pulse for a few minutes.", pattern: warmup },
        { kind: "focus", title: planTitles.focus, reason: focusReason, pattern: focus },
        { kind: "transfer", title: planTitles.transfer, reason: bridgeOptions[preferredBridge].reason, pattern: focus, activity: preferredBridge },
        { kind: "music", title: planTitles.music, reason: dueSong ? "This song section is due for review." : "Put the pulse into an original groove.", pattern: musical }
      ]);
    }, 0);
    return () => window.clearTimeout(task);
  }, [profileId, progress.completedLessons, baseline, t]);

  const selectPattern = (kind: PlanKind, patternId: string) => {
    const pattern = choices.find((item) => item.id === patternId);
    if (pattern) setItems((current) => current.map((item) => item.kind === kind ? {
      ...item,
      pattern,
      reason: item.kind === "music"
        ? pattern.id.startsWith("song:") ? "Song section selected for focused review." : "Put the pulse into an original groove."
        : item.kind === "focus" ? "Pattern selected for focused practice." : item.reason
    } : item));
  };

  const changeDuration = (value: string) => {
    const next = Number(value);
    if (next !== 5 && next !== 12 && next !== 20) return;
    setDuration(next);
    try { window.localStorage.setItem(learnerStorageKey(DAILY_DURATION_KEY, profileId), String(next)); } catch { /* Keep the choice for this page visit. */ }
  };

  const changeBridgeArea = (value: string) => {
    const next = parseBridgeArea(value);
    if (!next) return;
    setBridgeArea(next);
    setItems((current) => current.map((item) => item.kind === "transfer"
      ? { ...item, activity: next, reason: bridgeOptions[next].reason }
      : item));
    try { window.localStorage.setItem(learnerStorageKey(DAILY_BRIDGE_KEY, profileId), next); } catch { /* Keep the choice for this page visit. */ }
  };

  const startSession = () => {
    if (!items.length) return;
    const minutesByStep = duration === 5 ? [1, 2, 1, 1] : duration === 20 ? [4, 7, 4, 5] : [3, 4, 2, 3];
    const steps = items.map((item, index) => ({
      id: item.kind,
      title: item.title,
      reason: item.reason,
      patternId: item.kind === "transfer" ? `activity:${item.activity}` : item.pattern.id,
      patternName: item.kind === "transfer" ? bridgeOptions[item.activity ?? bridgeArea].label : localizedPattern(item.pattern, locale).name,
      minutes: minutesByStep[index] ?? 1,
      href: item.kind === "transfer"
        ? bridgeOptions[item.activity ?? bridgeArea].href
        : item.kind === "music" || item.pattern.id.startsWith("song:")
          ? `/practice?pattern=${encodeURIComponent(item.pattern.id)}`
          : `/trainer?pattern=${encodeURIComponent(item.pattern.id)}${baseline ? `&adaptation=${baseline.adaptation === "hands-only" ? "seated" : baseline.adaptation}` : ""}`
    }));
    const session: DailyPracticeSession = {
      version: 1, id: crypto.randomUUID(), createdAt: new Date().toISOString(), steps,
      completedStepIds: [], skippedStepIds: [], elapsedMs: 0, runStartedAt: null, completedAt: null
    };
    try {
      window.localStorage.setItem(dailySessionStorageKey(profileId), JSON.stringify(session));
      if (navigator.onLine) router.push("/practice/session");
      else window.location.assign("/practice/session");
    } catch {
      window.alert(t("Could not save this session on this device."));
    }
  };

  return <section className="daily-plan card" aria-labelledby="daily-plan-heading">
    <div className="daily-plan-heading">
      <div><span className="eyebrow">{t("A focused session")}</span><h2 id="daily-plan-heading">{t("Your practice plan")}</h2></div>
      <p>{t("Choose how much time you have. Move from a steady pulse to a focused pattern, a fresh skill challenge, and a musical application.")}</p>
    </div>
    <label className="daily-plan-duration"><span>{t("Time available")}</span><select value={duration} onChange={(event) => changeDuration(event.target.value)}><option value={5}>{formatNumber(5)} {t("min")}</option><option value={12}>{formatNumber(12)} {t("min")}</option><option value={20}>{formatNumber(20)} {t("min")}</option></select></label>
    <div className="daily-plan-session-actions">
      <button className="button" type="button" disabled={!items.length} onClick={startSession}>{t("Start full session")}</button>
      {savedSession && !savedSession.completedAt && <Link className="button-secondary" href="/practice/session">{t("Resume saved session")}</Link>}
      {savedSession?.completedAt && <span role="status">{t("Your last guided session is complete.")}</span>}
    </div>
    {items.length ? <ol className="daily-plan-items">
      {items.map((item, index) => {
        const minutesByStep = duration === 5 ? [1, 2, 1, 1] : duration === 20 ? [4, 7, 4, 5] : [3, 4, 2, 3];
        const href = item.kind === "transfer"
          ? bridgeOptions[item.activity ?? bridgeArea].href
          : item.kind === "music" || item.pattern.id.startsWith("song:")
            ? `/practice?pattern=${encodeURIComponent(item.pattern.id)}`
            : `/trainer?pattern=${encodeURIComponent(item.pattern.id)}${baseline ? `&adaptation=${baseline.adaptation === "hands-only" ? "seated" : baseline.adaptation}` : ""}`;
        return <li key={item.kind}>
          <span className="daily-plan-number">{index + 1}</span>
          <div className="daily-plan-copy"><strong>{t(item.title)} · {formatNumber(minutesByStep[index] ?? 1)} {t("min")}</strong><span>{t(item.reason)}</span></div>
          {item.kind === "transfer" ? <label><span className="visually-hidden">{t("Choose a transfer activity")}</span><select value={item.activity ?? bridgeArea} onChange={(event) => changeBridgeArea(event.target.value)}>{(Object.keys(bridgeOptions) as BridgeArea[]).map((area) => <option key={area} value={area}>{t(bridgeOptions[area].label)}</option>)}</select></label> : <label><span className="visually-hidden">{t("Choose {step} pattern", { step: t(item.title).toLowerCase() })}</span><select value={item.pattern.id} onChange={(event) => selectPattern(item.kind, event.target.value)}>{choices.map((pattern) => <option key={`${item.kind}-${pattern.id}`} value={pattern.id}>{localizedPattern(pattern, locale).name}</option>)}</select></label>}
          <Link className="button-secondary" href={href}>{t("Start")}</Link>
        </li>;
      })}
    </ol> : <p className="daily-plan-loading">{t("Building your plan from this browser’s practice history…")}</p>}
    <small className="daily-plan-note">{t("Recommendations use your local practice history and song review dates. Activity scores remain separate, and fresh challenges use their own progress history.")}</small>
  </section>;
}
