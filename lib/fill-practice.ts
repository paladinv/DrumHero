import type { Groove, PracticePattern } from "./types";

export const isGroovePattern = (pattern: PracticePattern): pattern is Groove => "style" in pattern;

export function canUseFillPractice(pattern: PracticePattern): pattern is Groove {
  return isGroovePattern(pattern) && pattern.style !== "Fill study" && pattern.style !== "Groove + fill" &&
    pattern.meter === "4/4" && pattern.beats === 4 && [4, 8, 12, 16].includes(pattern.subdivision);
}

export function compatibleFillPatterns(groove: PracticePattern, candidates: PracticePattern[]): Groove[] {
  if (!canUseFillPractice(groove)) return [];
  const tempoMin = groove.tempoRange[0], tempoMax = groove.tempoRange[1];
  return candidates.filter((pattern): pattern is Groove => isGroovePattern(pattern) &&
    pattern.style === "Fill study" && pattern.meter === groove.meter && pattern.beats === groove.beats &&
    pattern.subdivision === groove.subdivision && Math.max(tempoMin, pattern.tempoRange[0]) <= Math.min(tempoMax, pattern.tempoRange[1]));
}

export function createGrooveFillTransition(
  groove: PracticePattern,
  fill: PracticePattern,
  grooveBars: number,
  id: string,
  name?: string
): Groove | null {
  if (![1, 2, 4].includes(grooveBars) || !isGroovePattern(groove) || !isGroovePattern(fill) || !compatibleFillPatterns(groove, [fill]).length) return null;
  const cellsPerBar = groove.beats * groove.subdivision / 4;
  const totalBars = grooveBars + 1;
  const cells = cellsPerBar * totalBars;
  const hits = [
    ...Array.from({ length: grooveBars }, (_, bar) => groove.hits.map((hit) => ({ ...hit, step: hit.step + bar * cellsPerBar }))).flat(),
    ...fill.hits.map((hit) => ({ ...hit, step: hit.step + grooveBars * cellsPerBar }))
  ];
  if (!Number.isInteger(cells) || cells > 80 || hits.length > 128) return null;

  const tempoRange: [number, number] = [
    Math.max(groove.tempoRange[0], fill.tempoRange[0]),
    Math.min(groove.tempoRange[1], fill.tempoRange[1])
  ];
  const defaultBpm = Math.max(tempoRange[0], Math.min(tempoRange[1], groove.defaultBpm));
  const levelRank = { Beginner: 0, Intermediate: 1, Advanced: 2 };
  const level = levelRank[groove.level] >= levelRank[fill.level] ? groove.level : fill.level;
  const fillName = fill.name.replace(/^Fill:\s*/, "");

  return {
    id,
    name: name?.trim() || `${groove.name} + ${fillName}`.slice(0, 60),
    level,
    description: `Play ${groove.name} for ${grooveBars} ${grooveBars === 1 ? "bar" : "bars"}, then play ${fillName}. The phrase loops back to beat one.`,
    subdivision: groove.subdivision,
    beats: groove.beats * totalBars,
    defaultBpm,
    tempoRange,
    style: "Groove + fill",
    focus: `Keep ${groove.name} steady, shape the fill, and land back on beat one.`,
    meter: `${totalBars} bars · 4/4`,
    feel: groove.feel,
    hits
  };
}
