"use client";

import { backbeatPulseIndices, challengeTargets, exchangeStart, improvisationPhraseSettings, improvisationPosition, improvisationScoreGrid, meterParts, notationFlagCount, phraseDuration, playerPhraseStart, PROMPT_LABELS, stepDuration, virtualDrummerResponse, type ImprovisationHit, type ImprovisationPosition, type ImprovisationSettings, type ImprovisationTake } from "@/lib/improvisation";
import type { Instrument } from "@/lib/types";
import { DrumStaffNotation, type DrumNotationEvent, type DrumNotationFrame } from "./TrainerNotationView";
import { useLocalization } from "./LocalizationProvider";

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

export function ImprovisationNotation({ settings, drummerSettings, position, hits, completedTake }: {
  settings: ImprovisationSettings;
  drummerSettings: ImprovisationSettings;
  position: ImprovisationPosition;
  hits: ImprovisationHit[];
  completedTake?: ImprovisationTake | null;
}) {
  const { t } = useLocalization();
  const phraseSettings = improvisationPhraseSettings(settings, position.phrase);
  const duration = phraseDuration(phraseSettings);
  const { stepsPerPulse, stepsPerBar } = meterParts(phraseSettings);
  const steps = stepsPerBar * phraseSettings.bars;
  const phase = position.phase === "paused" || position.phase === "count-in" ? improvisationPosition(settings, position.elapsedMs).phase : position.phase;
  const phrase = position.phase === "complete" && completedTake ? Math.max(0, completedTake.phrases - 1) : position.phrase;
  const partnerTurn = settings.mode === "trading" && phase === "partner";
  const playerTurn = phase === "player" || phase === "complete";
  const turnStart = partnerTurn ? exchangeStart(settings, phrase) : playerPhraseStart(settings, phrase);
  const timeInTurn = clamp(position.elapsedMs - turnStart, 0, duration);
  const playheadStep = timeInTurn / stepDuration(phraseSettings);
  const canShowSession = ["count-in", "partner", "player", "paused", "complete"].includes(position.phase);
  const showPlayhead = canShowSession && !["loading", "stopped"].includes(position.phase);
  const prompt = position.phase === "idle" || position.phase === "stopped" ? phraseSettings.prompt : position.prompt;

  let events: DrumNotationEvent[] = [];
  const takeHits = position.phase === "complete" && completedTake ? completedTake.hits : hits;
  if (partnerTurn) {
    const previousStart = phrase > 0 ? playerPhraseStart(settings, phrase - 1) : -1;
    const previousSettings = phrase > 0 ? improvisationPhraseSettings(settings, phrase - 1) : phraseSettings;
    const previousDuration = phraseDuration(previousSettings);
    const previousHits = phrase > 0 ? takeHits.filter(hit => hit.atMs >= previousStart && hit.atMs < previousStart + previousDuration).map(hit => ({ ...hit, atMs: (hit.atMs - previousStart) / stepDuration(previousSettings) * stepDuration(phraseSettings) })) : [];
    events = virtualDrummerResponse(phrase, drummerSettings, previousHits).map(hit => {
      const step = Math.max(0, Math.min(steps - 0.001, hit.step + (drummerSettings.challenge === "none" ? drummerSettings.pocketMs / stepDuration(drummerSettings) : 0)));
      return { step, instrument: hit.instrument, source: "reference" as const, velocityTarget: hit.velocityTarget, flagCount: notationFlagCount(drummerSettings, step), accent: (hit.velocityTarget ?? 0) >= 108 };
    });
    if (settings.scoreReveal !== "full" && showPlayhead) events = events.filter(event => event.step <= playheadStep + (settings.scoreReveal === "one-bar" ? stepsPerBar : 0));
  } else if (playerTurn) {
    const start = playerPhraseStart(settings, phrase);
    events = takeHits.filter(hit => hit.atMs >= start && hit.atMs < start + duration).map(hit => ({
      step: (hit.atMs - start) / stepDuration(phraseSettings),
      instrument: hit.instrument,
      source: "played" as const,
      flagCount: notationFlagCount(phraseSettings, (hit.atMs - start) / stepDuration(phraseSettings)),
      velocity: hit.velocity,
      articulation: hit.articulation,
      accent: (hit.velocity ?? 0) >= 108,
    }));
  }

  const guideEvents: DrumNotationEvent[] = [];
  const regions: NonNullable<DrumNotationFrame["regions"]> = [];
  const allowedInstruments: Instrument[] | undefined = playerTurn && settings.challenge === "custom" ? settings.customChallenge.allowed : playerTurn && prompt === "two-voices" ? ["kick", "snare"] : undefined;
  const showingPlayer = !partnerTurn && playerTurn && canShowSession;
  if (showingPlayer) {
    if (settings.entry !== "none") guideEvents.push({ step: 0, instrument: settings.entry, source: "target", flagCount: 0, accent: true });
    if (phraseSettings.challenge !== "none" && settings.mode === "trading") {
      guideEvents.push(...challengeTargets(phraseSettings, phrase).map(hit => ({ step: hit.step, instrument: hit.instrument, source: "target" as const, flagCount: notationFlagCount(phraseSettings, hit.step), velocityTarget: hit.velocityTarget })));
    } else if (prompt === "backbeat") {
      for (let bar = 0; bar < phraseSettings.bars; bar++) for (const beat of backbeatPulseIndices(phraseSettings)) {
        { const step = bar * stepsPerBar + beat * stepsPerPulse; guideEvents.push({ step, instrument: "snare", source: "target", flagCount: notationFlagCount(phraseSettings, step) }); }
      }
    }
    if (prompt === "space") for (let bar = 0; bar < phraseSettings.bars; bar++) {
      const start = bar * stepsPerBar + stepsPerBar - stepsPerPulse;
      regions.push({ start, end: start + stepsPerPulse, kind: "rest", label: t("Requested beat-4 rest") });
    }
    if (phraseSettings.challenge === "custom") for (const beat of phraseSettings.customChallenge.rests) {
      const start = beat * stepsPerPulse;
      regions.push({ start, end: start + stepsPerPulse, kind: "rest", label: t("Custom requested rest") });
    }
    events = [...events, ...guideEvents];
  }

  const ensemblePlayer = position.activePlayer === null ? undefined : settings.ensemblePlayers[position.activePlayer - 1];
  const name = partnerTurn
    ? t("Virtual drummer phrase")
    : settings.mode === "duet"
      ? position.activePlayer === 2 ? settings.playerTwoName : settings.playerOneName
      : settings.mode === "ensemble" ? t("{name} · {role}", { name: ensemblePlayer?.name ?? t("Player {number}", { number: position.activePlayer ?? 1 }), role: ensemblePlayer?.role === "open" ? t("open kit") : ensemblePlayer?.role === "listen" ? t("listening") : t(ensemblePlayer?.role ?? "open") })
      : settings.mode === "guided" ? t("Your phrase · {prompt}", { prompt: t(PROMPT_LABELS[prompt]) })
        : t("Your phrase");

  const grid = improvisationScoreGrid(phraseSettings);

  const guideDescriptions = showingPlayer ? [
    ...(phraseSettings.entry !== "none" ? [t("Outlined note marks the required beat-1 entry.")] : []),
    ...(prompt === "backbeat" ? [t("Outlined snare notes mark the backbeat targets.")] : []),
    ...(prompt === "space" ? [t("Shaded areas mark the requested rests.")] : []),
    ...(phraseSettings.challenge !== "none" ? [t("Outlined notes mark challenge targets; extra notes are allowed.")] : []),
    ...(phraseSettings.challenge === "custom" ? [t("Only the listed drums are allowed. Shaded beats are custom rests.")] : []),
  ] : [];
  const frame: DrumNotationFrame = {
    name,
    meter: phraseSettings.meter,
    bars: phraseSettings.bars,
    stepsPerBar,
    totalSteps: steps,
    stepsPerPulse,
    grid,
    events,
    showRests: partnerTurn || position.phase === "complete",
    flagCount: phraseSettings.subdivision === "sixteenth" ? 2 : 1,
    ...(showPlayhead ? { playheadStep, playheadTransitionMs: ["partner", "player"].includes(position.phase) ? 60_000 / phraseSettings.bpm * (stepsPerPulse / 4) : 0 } : {}),
    ...(regions?.length ? { regions } : {}),
    ...(allowedInstruments ? { allowedInstruments } : {}),
    autoFollow: showPlayhead,
    emptyCountLabel: t("No note at this count yet"),
    guidance: guideDescriptions,
  };
  const scoreKey = `${settings.mode}:${phrase}:${partnerTurn ? "partner" : "player"}`;

  return <DrumStaffNotation key={scoreKey} frame={frame} showRhythmStems improvisationControls />;
}
