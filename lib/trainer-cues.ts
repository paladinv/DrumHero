import type { PracticePattern } from "./types";

export type TrainerCueMode = "off" | "fill" | "crash" | "loud" | "soft" | "random";
export type TrainerCueDensity = 1 | 2 | 4;
export type TrainerCueLead = 1 | 2;
export type TrainerCueCallout = { step: number; label: string };

export type TrainerCueResult = {
  pattern: PracticePattern;
  cueSteps: number[];
  label: string;
  hasDynamicsTargets: boolean;
  callouts?: TrainerCueCallout[];
};

export function createTrainerCuePattern(
  pattern: PracticePattern,
  mode: TrainerCueMode,
  beat = 1,
  fillStartStep?: number,
  seed = 1,
  cueEveryBars: TrainerCueDensity = 1,
  cueLeadBeats: TrainerCueLead = 1,
): TrainerCueResult {
  if (mode === "off") return { pattern, cueSteps: [], label: "", hasDynamicsTargets: false };

  const stepsPerBeat = Math.max(1, pattern.subdivision / 4);
  const barCount = getPatternBarCount(pattern);
  const stepsPerBar = Math.max(1, Math.round(pattern.beats * stepsPerBeat / barCount));
  const safeBeat = Math.max(1, Math.min(Math.floor(stepsPerBar / stepsPerBeat), Math.floor(beat)));
  const cueOffset = (safeBeat - 1) * stepsPerBeat;
  const barCueSteps = Array.from({ length: barCount }, (_, bar) => bar * stepsPerBar + cueOffset);

  if (mode === "fill") {
    if (!Number.isInteger(fillStartStep) || fillStartStep! <= 0 || fillStartStep! >= pattern.beats * stepsPerBeat) {
      return { pattern, cueSteps: [], label: "Turn on Groove → fill to add a scored fill cue.", hasDynamicsTargets: false };
    }
    return {
      pattern,
      cueSteps: [Math.max(0, fillStartStep! - stepsPerBeat)],
      label: "FILL · play the selected fill, then land back on the groove.",
      hasDynamicsTargets: false,
    };
  }

  if (mode === "crash") {
    const hits = [...pattern.hits];
    for (const step of barCueSteps) {
      const existing = hits.find((hit) => hit.step === step && hit.instrument === "crash");
      if (existing) existing.accent = true;
      else hits.push({ step, instrument: "crash", accent: true });
    }
    return {
      pattern: { ...pattern, id: `trainer-cue:crash:${pattern.id}`, name: `${pattern.name} · crash cue`, hits: hits.sort((a, b) => a.step - b.step) },
      cueSteps: barCueSteps,
      label: `CRASH · add a crash accent on beat ${safeBeat}.`,
      hasDynamicsTargets: false,
    };
  }

  if (mode === "random") {
    let state = seed >>> 0 || 1;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const callouts: TrainerCueCallout[] = [];
    const hits = [...pattern.hits.map(hit => ({ ...hit }))];
    let hasDynamicsTargets = false;
    const beatsPerBar = Math.max(1, Math.floor(stepsPerBar / stepsPerBeat));
    const requestedDensity: TrainerCueDensity = [1, 2, 4].includes(cueEveryBars) ? cueEveryBars : 1;
    const safeDensity = Math.min(requestedDensity, barCount);
    const safeLead = Math.min(Math.max(1, cueLeadBeats), Math.max(1, beatsPerBar - 1));
    for (let bar = 0; bar < barCount; bar += safeDensity) {
      const firstResponseBeat = Math.min(beatsPerBar, safeLead + 1);
      const responseBeat = firstResponseBeat + Math.floor(random() * Math.max(1, beatsPerBar - firstResponseBeat + 1));
      const responseStep = bar * stepsPerBar + (responseBeat - 1) * stepsPerBeat;
      const cueStep = Math.max(bar * stepsPerBar, responseStep - safeLead * stepsPerBeat);
      let response = Math.floor(random() * 3);
      const barEnd = (bar + 1) * stepsPerBar;
      if (response !== 0 && !hits.some(hit => hit.step >= responseStep && hit.step < barEnd)) response = 0;
      if (response === 0) {
        const crash = hits.find(hit => hit.step === responseStep && hit.instrument === "crash");
        if (crash) crash.accent = true;
        else hits.push({ step: responseStep, instrument: "crash", accent: true });
        callouts.push({ step: cueStep, label: `Next: crash on beat ${responseBeat}.` });
      } else {
        const loud = response === 1;
        hasDynamicsTargets = true;
        for (let index = 0; index < hits.length; index += 1) {
          const hit = hits[index];
          if (hit.step < bar * stepsPerBar || hit.step >= (bar + 1) * stepsPerBar) continue;
          const changed = hit.step >= responseStep;
          hits[index] = { ...hit, ...(changed && loud ? { accent: true } : {}), velocityTarget: changed ? (loud ? 105 : 35) : (loud ? 55 : 78) };
        }
        callouts.push({ step: cueStep, label: `Next: play ${loud ? "louder" : "softer"} from beat ${responseBeat}.` });
      }
    }
    const encodedId = encodeURIComponent(pattern.id);
    return {
      pattern: { ...pattern, id: `trainer-cue:random:${encodedId}:${seed >>> 0}`, name: `${pattern.name} · random cues`, hits: hits.sort((a, b) => a.step - b.step) },
      cueSteps: callouts.map(callout => callout.step),
      callouts,
      label: `Random cue sequence · respond ${safeLead} beat${safeLead === 1 ? "" : "s"} after each callout, every ${safeDensity} bar${safeDensity === 1 ? "" : "s"} in this phrase.`,
      hasDynamicsTargets,
    };
  }

  const loud = mode === "loud";
  const hits = pattern.hits.map((hit) => {
    const beatInBar = Math.floor((hit.step % stepsPerBar) / stepsPerBeat) + 1;
    const changed = beatInBar >= safeBeat;
    return {
      ...hit,
      accent: changed ? loud : hit.accent,
      velocityTarget: changed ? (loud ? 105 : 35) : (loud ? 55 : 78),
    };
  });

  return {
    pattern: { ...pattern, id: `trainer-cue:${mode}:${pattern.id}`, name: `${pattern.name} · ${loud ? "louder" : "softer"} cue`, hits },
    cueSteps: barCueSteps,
    label: `${loud ? "LOUDER" : "SOFTER"} · change your stroke strength from beat ${safeBeat}.`,
    hasDynamicsTargets: true,
  };
}

function getPatternBarCount(pattern: PracticePattern) {
  const meter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "";
  const parsed = Number(meter.match(/^(\d+)\s+bars?\b/i)?.[1] ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
