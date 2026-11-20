"use client";

import { useEffect, useRef, useState } from "react";
import type { Instrument, MidiArticulation } from "@/lib/types";

type KitPreset = { id: string; name: string; midiMap: Record<number, Instrument | null>; midiArticulations: Record<number, MidiArticulation | null> };
const VOICES: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const ARTICULATIONS: Array<[MidiArticulation | "", string]> = [["", "No articulation"], ["closed-hat", "Closed hi-hat"], ["open-hat", "Open hi-hat"], ["pedal-hat", "Hi-hat pedal"], ["foot-splash", "Foot splash"], ["ride", "Ride"], ["crash", "Crash cymbal"], ["rimshot", "Rimshot"], ["side-stick", "Side-stick"]];
const PRESET_LIMIT = 20;

function parsePresets(raw: string | null): KitPreset[] {
  if (!raw) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.slice(0, PRESET_LIMIT).flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const item = value as Partial<KitPreset>;
      if (typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim() || !item.midiMap || typeof item.midiMap !== "object") return [];
      const midiMap: KitPreset["midiMap"] = {};
      for (const [note, voice] of Object.entries(item.midiMap)) if (/^\d+$/.test(note) && Number(note) <= 127 && (voice === null || VOICES.includes(voice as Instrument))) midiMap[Number(note)] = voice as Instrument | null;
      const midiArticulations: KitPreset["midiArticulations"] = {};
      for (const [note, articulation] of Object.entries(item.midiArticulations ?? {})) if (/^\d+$/.test(note) && Number(note) <= 127 && (articulation === null || ARTICULATIONS.some(([value]) => value === articulation))) midiArticulations[Number(note)] = articulation as MidiArticulation | null;
      return [{ id: item.id, name: item.name.slice(0, 60), midiMap, midiArticulations }];
    });
  } catch { return []; }
}

export function TrainerMidiSetup({ profileKey, lastMidiNote, lastMidiNoteVersion, connected, midiMap, midiArticulations, disabled, onMapNote, onMapArticulation, onApply }: {
  profileKey: string;
  lastMidiNote: number | null;
  lastMidiNoteVersion: number;
  connected: boolean;
  midiMap: Record<number, Instrument | null>;
  midiArticulations: Record<number, MidiArticulation | null>;
  disabled: boolean;
  onMapNote: (note: number, voice: Instrument | null) => void;
  onMapArticulation: (note: number, articulation: MidiArticulation | null) => void;
  onApply: (midiMap: Record<number, Instrument | null>, midiArticulations: Record<number, MidiArticulation | null>) => void;
}) {
  const [presets, setPresets] = useState<KitPreset[]>([]);
  const [loadedPresetKey, setLoadedPresetKey] = useState("");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [guidedIndex, setGuidedIndex] = useState<number | null>(null);
  const guideAfterVersion = useRef(0);
  const storageKey = `drum-hero:trainer-midi-presets:v1:${profileKey}`;
  const presetsReady = loadedPresetKey === storageKey;
  const selectedPresetExists = presets.some(item => item.id === selectedId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setPresets(parsePresets(localStorage.getItem(storageKey))); }
      catch { setPresets([]); setMessage("Kit map storage is unavailable in this browser."); }
      setSelectedId(""); setLoadedPresetKey(storageKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!disabled) return;
    const timer = window.setTimeout(() => setGuidedIndex(null), 0);
    return () => window.clearTimeout(timer);
  }, [disabled]);

  useEffect(() => {
    if (disabled || guidedIndex === null || lastMidiNote === null || lastMidiNoteVersion <= guideAfterVersion.current) return;
    guideAfterVersion.current = lastMidiNoteVersion;
    const voice = VOICES[guidedIndex];
    onMapNote(lastMidiNote, voice);
    setMessage(`Mapped MIDI ${lastMidiNote} to ${voice}.`);
    setGuidedIndex(index => index === null || index >= VOICES.length - 1 ? null : index + 1);
  }, [disabled, guidedIndex, lastMidiNote, lastMidiNoteVersion, onMapNote]);

  const persist = (next: KitPreset[], success: string) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setPresets(next); setMessage(success); return true; }
    catch { setMessage("Kit preset storage is unavailable or full."); return false; }
  };
  const savePreset = () => {
    if (!presetsReady) return;
    if (presets.length >= PRESET_LIMIT) { setMessage(`Keep up to ${PRESET_LIMIT} kit maps for this device.`); return; }
    const preset = { id: crypto.randomUUID(), name: name.trim() || `Kit map ${presets.length + 1}`, midiMap: { ...midiMap }, midiArticulations: { ...midiArticulations } };
    if (persist([...presets, preset], `Saved “${preset.name}”.`)) { setSelectedId(preset.id); setName(""); }
  };
  const loadPreset = (id: string) => {
    const preset = presets.find(item => item.id === id);
    setSelectedId(id);
    if (preset) { onApply({ ...preset.midiMap }, { ...preset.midiArticulations }); setMessage(`Loaded “${preset.name}”.`); }
  };
  const updateSelected = () => {
    if (!presetsReady) return;
    if (!selectedId) return;
    persist(presets.map(item => item.id === selectedId ? { ...item, midiMap: { ...midiMap }, midiArticulations: { ...midiArticulations } } : item), "Updated the selected kit map.");
  };
  const duplicateSelected = () => {
    if (!presetsReady) return;
    const source = presets.find(item => item.id === selectedId);
    if (!source) return;
    if (presets.length >= PRESET_LIMIT) { setMessage(`Keep up to ${PRESET_LIMIT} kit maps for this device.`); return; }
    const copy = { ...source, id: crypto.randomUUID(), name: `${source.name.slice(0, 52)} copy` };
    if (persist([...presets, copy], "Duplicated kit map.")) setSelectedId(copy.id);
  };

  const noteRows = [...new Set([...Object.keys(midiMap).map(Number), ...Object.keys(midiArticulations).map(Number)])].filter(note => Number.isInteger(note) && note >= 0 && note <= 127).sort((a, b) => a - b);
  const renderMapping = (note: number) => <div className="trainer-midi-map-row" key={note}><strong>MIDI {note}</strong><select aria-label={`Voice for MIDI note ${note}`} value={midiMap[note] ?? ""} disabled={disabled} onChange={event => onMapNote(note, event.target.value ? event.target.value as Instrument : null)}><option value="">Unmapped</option>{VOICES.map(voice => <option key={voice} value={voice}>{voice}</option>)}</select><select aria-label={`Articulation for MIDI note ${note}`} value={midiArticulations[note] ?? ""} disabled={disabled} onChange={event => onMapArticulation(note, event.target.value ? event.target.value as MidiArticulation : null)}>{ARTICULATIONS.map(([value, label]) => <option key={value || "none"} value={value}>{label}</option>)}</select></div>;
  return <div id="trainer-midi-setup" className="trainer-midi-setup">
    <div className="trainer-midi-soundcheck" role="status"><strong>MIDI input check</strong><p>{lastMidiNote === null ? "Connect your kit, then strike one pad. The latest note and its mapped drum will appear here." : midiMap[lastMidiNote] ? `Input received: MIDI ${lastMidiNote} maps to ${midiMap[lastMidiNote]}${midiArticulations[lastMidiNote] ? ` · ${midiArticulations[lastMidiNote]?.replaceAll("-", " ")}` : ""}.` : `Input received: MIDI ${lastMidiNote} is not mapped yet. Assign its drum voice below.`}</p></div>
    <section className="trainer-midi-guide" aria-label="Guided MIDI kit mapping">
      <strong>Guided kit mapping</strong>
      {guidedIndex === null ? <><p>Strike one pad for each voice and the Trainer will map the incoming MIDI note automatically.</p><button type="button" disabled={disabled || !connected} onClick={() => { guideAfterVersion.current = lastMidiNoteVersion; setGuidedIndex(0); setMessage("Guided mapping started. Strike the kick pad first."); }}>Map my kit one pad at a time</button></> : <><p role="status">Step {guidedIndex + 1} of {VOICES.length} · Strike the {VOICES[guidedIndex]} pad.</p><progress max={VOICES.length} value={guidedIndex} aria-label={`MIDI mapping step ${guidedIndex + 1} of ${VOICES.length}`} /><button type="button" disabled={disabled} onClick={() => { setGuidedIndex(null); setMessage("Guided mapping cancelled."); }}>Cancel mapping</button></>}
    </section>
    <div className="trainer-midi-presets"><strong>Kit maps for this device</strong><div className="transport"><select aria-label="Saved kit maps" value={selectedId} disabled={disabled || !presetsReady || !presets.length} onChange={event => loadPreset(event.target.value)}><option value="">Choose saved map</option>{presets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" disabled={disabled || !presetsReady || !selectedPresetExists} onClick={updateSelected}>Update map</button><button type="button" disabled={disabled || !presetsReady || !selectedPresetExists || presets.length >= PRESET_LIMIT} onClick={duplicateSelected}>Duplicate</button><button type="button" disabled={disabled || !presetsReady || !selectedPresetExists} onClick={() => { if (persist(presets.filter(item => item.id !== selectedId), "Deleted kit map.")) setSelectedId(""); }}>Delete</button></div><div className="transport"><input aria-label="New kit map name" maxLength={60} value={name} disabled={disabled || !presetsReady} onChange={event => setName(event.target.value)} placeholder="Name this kit map" /><button type="button" disabled={disabled || !presetsReady || presets.length >= PRESET_LIMIT} onClick={savePreset}>Save current map</button></div></div>
    {lastMidiNote !== null && <fieldset className="trainer-midi-current"><legend>Latest note · MIDI {lastMidiNote}</legend>{renderMapping(lastMidiNote)}</fieldset>}
    <details><summary>All mapped notes · quick edit</summary><div className="trainer-midi-map-list">{noteRows.map(renderMapping)}</div></details>
    <small>Maps are saved per MIDI device. Articulation tags retain closed/open hi-hat, pedal, foot splash, ride, crash, or rimshot details with each hit.</small>
    {message && <p role="status">{message}</p>}
  </div>;
}
