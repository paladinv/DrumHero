import type { Groove, PracticePattern } from "./types";
import { canUseFillPractice, compatibleFillPatterns } from "./fill-practice";

export const TRAINER_FORM_TEMPLATES = ["AABA", "ABAB", "AABB", "Custom"] as const;
export type TrainerFormTemplate = (typeof TRAINER_FORM_TEMPLATES)[number];
export type TrainerFormSection = { part: "A" | "B"; bars: number; repeats: number; intensity: "soft" | "normal" | "strong" };

export function buildTrainerSongFormPattern(options: {
  id: string;
  template: TrainerFormTemplate;
  partA: PracticePattern;
  partB: PracticePattern;
  fill?: PracticePattern | null;
  fillAfterSections?: number[];
  customSections?: TrainerFormSection[];
  name?: string;
}): Groove | null {
  const { id, template, partA, partB, fill } = options;
  if (!id.startsWith("custom-") || !TRAINER_FORM_TEMPLATES.includes(template) || !canUseFillPractice(partA) || !canUseFillPractice(partB)) return null;
  if (partA.subdivision !== partB.subdivision || Math.max(partA.tempoRange[0], partB.tempoRange[0]) > Math.min(partA.tempoRange[1], partB.tempoRange[1])) return null;
  if (fill && (!compatibleFillPatterns(partA, [fill]).length || !compatibleFillPatterns(partB, [fill]).length)) return null;

  const sections: TrainerFormSection[] = template === "Custom"
    ? (options.customSections ?? []).map(section => ({ ...section }))
    : [...template].map(part => ({ part: part as "A" | "B", bars: 1, repeats: 1, intensity: "normal" }));
  if (!sections.length || sections.length > 8 || sections.some(section =>
    !["A", "B"].includes(section.part) || !Number.isInteger(section.bars) || section.bars < 1 || section.bars > 16 ||
    !Number.isInteger(section.repeats) || section.repeats < 1 || section.repeats > 8 ||
    !["soft", "normal", "strong"].includes(section.intensity))) return null;

  const stepsPerBar = partA.beats * partA.subdivision / 4;
  const fillAfterSections = new Set((options.fillAfterSections ?? []).filter(index => Number.isInteger(index) && index >= 1 && index <= sections.length));
  const musicBars = sections.reduce((sum, section) => sum + section.bars * section.repeats, 0);
  const totalBars = musicBars + (fill ? fillAfterSections.size : 0);
  if (totalBars * stepsPerBar > 512) return null;

  const hits: Groove["hits"] = [];
  const fillRanges: Array<[number, number]> = [];
  let barOffset = 0;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const part = section.part === "A" ? partA : partB;
    for (let repeat = 0; repeat < section.repeats; repeat += 1) {
      for (let bar = 0; bar < section.bars; bar += 1) {
        hits.push(...part.hits.map(hit => ({
          ...hit,
          step: hit.step + barOffset * stepsPerBar,
          ...(section.intensity === "normal" ? {} : { accent: section.intensity === "strong", velocityTarget: section.intensity === "strong" ? 110 : 48 }),
        })));
        barOffset += 1;
      }
    }
    if (fill && fillAfterSections.has(sectionIndex + 1)) {
      const fillStart = barOffset * stepsPerBar;
      hits.push(...fill.hits.map(hit => ({ ...hit, step: hit.step + fillStart })));
      fillRanges.push([fillStart, fillStart + stepsPerBar]);
      barOffset += 1;
    }
  }
  if (hits.length > 256 || fillRanges.length > 16) return null;

  const low = Math.max(partA.tempoRange[0], partB.tempoRange[0], fill?.tempoRange[0] ?? 40);
  const high = Math.min(partA.tempoRange[1], partB.tempoRange[1], fill?.tempoRange[1] ?? 220);
  const levelRank = { Beginner: 0, Intermediate: 1, Advanced: 2 };
  const level = [partA.level, partB.level, ...(fill ? [fill.level] : [])].sort((a, b) => levelRank[b] - levelRank[a])[0];
  const defaultBpm = Math.max(low, Math.min(high, Math.round((partA.defaultBpm + partB.defaultBpm) / 2)));
  const formLabel = template === "Custom" ? sections.map(section => `${section.part} · ${section.bars} bar${section.bars === 1 ? "" : "s"}${section.repeats > 1 ? ` × ${section.repeats}` : ""}`).join(" → ") : [...template].join("–");
  const fillLabel = fillRanges.length ? ` with ${fillRanges.length} fill${fillRanges.length === 1 ? "" : "s"}` : "";
  const fillStepRanges = fillRanges.length ? fillRanges : undefined;
  const intensitySections = template === "Custom" ? sections.filter(section => section.intensity !== "normal").length : 0;
  return {
    id,
    name: (options.name?.trim() || `${formLabel} · ${partA.name} / ${partB.name}${fillLabel}`).slice(0, 60),
    level,
    description: `Play the ${formLabel} song form with ${partA.name} as A and ${partB.name} as B${fillRanges.length ? `, with fills after section${fillRanges.length === 1 ? "" : "s"} ${[...fillAfterSections].join(", ")}` : ""}${intensitySections ? `, shaping dynamics in ${intensitySections} section${intensitySections === 1 ? "" : "s"}` : ""}.`,
    subdivision: partA.subdivision,
    beats: barOffset * partA.beats,
    defaultBpm,
    tempoRange: [low, high],
    style: "Song form",
    focus: "Keep the groove steady while moving between song sections, shaping dynamics, and landing after fills.",
    meter: `${barOffset} bars · 4/4`,
    feel: partA.feel === "triplet" || partB.feel === "triplet" ? "triplet" : "straight",
    tags: ["song-form", formLabel],
    ...(fillStepRanges ? { trainerFillStepRanges: fillStepRanges } : {}),
    hits,
  };
}

export function getTrainerFormGrooves(patterns: PracticePattern[]): PracticePattern[] {
  return patterns.filter(canUseFillPractice);
}
