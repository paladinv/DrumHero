export type LessonGuide = {
  idea: string;
  steps: string[];
};

export const lessonGuides: Record<string, LessonGuide> = {
  "meet-the-kit": {
    idea: "A drum kit is a group of distinct voices. A relaxed setup lets each limb reach its instrument without twisting or lifting the shoulders.",
    steps: [
      "Name kick, snare, hi-hat, tom, and crash. On the Practice Pad, those voices use Space, F, J, K, and L.",
      "Sit so your thighs slope slightly down and your feet can rest on the pedals without reaching.",
      "Use hearing protection around acoustic drums and keep headphone or monitor levels comfortable."
    ]
  },
  "count-the-grid": {
    idea: "A steady beat is a set of evenly spaced positions. Eighth notes split each beat into two equal spaces.",
    steps: [
      "Say “1 & 2 & 3 & 4 &” at a comfortable pace. The numbers are the beats; each “&” sits halfway between them.",
      "Watch the Practice Pad playhead move through the numbered grid.",
      "Tap the snare evenly on every eighth-note position, then repeat while counting aloud."
    ]
  },
  "first-backbeat": {
    idea: "A common rock and pop groove pairs kick on beats 1 and 3 with snare on beats 2 and 4. Even hi-hat eighths connect the pattern.",
    steps: [
      "Count “1 & 2 & 3 & 4 &” before playing.",
      "Add the hi-hat on each number and “&”. Keep its volume even.",
      "Add kick on 1 and 3, then snare on 2 and 4. Keep the count moving through the whole bar."
    ]
  },
  "first-fill": {
    idea: "A fill adds a short phrase near the end of a groove. A clear downbeat after the fill makes the transition feel settled.",
    steps: [
      "Play a simple groove for three beats and keep counting through beat 4.",
      "Use even eighth notes across the snare and tom on beat 4.",
      "Land kick and crash together on the next beat 1. Start slowly enough to make that landing comfortable."
    ]
  },
  "sixteenth-control": {
    idea: "Sixteenth notes divide a beat into four equal positions, commonly counted “1 e & a”. Relaxed, even spacing matters more than speed.",
    steps: [
      "Say “1 e & a” several times without playing.",
      "Play four quiet, even snare taps on each beat.",
      "Keep your hands low and relaxed. Increase tempo only while every subdivision stays even."
    ]
  },
  "paradiddle-voices": {
    idea: "A single paradiddle is R-L-R-R, L-R-L-L. The repeated strokes are doubles; accents can make the sticking easier to hear.",
    steps: [
      "Say the sticking out loud and make the repeated hand change feel smooth.",
      "Accent the first note of each four-note group while keeping the other notes lower.",
      "Move selected notes from snare to tom without changing the sticking or pulse."
    ]
  },
  "syncopated-pocket": {
    idea: "Syncopation places a note between the main beats. Keep the snare backbeat steady while the kick adds offbeat movement.",
    steps: [
      "Count the eighth-note grid and keep snare on beats 2 and 4.",
      "Add one kick on an “&” while keeping the other notes unchanged.",
      "Repeat the bar and notice whether the offbeat kick pulls the next beat early."
    ]
  },
  "linear-fill": {
    idea: "A linear phrase gives each subdivision to one voice at a time. Separating the voices makes a fill clear and controlled.",
    steps: [
      "Count each subdivision at a slow tempo.",
      "Play the kick, snare, and tom sequence one note at a time; let each sound finish before the next voice.",
      "Keep the final subdivision clear so the next groove can begin on beat 1."
    ]
  },
  "limb-independence": {
    idea: "Independence grows by layering one steady part at a time. Make the foot pattern automatic before adding a hand part.",
    steps: [
      "Tap a steady kick pulse and count aloud for several bars.",
      "Keep the kick going while adding a simple hi-hat pulse.",
      "Add the snare backbeat last. If a layer slips, remove it and rebuild from the pulse."
    ]
  },
  "five-four": {
    idea: "Five-four has five quarter-note beats in each bar. Grouping it as 3 + 2 gives the phrase a repeatable shape.",
    steps: [
      "Count “1 2 3, 1 2” and accent each group’s first beat.",
      "Keep the hi-hat evenly spaced across all five beats.",
      "Place the kick and snare while keeping the 3 + 2 count audible."
    ]
  },
  "dynamic-arc": {
    idea: "Dynamics describe how softly or strongly you play. A quiet note and an accent should differ in volume while staying in time.",
    steps: [
      "Play one bar of soft notes at an easy tempo.",
      "Repeat with one clear accent, keeping the remaining notes soft.",
      "Build the volume gradually over four bars without speeding up."
    ]
  },
  "three-over-two": {
    idea: "A 3:2 polyrhythm places three evenly spaced notes over the same span as two evenly spaced notes. Learn each pulse separately before combining them.",
    steps: [
      "Clap two even notes across a steady two-beat span.",
      "Over the same span, sing three evenly spaced notes: “1, trip, let”.",
      "Keep the two-beat pulse in your foot while speaking the three-note phrase. Begin slowly."
    ]
  }
};

export const lessonPracticeTargets: Record<string, { href: string; label: string }> = {
  "meet-the-kit": { href: "/kit", label: "Open the Kit Guide" },
  "count-the-grid": { href: "/practice?pattern=single-stroke", label: "Practice the eighth-note grid" },
  "first-backbeat": { href: "/practice?pattern=first-beat", label: "Practice the backbeat" },
  "first-fill": { href: "/trainer?pattern=rock-groove-into-fill", label: "Practice a groove and fill" },
  "sixteenth-control": { href: "/trainer?pattern=double-stroke", label: "Practice sixteenth notes" },
  "paradiddle-voices": { href: "/trainer?pattern=paradiddle", label: "Practice the paradiddle" },
  "syncopated-pocket": { href: "/trainer?pattern=syncopated-funk", label: "Practice the offbeat groove" },
  "linear-fill": { href: "/trainer?pattern=one-bar-linear-fill", label: "Practice a linear fill" },
  "limb-independence": { href: "/trainer?pattern=quarter-kick-backbeat", label: "Practice the layered groove" },
  "five-four": { href: "/practice?pattern=five-four-drive", label: "Practice the five-beat groove" },
  "dynamic-arc": { href: "/trainer?pattern=six-stroke", label: "Practice accents and soft notes" },
  "three-over-two": { href: "/trainer", label: "Open Trainer for a coordination drill" }
};
