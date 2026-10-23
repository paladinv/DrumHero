import { canUseFillPractice, compatibleFillPatterns } from "./fill-practice";
import type { PracticePattern } from "./types";

export type TrainerSessionFocus = "adaptive" | "backbeat" | "fills" | "coordination" | "odd-meter" | "ghost-notes" | "syncopation" | "dynamics";

function patternSearchText(pattern: PracticePattern) {
  const focus = "focus" in pattern && typeof pattern.focus === "string" ? pattern.focus : "";
  return `${pattern.name} ${pattern.description} ${focus}`;
}

export function getTrainerGoalPatterns(patterns: PracticePattern[], focus: TrainerSessionFocus, allPatterns = patterns): PracticePattern[] {
  if (focus === "adaptive") return patterns;
  if (focus === "fills") return patterns.filter(pattern => canUseFillPractice(pattern) && compatibleFillPatterns(pattern, allPatterns).length > 0);
  if (focus === "coordination") return patterns.filter(pattern => pattern.hits.some(hit => hit.instrument === "kick") && pattern.hits.some(hit => hit.instrument !== "kick"));
  if (focus === "ghost-notes") return patterns.filter(pattern => /ghost|quiet/i.test(patternSearchText(pattern)));
  if (focus === "syncopation") return patterns.filter(pattern => /syncopat|offbeat|displac|pickup|linear|broken beat/i.test(patternSearchText(pattern)));
  if (focus === "dynamics") return patterns.filter(pattern => /dynamic|accent|ghost|crescendo|soft/i.test(patternSearchText(pattern)));
  if (focus === "odd-meter") return patterns.filter(pattern => {
    const meter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "";
    return Boolean(meter && !/4\s*\/\s*4/.test(meter) && !("style" in pattern && pattern.style === "Fill study"));
  });
  return patterns.filter(pattern => {
    const meter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "";
    const isBackbeat = meter ? /4\s*\/\s*4/.test(meter) : pattern.beats === 4;
    return isBackbeat && !("style" in pattern && pattern.style === "Fill study");
  });
}
