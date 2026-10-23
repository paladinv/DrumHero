import type { TrainerRound } from "./trainer";

export type TrainerInputQualityPoint = {
  id: string;
  playedAt: string;
  source: string;
  uncertainDetections: number;
  inputClipped: boolean;
  reliable: boolean;
};

export type TrainerInputQualitySummary = {
  rounds: TrainerInputQualityPoint[];
  audioRounds: number;
  cleanAudioRounds: number;
  flaggedAudioRounds: number;
  audioReliabilityPercent: number | null;
};

export type TrainerInputQualityAdvice = { title: string; message: string; action: "lower-gain" | "reduce-noise" | "recalibrate" | "keep-setup" | "collect-data" };

export function trainerInputQualityAdvice(summary: TrainerInputQualitySummary): TrainerInputQualityAdvice | null {
  if (!summary.audioRounds) return null;
  const recent = summary.rounds.slice(0, 3);
  const recentClips = recent.filter(point => point.inputClipped).length;
  const recentUncertain = recent.reduce((total, point) => total + point.uncertainDetections, 0);
  if (recentClips >= 2) return { title: "Lower the input gain", message: "Clipping showed up in multiple recent rounds. Turn down the kit or interface output, then recalibrate this profile before comparing scores.", action: "lower-gain" };
  if (recentUncertain >= 3) return { title: "Reduce room noise and recalibrate", message: "Several recent hits were uncertain. Move the microphone closer to the kit, reduce nearby sound, and recalibrate the target voice.", action: "reduce-noise" };
  if (summary.audioReliabilityPercent !== null && summary.audioReliabilityPercent >= 90 && summary.audioRounds >= 5) return { title: "Keep this setup", message: "Recent audio rounds are consistently clear. Keep the same mic position and gain so timing comparisons stay useful.", action: "keep-setup" };
  if (summary.flaggedAudioRounds > 0) return { title: "Recalibrate before the next comparison", message: "At least one recent round had an input-quality flag. Recheck the noise floor and target-voice calibration, then compare the next clean round.", action: "recalibrate" };
  return { title: "Collect a few more rounds", message: "Recent audio input is clear so far. A few more rounds will make this profile’s reliability estimate more useful.", action: "collect-data" };
}

export function summarizeTrainerInputQuality(rounds: TrainerRound[], profileKey: string, limit = 10): TrainerInputQualitySummary {
  const matching = rounds
    .filter(round => round.mode === "scored" && round.result && (round.inputProfile ?? round.source) === profileKey && round.source.startsWith("audio-"))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
    .slice(0, Math.max(0, limit));
  const points = matching.map(round => {
    const uncertainDetections = round.uncertainDetections ?? 0;
    const inputClipped = Boolean(round.inputClipped);
    return {
      id: round.id,
      playedAt: round.playedAt,
      source: round.source,
      uncertainDetections,
      inputClipped,
      reliable: uncertainDetections === 0 && !inputClipped,
    };
  });
  const cleanAudioRounds = points.filter(point => point.reliable).length;
  return {
    rounds: points,
    audioRounds: points.length,
    cleanAudioRounds,
    flaggedAudioRounds: points.length - cleanAudioRounds,
    audioReliabilityPercent: points.length ? Math.round(cleanAudioRounds / points.length * 100) : null,
  };
}
