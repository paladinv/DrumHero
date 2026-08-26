import { describe, expect, it } from "vitest";
import { addSession, calculateStreak, defaultProgress, levelProgress, parseProgress, recommendNext } from "@/lib/progress";
import type { SessionResult } from "@/lib/types";

const session=(score:number,playedAt="2026-08-25T12:00:00.000Z"):SessionResult=>({id:`x-${score}-${playedAt}`,patternId:"x",patternName:"X",bpm:80,playedAt,score,accuracy:90,great:1,good:0,miss:0,extra:0,maxCombo:1});

describe("progress persistence",()=>{
  it("falls back safely for missing, corrupt, and incompatible data",()=>{
    expect(parseProgress(null)).toEqual(defaultProgress);
    expect(parseProgress("{" )).toEqual(defaultProgress);
    expect(parseProgress(JSON.stringify({version:2}))).toEqual(defaultProgress);
  });
  it("sanitizes restored settings",()=>{
    const value=parseProgress(JSON.stringify({...defaultProgress,settings:{sound:false,preferredBpm:999}}));
    expect(value.settings).toEqual({sound:false,preferredBpm:200});
  });
  it("retains best scores, unique dates, and at most 50 sessions",()=>{
    let state=defaultProgress;
    for(let index=0;index<55;index++)state=addSession(state,session(index,`2026-08-${String((index%3)+20).padStart(2,"0")}T12:00:00.000Z`));
    expect(state.sessions).toHaveLength(50);
    expect(state.bestScores.x).toBe(54);
    expect(state.practiceDates).toHaveLength(3);
  });
  it("calculates a streak ending today or yesterday",()=>{
    const today=new Date("2026-08-25T12:00:00.000Z");
    expect(calculateStreak(["2026-08-23","2026-08-24","2026-08-25"],today)).toBe(3);
    expect(calculateStreak(["2026-08-22","2026-08-23","2026-08-24"],today)).toBe(3);
    expect(calculateStreak(["2026-08-20"],today)).toBe(0);
  });
  it("recommends the earliest unfinished lesson and reports level progress",()=>{
    expect(recommendNext([]).id).toBe("meet-the-kit");
    expect(recommendNext(["meet-the-kit"]).id).toBe("count-the-grid");
    expect(levelProgress(["meet-the-kit","count-the-grid"],"Beginner")).toEqual({done:2,total:4,percent:50});
  });
});

