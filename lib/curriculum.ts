import type { Groove, Lesson, PracticePattern, Rudiment } from "./types";

export const grooves: Groove[] = [
  {
    id: "first-beat", name: "First Backbeat", level: "Beginner", style: "Rock", focus: "Steady eighth notes and a strong backbeat", description: "Your first complete beat: hats on eighths, kick on 1 and 3, snare on 2 and 4.", subdivision: 8, beats: 4, defaultBpm: 72, tempoRange: [50, 110],
    hits: [...[0,1,2,3,4,5,6,7].map((step) => ({ step, instrument: "hihat" as const })), {step:0,instrument:"kick"},{step:4,instrument:"kick"},{step:2,instrument:"snare"},{step:6,instrument:"snare"}]
  },
  {
    id: "syncopated-funk", name: "Syncopated Pocket", level: "Intermediate", style: "Funk", focus: "Offbeat kicks without losing the backbeat", description: "Anchor the snare while the kick moves between the pulse.", subdivision: 16, beats: 4, defaultBpm: 88, tempoRange: [60, 125],
    hits: [...[0,2,4,6,8,10,12,14].map((step) => ({ step, instrument: "hihat" as const })), {step:0,instrument:"kick"},{step:3,instrument:"kick"},{step:10,instrument:"kick"},{step:4,instrument:"snare"},{step:12,instrument:"snare"}]
  },
  {
    id: "five-four-drive", name: "Five-Four Drive", level: "Advanced", style: "Odd meter", focus: "Feel five as 3 + 2", description: "A musical five-beat groove with a clear grouping.", subdivision: 8, beats: 5, defaultBpm: 105, tempoRange: [70, 150],
    hits: [...[0,1,2,3,4,5,6,7,8,9].map((step) => ({ step, instrument: "hihat" as const })), {step:0,instrument:"kick"},{step:6,instrument:"kick"},{step:4,instrument:"snare"},{step:8,instrument:"snare"}]
  }
];

export const rudiments: Rudiment[] = [
  { id:"single-stroke", name:"Single Stroke Roll", level:"Beginner", sticking:"R L R L", coaching:"Let the stick rebound; match the height of both hands.", description:"Even alternating hands, the foundation of speed and control.", subdivision:8, beats:4, defaultBpm:70, tempoRange:[40,140], hits:[0,1,2,3,4,5,6,7].map((step)=>({step,instrument:"snare"})) },
  { id:"double-stroke", name:"Double Stroke Roll", level:"Intermediate", sticking:"R R L L", coaching:"Make the second stroke rebound, not squeeze.", description:"Two controlled strokes per hand with consistent spacing.", subdivision:16, beats:2, defaultBpm:76, tempoRange:[50,150], hits:[0,1,2,3,4,5,6,7].map((step)=>({step,instrument:"snare"})) },
  { id:"paradiddle", name:"Single Paradiddle", level:"Intermediate", sticking:"R L R R  L R L L", coaching:"Accent the first note of each four-note group.", description:"Alternating singles and doubles that unlock orchestration.", subdivision:16, beats:2, defaultBpm:80, tempoRange:[50,160], hits:[0,1,2,3,4,5,6,7].map((step)=>({step,instrument:"snare",accent:step===0||step===4})) },
  { id:"six-stroke", name:"Six Stroke Roll", level:"Advanced", sticking:"R L L R R L", coaching:"Keep the doubles low and the outside singles relaxed.", description:"A flowing six-note phrase for fills and solos.", subdivision:16, beats:3, defaultBpm:92, tempoRange:[55,170], hits:[0,1,2,3,4,5].map((step)=>({step,instrument:"snare",accent:step===0||step===5})) }
];

export const patterns: PracticePattern[] = [...grooves, ...rudiments];

export const lessons: Lesson[] = [
  {id:"meet-the-kit",order:1,level:"Beginner",title:"Meet the kit",duration:8,summary:"Learn the core voices, balanced setup, and safe listening habits.",goals:["Name five kit voices","Set a relaxed seat height","Choose hearing protection"]},
  {id:"count-the-grid",order:2,level:"Beginner",title:"Count the grid",duration:10,summary:"Read quarter and eighth notes as positions in time.",goals:["Count 1 & 2 &","Follow the playhead","Hold a steady pulse"],practicePatternId:"single-stroke"},
  {id:"first-backbeat",order:3,level:"Beginner",title:"Build your first backbeat",duration:12,summary:"Coordinate kick, snare, and hi-hat into a full groove.",goals:["Place snare on 2 and 4","Keep eighth-note hats even","Loop four bars"],practicePatternId:"first-beat"},
  {id:"first-fill",order:4,level:"Beginner",title:"A fill that lands",duration:10,summary:"Move singles around the kit and return cleanly to beat one.",goals:["Lead with either hand","Move without rushing","Crash with the kick"]},
  {id:"sixteenth-control",order:5,level:"Intermediate",title:"Sixteenth-note control",duration:14,summary:"Subdivide one beat into four equally spaced notes.",goals:["Count e & a","Keep accents intentional","Relax at higher tempos"],practicePatternId:"double-stroke"},
  {id:"paradiddle-voices",order:6,level:"Intermediate",title:"Orchestrate the paradiddle",duration:15,summary:"Turn sticking into musical movement between snare and toms.",goals:["Hear the lead-hand change","Move accents","Keep doubles soft"],practicePatternId:"paradiddle"},
  {id:"syncopated-pocket",order:7,level:"Intermediate",title:"Own the offbeat",duration:14,summary:"Add syncopated kick notes without disturbing the snare.",goals:["Anchor 2 and 4","Place offbeat kicks","Maintain dynamic balance"],practicePatternId:"syncopated-funk"},
  {id:"linear-fill",order:8,level:"Intermediate",title:"Linear fill design",duration:12,summary:"Build fills where no two limbs strike together.",goals:["Use K R L groupings","Shape dynamics","Resolve on beat one"]},
  {id:"limb-independence",order:9,level:"Advanced",title:"Layer independence",duration:18,summary:"Hold a foot ostinato while your hands phrase above it.",goals:["Internalize the feet","Add one hand at a time","Recover without stopping"]},
  {id:"five-four",order:10,level:"Advanced",title:"Make five feel natural",duration:16,summary:"Group 5/4 as 3 + 2 and create a repeatable pocket.",goals:["Count two groupings","Mark the downbeat","Phrase across the bar"],practicePatternId:"five-four-drive"},
  {id:"dynamic-arc",order:11,level:"Advanced",title:"Shape a dynamic arc",duration:14,summary:"Control ghost notes, accents, and crescendos without changing tempo.",goals:["Separate tap and accent heights","Build four-bar arcs","Keep pulse independent of volume"],practicePatternId:"six-stroke"},
  {id:"three-over-two",order:12,level:"Advanced",title:"Hear three over two",duration:18,summary:"Understand and coordinate the 3:2 polyrhythm.",goals:["Sing both layers","Play each limb alone","Combine at a slow pulse"]}
];

export function validateCurriculum() {
  const ids = [...lessons, ...patterns].map((item) => item.id);
  return {
    uniqueIds: new Set(ids).size === ids.length,
    validTempos: patterns.every((p) => p.defaultBpm >= p.tempoRange[0] && p.defaultBpm <= p.tempoRange[1]),
    validHits: patterns.every((p) => p.hits.every((hit) => hit.step >= 0 && hit.step < p.beats * (p.subdivision / 4)))
  };
}
