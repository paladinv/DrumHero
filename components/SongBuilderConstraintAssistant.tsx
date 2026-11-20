"use client";

import { useState } from "react";
import type { DrumPart, DrumSong, SongSection } from "@/lib/song-library";
import { buildArrangementBars, meterBeats, sectionClips, varyDrumPart } from "@/lib/song-builder";
import { boundaryTransition, creativeVariation } from "@/lib/song-builder-creative";

type EnergyArc = "steady" | "verse-chorus" | "build";
const makeId = () => crypto.randomUUID();

function independentSection(source: SongSection, name: string, kind: SongSection["kind"], parts: DrumPart[], repeats: number): SongSection {
  const oldToNew = new Map(source.parts.map((part, index) => [part.id, parts[index]?.id ?? makeId()]));
  const clips = sectionClips(source).map(clip => ({
    ...structuredClone(clip), id: makeId(), partId: oldToNew.get(clip.partId) ?? parts[0]?.id ?? makeId(),
    layers: clip.layers?.flatMap(id => oldToNew.has(id) ? [oldToNew.get(id)!] : []),
    overrides: clip.overrides ? { ...clip.overrides, mutedLayers: clip.overrides.mutedLayers?.flatMap(id => oldToNew.has(id) ? [oldToNew.get(id)!] : []), soloLayer: clip.overrides.soloLayer ? oldToNew.get(clip.overrides.soloLayer) : undefined } : undefined,
    repeatVariants: clip.repeatVariants?.flatMap(variant => oldToNew.has(variant.partId) ? [{ ...variant, partId: oldToNew.get(variant.partId)! }] : [])
  }));
  return { ...structuredClone(source), id: makeId(), name, kind, notes: "Generated arrangement draft · review before applying", parts, clips, repeats, reviewComments: undefined, rehearsalCues: source.rehearsalCues?.map(cue => ({ ...cue, id: makeId() })) };
}

export function SongBuilderConstraintAssistant({ song, onApply, onPreview, previewing }: { song: DrumSong; onApply: (song: DrumSong) => void; onPreview: (sections: SongSection[]) => void; previewing: boolean }) {
  const [minutes, setMinutes] = useState(2);
  const [sectionBars, setSectionBars] = useState(8);
  const [fillEvery, setFillEvery] = useState(16);
  const [energy, setEnergy] = useState<EnergyArc>("verse-chorus");
  const [sourceId, setSourceId] = useState("");
  const [preview, setPreview] = useState<SongSection[] | null>(null);
  const [message, setMessage] = useState("");
  const candidates = song.sections.filter(section => section.parts.length && sectionClips(section).length);
  const source = candidates.find(section => section.id === sourceId) ?? candidates.find(section => section.kind === "verse") ?? candidates[0];
  const bpm = source?.bpm ?? song.bpm;
  const beatsPerBar = meterBeats(source?.meter ?? song.meter);
  const targetBars = Math.max(1, Math.round(minutes * 60 / Math.max(0.25, beatsPerBar * 60 / bpm)));

  const generate = () => {
    if (!source) return;
    const sourceBars = Math.max(1, buildArrangementBars({ ...song, sections: [{ ...source, repeats: 1 }] }).length);
    const mainRepeats = Math.max(1, Math.round(sectionBars / sourceBars));
    const generated: SongSection[] = [];
    let elapsedBars = 0, sectionNumber = 0, nextFillAt = fillEvery;
    while (elapsedBars < targetBars && generated.length < 32) {
      if (elapsedBars > 0 && elapsedBars >= nextFillAt && generated.length < 31) {
        const base = source.parts[0]!;
        const fillPart = boundaryTransition(base, "fill");
        generated.push({ id: makeId(), name: `Fill ${Math.floor(elapsedBars / fillEvery)}`, kind: "fill", notes: "Generated transition · review before applying", parts: [fillPart], clips: [{ id: makeId(), partId: fillPart.id, repeats: 1 }], meter: base.meter ?? source.meter ?? song.meter, bpm: source.bpm ?? song.bpm, reviewComments: undefined });
        elapsedBars += 1;
        nextFillAt += fillEvery;
      }
      if (generated.length >= 32) break;
      const isChorus = energy === "verse-chorus" && sectionNumber % 2 === 1;
      let parts: DrumPart[] = source.parts.map(part => ({ ...structuredClone(part), id: makeId(), sourceId: undefined, linkedBaseId: undefined, linkOverrides: undefined, linkRemoved: undefined }));
      if (energy === "verse-chorus" && isChorus) parts = source.parts.map(part => varyDrumPart(part, "hat-lift"));
      else if (energy === "verse-chorus" && sectionNumber % 2 === 0 && sectionNumber > 0) parts = source.parts.map(part => varyDrumPart(part, "half-time"));
      else if (energy === "build" && sectionNumber > 0) {
        const progress = sectionNumber / Math.max(1, Math.ceil(targetBars / sectionBars) - 1);
        parts = source.parts.map((part, index) => creativeVariation(part, Math.round(42 + progress * 52), Math.round(18 + progress * 72), Math.round(progress * 55), 2027 + sectionNumber * 31 + index));
      }
      const kind: SongSection["kind"] = energy === "verse-chorus" ? isChorus ? "chorus" : "verse" : source.kind;
      const name = energy === "verse-chorus" ? `${isChorus ? "Chorus" : "Verse"} ${Math.floor(sectionNumber / 2) + 1}` : `${source.name} ${sectionNumber + 1}`;
      generated.push(independentSection(source, name, kind, parts, mainRepeats));
      elapsedBars += Math.max(1, sourceBars * mainRepeats);
      sectionNumber += 1;
    }
    const actualBars = generated.reduce((sum, section) => sum + buildArrangementBars({ ...song, sections: [section] }).length, 0);
    setPreview(generated);
    setMessage(actualBars < targetBars ? `Draft capped at ${generated.length} sections to stay within the Song Builder section limit.` : `Draft targets about ${minutes} minutes (${actualBars} measures at the selected source tempo).`);
  };

  const apply = () => {
    if (!preview) return;
    if (song.sections.length + preview.length > 32) { setMessage("This draft would exceed the 32-section song limit. Shorten the target or remove sections first."); return; }
    onApply({ ...song, sections: [...song.sections, ...preview] });
    setPreview(null); setMessage("Draft added as independent editable sections.");
  };

  return <details className="card song-builder-extra song-builder-constraint-assistant">
    <summary>Arrangement draft assistant</summary>
    <p>Set a target length, section size, energy shape, and fill spacing. The draft uses an existing groove as its source and stays editable after you review it.</p>
    <div className="song-builder-tool-fields">
      <label>Starting groove<select value={source?.id ?? ""} onChange={event=>{setSourceId(event.target.value);setPreview(null);}}>{candidates.map(section=><option key={section.id} value={section.id}>{section.name} · {section.kind}</option>)}</select></label>
      <label>Target length · minutes<input type="number" min={1} max={6} value={minutes} onChange={event=>{setMinutes(Math.max(1,Math.min(6,Number(event.target.value)||1)));setPreview(null);}}/></label>
      <label>Section size · measures<select value={sectionBars} onChange={event=>{setSectionBars(Number(event.target.value));setPreview(null);}}><option value={4}>4</option><option value={8}>8</option><option value={16}>16</option></select></label>
      <label>Energy shape<select value={energy} onChange={event=>{setEnergy(event.target.value as EnergyArc);setPreview(null);}}><option value="steady">Steady source groove</option><option value="verse-chorus">Verse and lifted chorus</option><option value="build">Gradual density build</option></select></label>
      <label>Insert a fill every<select value={fillEvery} onChange={event=>{setFillEvery(Number(event.target.value));setPreview(null);}}><option value={4}>4 measures</option><option value={8}>8 measures</option><option value={16}>16 measures</option></select></label>
    </div>
    <p>Estimated at {bpm} BPM in {source?.meter ?? song.meter}: about {targetBars} measures. Fills use the selected source groove’s meter and subdivision.</p>
    <button type="button" disabled={!source} onClick={generate}>Generate draft preview</button>
    {preview&&<section className="song-builder-arrangement-preview"><h3>Draft preview · {preview.length} sections</h3><ol>{preview.map(section=><li key={section.id}><strong>{section.name}</strong> · {section.kind} · {buildArrangementBars({ ...song, sections: [section] }).length} measures · {section.parts.reduce((sum,part)=>sum+part.hits.length,0)} notes</li>)}</ol><div className="song-builder-actions"><button type="button" aria-pressed={previewing} onClick={()=>onPreview(preview)}>{previewing?"Stop draft playback":"Hear draft"}</button><button type="button" disabled={song.sections.length+preview.length>32} onClick={apply}>Append draft to song</button><button type="button" onClick={()=>setPreview(null)}>Discard draft</button></div></section>}
    <p role="status">{message}</p>
  </details>;
}
