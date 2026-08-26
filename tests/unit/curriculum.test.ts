import { describe, expect, it } from "vitest";
import { lessons, patterns, validateCurriculum } from "@/lib/curriculum";

describe("curriculum contract",()=>{
  it("has valid unique content",()=>expect(validateCurriculum()).toEqual({uniqueIds:true,validTempos:true,validHits:true}));
  it("ships four ordered lessons for every level",()=>{
    for(const level of ["Beginner","Intermediate","Advanced"])expect(lessons.filter((lesson)=>lesson.level===level)).toHaveLength(4);
    expect(lessons.map((lesson)=>lesson.order)).toEqual(Array.from({length:12},(_,index)=>index+1));
  });
  it("resolves every lesson practice reference",()=>{
    const ids=new Set(patterns.map((pattern)=>pattern.id));
    expect(lessons.every((lesson)=>!lesson.practicePatternId||ids.has(lesson.practicePatternId))).toBe(true);
  });
  it("keeps playable tempo ranges within global controls",()=>expect(patterns.every((pattern)=>pattern.tempoRange[0]>=40&&pattern.tempoRange[1]<=200)).toBe(true));
});

