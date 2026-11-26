import type { Instrument, PracticePattern } from "./types";

const DRUM_MAP: Record<Instrument, { midi: number; step: string; octave: number; sound: string }> = {
  kick: { midi: 36, step: "F", octave: 4, sound: "percussion.bass-drum" },
  snare: { midi: 38, step: "C", octave: 5, sound: "percussion.snare-drum" },
  hihat: { midi: 42, step: "G", octave: 5, sound: "percussion.cymbal" },
  tom: { midi: 50, step: "A", octave: 4, sound: "percussion.tom-tom" },
  crash: { midi: 49, step: "A", octave: 5, sound: "percussion.cymbal" },
};
const XML_ESCAPES: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" };

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, character => XML_ESCAPES[character]!);
}

function gcd(left: number, right: number): number {
  return right ? gcd(right, left % right) : left;
}

function lcm(left: number, right: number) {
  return Math.abs(left * right) / gcd(left, right);
}

function durationType(subdivision: number) {
  if (subdivision === 4) return "quarter";
  if (subdivision === 8 || subdivision === 12) return "eighth";
  return "16th";
}

function timeModification(subdivision: number) {
  if (subdivision === 12) return "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>";
  if (subdivision === 20) return "<time-modification><actual-notes>5</actual-notes><normal-notes>4</normal-notes></time-modification>";
  return "";
}

/** Creates a compact, single-part percussion score with one measure per bar. */
export function earPatternToMusicXml(pattern: PracticePattern, meter: string, bpm: number) {
  const [beats, beatType] = meter.split("/").map(Number);
  if (!beats || !beatType || ![4, 8].includes(beatType)) throw new Error("Unsupported time signature.");
  const subdivision = pattern.subdivision;
  const divisions = lcm(subdivision / 4, beatType / gcd(beatType, 4));
  const stepDuration = divisions * 4 / subdivision;
  const stepsPerBar = Math.round(beats * subdivision / beatType);
  const bars = Math.max(1, Math.round(pattern.beats / (beats * 4 / beatType)));
  const title = escapeXml(pattern.name || "Rhythm");
  const tickType = durationType(subdivision);
  const tuplet = timeModification(subdivision);

  const measures = Array.from({ length: bars }, (_, barIndex) => {
    const firstMeasure = barIndex === 0;
    const barStart = barIndex * stepsPerBar;
    const hitsAtStep = new Map<number, typeof pattern.hits>();
    for (const hit of pattern.hits) {
      if (hit.step < barStart || hit.step >= barStart + stepsPerBar) continue;
      const localStep = hit.step - barStart;
      hitsAtStep.set(localStep, [...(hitsAtStep.get(localStep) ?? []), hit]);
    }
    const notes = Array.from({ length: stepsPerBar }, (_, step) => {
      const hits = hitsAtStep.get(step) ?? [];
      if (!hits.length) return `<note><rest/><duration>${stepDuration}</duration><voice>1</voice><type>${tickType}</type>${tuplet}</note>`;
      return hits.map((hit, hitIndex) => {
        const drum = DRUM_MAP[hit.instrument];
        const notehead = hit.instrument === "hihat" || hit.instrument === "crash" ? "<notehead>x</notehead>" : "";
        const articulation = hit.articulation ? `<other-articulation>${hit.articulation}</other-articulation>` : "";
        const sticking = hit.sticking ? `<technical><other-technical>${hit.sticking}</other-technical></technical>` : "";
        const articulationMarks = `${hit.accent ? "<accent/>" : ""}${articulation}`;
        const notations = articulationMarks || sticking
          ? `<notations>${sticking}${articulationMarks ? `<articulations>${articulationMarks}</articulations>` : ""}</notations>`
          : "";
        return `<note>${hitIndex ? "<chord/>" : ""}<unpitched><display-step>${drum.step}</display-step><display-octave>${drum.octave}</display-octave></unpitched><duration>${stepDuration}</duration><instrument id="P1-I${drum.midi}"/><voice>1</voice><type>${tickType}</type>${tuplet}${notehead}${notations}</note>`;
      }).join("");
    }).join("");
    return `<measure number="${barIndex + 1}">${firstMeasure ? `<attributes><divisions>${divisions}</divisions><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(bpm)}"/></direction>` : ""}${notes}</measure>`;
  }).join("");

  const instruments = Object.entries(DRUM_MAP).map(([voice, drum]) => `<score-instrument id="P1-I${drum.midi}"><instrument-name>${voice}</instrument-name><instrument-sound>${drum.sound}</instrument-sound></score-instrument>`).join("");
  const midiInstruments = Object.values(DRUM_MAP).map(drum => `<midi-instrument id="P1-I${drum.midi}"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>${drum.midi}</midi-unpitched></midi-instrument>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><work><work-title>${title}</work-title></work><identification><encoding><software>Drum Hero</software></encoding></identification><part-list><score-part id="P1"><part-name>Drum set</part-name>${instruments}${midiInstruments}</score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}
