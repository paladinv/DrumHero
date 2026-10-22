import { canUseFillPractice, compatibleFillPatterns } from "./fill-practice";
import type { PracticePattern } from "./types";

export type TrainerSessionFocus = "adaptive" | "backbeat" | "fills" | "coordination" | "odd-meter";

export function getTrainerGoalPatterns(patterns: PracticePattern[], focus: TrainerSessionFocus, allPatterns = patterns): PracticePattern[] {
  if (focus === "adaptive") return patterns;
  if (focus === "fills") return patterns.filter(pattern => canUseFillPractice(pattern) && compatibleFillPatterns(pattern, allPatterns).length > 0);
  if (focus === "coordination") return patterns.filter(pattern => pattern.hits.some(hit => hit.instrument === "kick") && pattern.hits.some(hit => hit.instrument !== "kick"));
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
