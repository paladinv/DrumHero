import { describe, expect, it } from "vitest";
import { classifyOffset, expectedTimeline, findClosestExpected, stepDurationMs, summarizeHits } from "@/lib/scoring";

describe("timing scoring",()=>{
  it("classifies exact timing boundaries",()=>{
    expect(classifyOffset(0)).toBe("great");
    expect(classifyOffset(-50)).toBe("great");
    expect(classifyOffset(51)).toBe("good");
    expect(classifyOffset(-100)).toBe("good");
    expect(classifyOffset(101)).toBe("miss");
  });
  it("calculates subdivision timelines",()=>{
    expect(stepDurationMs(120,16)).toBe(125);
    expect(expectedTimeline(120,8,4,1000)).toEqual([1000,1250,1500,1750]);
  });
  it("matches only the closest expected hit for the same instrument",()=>{
    const expected=[{at:1000,instrument:"kick" as const,matched:false},{at:1010,instrument:"snare" as const,matched:false},{at:1100,instrument:"kick" as const,matched:false}];
    expect(findClosestExpected(1020,expected,"kick")).toEqual({index:0,offset:20});
    expected[0].matched=true;
    expect(findClosestExpected(1020,expected,"kick")).toEqual({index:2,offset:-80});
  });
  it("summarizes score, accuracy, extras, and combo",()=>{
    const result=summarizeHits([
      {instrument:"snare",rating:"great",offsetMs:10},{instrument:"snare",rating:"good",offsetMs:70},
      {instrument:"snare",rating:"extra",offsetMs:null},{instrument:"snare",rating:"miss",offsetMs:null},{instrument:"snare",rating:"great",offsetMs:-20}
    ],"single","Single",80,"2026-08-25T10:00:00.000Z");
    expect(result.score).toBe(66);
    expect(result.accuracy).toBe(75);
    expect(result.maxCombo).toBe(2);
    expect(result.extra).toBe(1);
  });
  it("floors a penalty-only score at zero",()=>{
    const result=summarizeHits([{instrument:"kick",rating:"miss",offsetMs:null},{instrument:"kick",rating:"extra",offsetMs:null}],"x","X",80);
    expect(result.score).toBe(0);
  });
});

