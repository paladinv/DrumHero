import type { Instrument, PracticePattern } from "./types";
import type { TrainerCueInstruction } from "./trainer-cue-sequences";

export type TrainerCueMode = "off" | "fill" | "crash" | "loud" | "soft" | "dropout" | "accent-shift" | "custom" | "random";
export type TrainerCueDensity = 1 | 2 | 4;
export type TrainerCueLead = 1 | 2;
export type TrainerCueCallout = { step: number; label: string; repetition?: number; bar?: number };

export type TrainerCueResult = {
  pattern: PracticePattern;
  cueSteps: number[];
  label: string;
  hasDynamicsTargets: boolean;
  callouts?: TrainerCueCallout[];
  repetitionPatterns?: PracticePattern[];
};

export function createTrainerCuePattern(
  pattern: PracticePattern,
  mode: TrainerCueMode,
  beat = 1,
  fillStartStep?: number,
  seed = 1,
  cueEveryBars: TrainerCueDensity = 1,
  cueLeadBeats: TrainerCueLead = 1,
  repetitions = 1,
  cueVoice: Instrument = "hihat",
  customCues: TrainerCueInstruction[] = [],
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

  if (mode === "dropout") {
    const totalSteps = Math.round(pattern.beats * stepsPerBeat);
    const callouts: TrainerCueCallout[] = [];
    const removedSteps = new Set<number>();
    for (let bar = 0; bar < barCount; bar += 1) {
      const barStart = bar * stepsPerBar;
      const responseStep = barStart + cueOffset;
      const barEnd = barStart + stepsPerBar;
      const targets = pattern.hits.filter(hit => hit.instrument === cueVoice && hit.step >= responseStep && hit.step < barEnd);
      if (!targets.length) continue;
      targets.forEach(hit => removedSteps.add(hit.step));
      const cueStep = responseStep > barStart ? responseStep - stepsPerBeat : barStart - stepsPerBeat;
      callouts.push({ step: cueStep < 0 ? Math.max(0, totalSteps - stepsPerBeat) : cueStep, bar: bar + 1, label: `Next: drop ${cueVoice} from beat ${safeBeat}.` });
    }
    return {
      pattern: {
        ...pattern,
        id: `trainer-cue:dropout:${pattern.id}`,
        name: `${pattern.name} · ${cueVoice} dropout`,
        hits: pattern.hits.filter(hit => !removedSteps.has(hit.step) || hit.instrument !== cueVoice),
      },
      cueSteps: callouts.map(callout => callout.step),
      callouts,
      label: callouts.length ? `DROP OUT · leave ${cueVoice} silent from beat ${safeBeat} to the end of each bar.` : `No ${cueVoice} targets occur from beat ${safeBeat} onward in this phrase. Choose another voice or beat.`,
      hasDynamicsTargets: false,
    };
  }

  if (mode === "accent-shift") {
    const callouts: TrainerCueCallout[] = [];
    const hits = pattern.hits.map(hit => {
      const beatInBar = Math.floor((hit.step % stepsPerBar) / stepsPerBeat) + 1;
      const accented = beatInBar === safeBeat;
      return { ...hit, accent: accented, velocityTarget: accented ? 105 : 45 };
    });
    for (let bar = 0; bar < barCount; bar += 1) {
      const barStart = bar * stepsPerBar;
      const responseStep = barStart + cueOffset;
      if (!hits.some(hit => hit.step >= responseStep && hit.step < responseStep + stepsPerBeat)) continue;
      const cueStep = responseStep > barStart ? responseStep - stepsPerBeat : barStart - stepsPerBeat;
      callouts.push({ step: cueStep < 0 ? Math.max(0, pattern.beats * stepsPerBeat - stepsPerBeat) : cueStep, bar: bar + 1, label: `Next: move the accent to beat ${safeBeat}.` });
    }
    return {
      pattern: { ...pattern, id: `trainer-cue:accent-shift:${pattern.id}`, name: `${pattern.name} · accent shift`, hits },
      cueSteps: callouts.map(callout => callout.step),
      callouts,
      label: `ACCENT SHIFT · emphasize hits on beat ${safeBeat}; keep the other strokes soft.`,
      hasDynamicsTargets: true,
    };
  }

  if (mode === "custom") {
    const hits = pattern.hits.map(hit => ({ ...hit }));
    const callouts: TrainerCueCallout[] = [];
    const cueNames: string[] = [];
    for (let bar = 0; bar < barCount; bar += 1) {
      const barStart = bar * stepsPerBar;
      const barEnd = barStart + stepsPerBar;
      for (const cue of customCues) {
        const safeCueBeat = Math.max(1, Math.min(Math.floor(stepsPerBar / stepsPerBeat), Math.floor(cue.beat)));
        const responseStep = barStart + (safeCueBeat - 1) * stepsPerBeat;
        const leadSteps = Math.min(Math.max(1, cueLeadBeats), Math.max(1, Math.floor(stepsPerBar / stepsPerBeat) - 1)) * stepsPerBeat;
        const cueStep = responseStep - leadSteps;
        const calloutStep = cueStep < barStart ? (barStart > 0 ? barStart - stepsPerBeat : Math.max(0, pattern.beats * stepsPerBeat - stepsPerBeat)) : cueStep;
        if (cue.action === "crash") {
          const existing = hits.find(hit => hit.step === responseStep && hit.instrument === "crash");
          if (existing) existing.accent = true;
          else hits.push({ step: responseStep, instrument: "crash", accent: true });
          callouts.push({ step: calloutStep, bar: bar + 1, label: `Next: crash on beat ${safeCueBeat}.` });
        } else if (cue.action === "dropout") {
          const voice = cue.voice ?? cueVoice;
          const targets = hits.filter(hit => hit.instrument === voice && hit.step >= responseStep && hit.step < barEnd);
          hits.splice(0, hits.length, ...hits.filter(hit => !(hit.instrument === voice && hit.step >= responseStep && hit.step < barEnd)));
          callouts.push({ step: calloutStep, bar: bar + 1, label: targets.length ? `Next: drop ${voice} from beat ${safeCueBeat}.` : `No ${voice} hits to drop after beat ${safeCueBeat} in this bar.` });
        } else if (cue.action === "accent-shift") {
          for (let index = 0; index < hits.length; index += 1) {
            const hit = hits[index];
            if (hit.step >= barStart && hit.step < barEnd) {
              const accented = hit.step >= responseStep && hit.step < responseStep + stepsPerBeat;
              hits[index] = { ...hit, accent: accented, velocityTarget: accented ? 105 : 45 };
            }
          }
          callouts.push({ step: calloutStep, bar: bar + 1, label: `Next: move the accent to beat ${safeCueBeat}.` });
        } else {
          const loud = cue.action === "loud";
          for (let index = 0; index < hits.length; index += 1) {
            const hit = hits[index];
            if (hit.step < barStart || hit.step >= barEnd) continue;
            const changed = hit.step >= responseStep;
            hits[index] = { ...hit, ...(changed && loud ? { accent: true } : {}), velocityTarget: changed ? (loud ? 105 : 35) : (loud ? 55 : 78) };
          }
          callouts.push({ step: calloutStep, bar: bar + 1, label: `Next: play ${loud ? "louder" : "softer"} from beat ${safeCueBeat}.` });
        }
        cueNames.push(`${cue.action} on ${safeCueBeat}`);
      }
    }
    const encodedId = encodeURIComponent(pattern.id);
    const groupedCallouts = new Map<string, TrainerCueCallout>();
    for (const callout of callouts) {
      const key = `${callout.bar}:${callout.step}`;
      const existing = groupedCallouts.get(key);
      if (existing) existing.label = `${existing.label.replace(/^Next: /, "")}; ${callout.label.replace(/^Next: /, "")}`;
      else groupedCallouts.set(key, { ...callout });
    }
    const uniqueCallouts = [...groupedCallouts.values()].map(callout => ({ ...callout, label: `Next: ${callout.label.replace(/^Next: /, "")}` }));
    return {
      pattern: { ...pattern, id: `trainer-cue:custom:${encodedId}`, name: `${pattern.name} · custom cue`, hits: hits.sort((a, b) => a.step - b.step) },
      cueSteps: uniqueCallouts.map(callout => callout.step),
      callouts: uniqueCallouts,
      label: customCues.length ? `Custom sequence · ${cueNames.join(" → ")}. Responses repeat in each bar.` : "Add at least one response to your custom cue sequence.",
      hasDynamicsTargets: customCues.some(cue => cue.action === "loud" || cue.action === "soft" || cue.action === "accent-shift"),
    };
  }

  if (mode === "random") {
    let state = seed >>> 0 || 1;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const callouts: TrainerCueCallout[] = [];
    let hasDynamicsTargets = false;
    const beatsPerBar = Math.max(1, Math.floor(stepsPerBar / stepsPerBeat));
    const requestedDensity: TrainerCueDensity = [1, 2, 4].includes(cueEveryBars) ? cueEveryBars : 1;
    const safeDensity = requestedDensity;
    const safeLead = Math.min(Math.max(1, cueLeadBeats), Math.max(1, beatsPerBar - 1));
    const safeRepetitions = Math.max(1, Math.min(2000, Math.floor(repetitions) || 1));
    const sequenceId = `trainer-cue:random:${encodeURIComponent(pattern.id)}:${seed >>> 0}`;
    const repetitionPatterns = Array.from({ length: safeRepetitions }, () => ({
      ...pattern,
      id: sequenceId,
      name: `${pattern.name} · random cues`,
      hits: pattern.hits.map(hit => ({ ...hit })),
    }));
    for (let repetition = 0; repetition < safeRepetitions; repetition += 1) {
      for (let bar = 0; bar < barCount; bar += 1) {
        const absoluteBar = repetition * barCount + bar;
        if (absoluteBar % safeDensity !== 0) continue;
        const firstResponseBeat = Math.min(beatsPerBar, safeLead + 1);
        const responseBeat = firstResponseBeat + Math.floor(random() * Math.max(1, beatsPerBar - firstResponseBeat + 1));
        const barStart = bar * stepsPerBar;
        const responseStep = barStart + (responseBeat - 1) * stepsPerBeat;
        const cueStep = Math.max(barStart, responseStep - safeLead * stepsPerBeat);
        const currentPattern = repetitionPatterns[repetition];
        let response = Math.floor(random() * 5);
        const barEnd = (bar + 1) * stepsPerBar;
        const responseHits = currentPattern.hits.filter(hit => hit.step >= responseStep && hit.step < barEnd);
        if (response !== 0 && !responseHits.length) response = 0;
        if (response === 3 && !new Set(responseHits.map(hit => hit.instrument)).size) response = 0;
        if (response === 4 && !responseHits.some(hit => hit.step < responseStep + stepsPerBeat)) response = 0;
        if (response === 0) {
          const crash = currentPattern.hits.find(hit => hit.step === responseStep && hit.instrument === "crash");
          if (crash) crash.accent = true;
          else currentPattern.hits.push({ step: responseStep, instrument: "crash", accent: true });
          callouts.push({ step: cueStep, repetition, bar: absoluteBar + 1, label: `Next: crash on beat ${responseBeat}.` });
        } else if (response === 3) {
          const responseVoices = [...new Set(responseHits.map(hit => hit.instrument))];
          const droppedVoice = responseVoices[Math.floor(random() * responseVoices.length)];
          currentPattern.hits = currentPattern.hits.filter(hit => !(hit.instrument === droppedVoice && hit.step >= responseStep && hit.step < barEnd));
          callouts.push({ step: cueStep, repetition, bar: absoluteBar + 1, label: `Next: drop ${droppedVoice} from beat ${responseBeat}.` });
        } else if (response === 4) {
          hasDynamicsTargets = true;
          for (let index = 0; index < currentPattern.hits.length; index += 1) {
            const hit = currentPattern.hits[index];
            if (hit.step < barStart || hit.step >= barEnd) continue;
            const accented = hit.step >= responseStep && hit.step < responseStep + stepsPerBeat;
            currentPattern.hits[index] = { ...hit, accent: accented, velocityTarget: accented ? 105 : 45 };
          }
          callouts.push({ step: cueStep, repetition, bar: absoluteBar + 1, label: `Next: move the accent to beat ${responseBeat}.` });
        } else {
          const loud = response === 1;
          hasDynamicsTargets = true;
          for (let index = 0; index < currentPattern.hits.length; index += 1) {
            const hit = currentPattern.hits[index];
            if (hit.step < barStart || hit.step >= barEnd) continue;
            const changed = hit.step >= responseStep;
            currentPattern.hits[index] = { ...hit, ...(changed && loud ? { accent: true } : {}), velocityTarget: changed ? (loud ? 105 : 35) : (loud ? 55 : 78) };
          }
          callouts.push({ step: cueStep, repetition, bar: absoluteBar + 1, label: `Next: play ${loud ? "louder" : "softer"} from beat ${responseBeat}.` });
        }
      }
    }
    repetitionPatterns.forEach(item => item.hits.sort((a, b) => a.step - b.step));
    return {
      pattern: repetitionPatterns[0],
      cueSteps: callouts.map(callout => callout.step),
      callouts,
      repetitionPatterns,
      label: `Random cue sequence · crash, dynamics, dropout, or accent shift; respond ${safeLead} beat${safeLead === 1 ? "" : "s"} after each callout, every ${safeDensity} bar${safeDensity === 1 ? "" : "s"} across the round (${callouts.length} cue${callouts.length === 1 ? "" : "s"}).`,
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
