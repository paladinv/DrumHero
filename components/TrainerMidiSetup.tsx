"use client";

import { useEffect, useRef, useState } from "react";
import type { Instrument, MidiArticulation } from "@/lib/types";

type VelocityRange = { soft: number; hard: number };
type KitPreset = { id: string; name: string; midiMap: Record<number, Instrument | null>; midiArticulations: Record<number, MidiArticulation | null>; midiVelocityRanges: Record<number, VelocityRange> };
const VOICES: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const ARTICULATIONS: Array<[MidiArticulation | "", string]> = [["", "No articulation"], ["closed-hat", "Closed hi-hat"], ["open-hat", "Open hi-hat"], ["pedal-hat", "Hi-hat pedal"], ["foot-splash", "Foot splash"], ["ride", "Ride"], ["crash", "Crash cymbal"], ["rimshot", "Rimshot"], ["side-stick", "Side-stick"]];
const PRESET_LIMIT = 20;
const KIT_PROFILE_FORMAT = "drum-hero-midi-kit-profile-v1";

function parseKitProfile(value: unknown): Omit<KitPreset, "id"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<KitPreset> & { application?: string; format?: string; version?: number };
  if (item.application !== "Drum Hero" || item.format !== KIT_PROFILE_FORMAT || item.version !== 1 || typeof item.name !== "string" || !item.name.trim() || item.name.length > 60 || !item.midiMap || typeof item.midiMap !== "object" || Array.isArray(item.midiMap)) return null;
  if (Object.entries(item.midiMap).some(([note, voice]) => !/^\d+$/.test(note) || Number(note) > 127 || (voice !== null && !VOICES.includes(voice as Instrument))) ||
      Object.entries(item.midiArticulations ?? {}).some(([note, articulation]) => !/^\d+$/.test(note) || Number(note) > 127 || (articulation !== null && !ARTICULATIONS.some(([value]) => value === articulation))) ||
      Object.entries(item.midiVelocityRanges ?? {}).some(([note, range]) => !/^\d+$/.test(note) || Number(note) > 127 || !range || !Number.isInteger(range.soft) || range.soft < 1 || range.soft > 127 || !Number.isInteger(range.hard) || range.hard > 127 || range.hard < range.soft + 4)) return null;
  const midiMap: KitPreset["midiMap"] = {};
  for (const [note, voice] of Object.entries(item.midiMap)) if (/^\d+$/.test(note) && Number(note) <= 127 && (voice === null || VOICES.includes(voice as Instrument))) midiMap[Number(note)] = voice as Instrument | null;
  const midiArticulations: KitPreset["midiArticulations"] = {};
  for (const [note, articulation] of Object.entries(item.midiArticulations ?? {})) if (/^\d+$/.test(note) && Number(note) <= 127 && (articulation === null || ARTICULATIONS.some(([value]) => value === articulation))) midiArticulations[Number(note)] = articulation as MidiArticulation | null;
  const midiVelocityRanges: KitPreset["midiVelocityRanges"] = {};
  for (const [note, range] of Object.entries(item.midiVelocityRanges ?? {})) if (/^\d+$/.test(note) && Number(note) <= 127 && range && Number.isInteger(range.soft) && range.soft >= 1 && range.soft <= 127 && Number.isInteger(range.hard) && range.hard <= 127 && range.hard >= range.soft + 4) midiVelocityRanges[Number(note)] = { soft: range.soft, hard: range.hard };
  return { name: item.name.trim(), midiMap, midiArticulations, midiVelocityRanges };
}

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
      const midiVelocityRanges: KitPreset["midiVelocityRanges"] = {};
      for (const [note, range] of Object.entries(item.midiVelocityRanges ?? {})) if (/^\d+$/.test(note) && Number(note) <= 127 && range && Number.isInteger(range.soft) && range.soft >= 1 && range.soft <= 127 && Number.isInteger(range.hard) && range.hard <= 127 && range.hard >= range.soft + 4) midiVelocityRanges[Number(note)] = { soft: range.soft, hard: range.hard };
      return [{ id: item.id, name: item.name.slice(0, 60), midiMap, midiArticulations, midiVelocityRanges }];
    });
  } catch { return []; }
}

export function TrainerMidiSetup({ profileKey, lastMidiNote, lastMidiVelocity, lastMidiNoteVersion, connected, midiMap, midiArticulations, midiVelocityRanges, disabled, onMapNote, onMapArticulation, onMapVelocityRange, onApply }: {
  profileKey: string;
  lastMidiNote: number | null;
  lastMidiVelocity: number | null;
  lastMidiNoteVersion: number;
  connected: boolean;
  midiMap: Record<number, Instrument | null>;
  midiArticulations: Record<number, MidiArticulation | null>;
  midiVelocityRanges: Record<number, VelocityRange>;
  disabled: boolean;
  onMapNote: (note: number, voice: Instrument | null) => void;
  onMapArticulation: (note: number, articulation: MidiArticulation | null) => void;
  onMapVelocityRange: (note: number, range: VelocityRange | null) => void;
  onApply: (midiMap: Record<number, Instrument | null>, midiArticulations: Record<number, MidiArticulation | null>, midiVelocityRanges: Record<number, VelocityRange>) => void;
}) {
  const [presets, setPresets] = useState<KitPreset[]>([]);
  const [loadedPresetKey, setLoadedPresetKey] = useState("");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [guidedIndex, setGuidedIndex] = useState<number | null>(null);
  const profileFileRef = useRef<HTMLInputElement>(null);
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
    const preset = { id: crypto.randomUUID(), name: name.trim() || `Kit map ${presets.length + 1}`, midiMap: { ...midiMap }, midiArticulations: { ...midiArticulations }, midiVelocityRanges: { ...midiVelocityRanges } };
    if (persist([...presets, preset], `Saved “${preset.name}”.`)) { setSelectedId(preset.id); setName(""); }
  };
  const loadPreset = (id: string) => {
    const preset = presets.find(item => item.id === id);
    setSelectedId(id);
    if (preset) { onApply({ ...preset.midiMap }, { ...preset.midiArticulations }, { ...preset.midiVelocityRanges }); setMessage(`Loaded “${preset.name}”.`); }
  };
  const updateSelected = () => {
    if (!presetsReady) return;
    if (!selectedId) return;
    persist(presets.map(item => item.id === selectedId ? { ...item, midiMap: { ...midiMap }, midiArticulations: { ...midiArticulations }, midiVelocityRanges: { ...midiVelocityRanges } } : item), "Updated the selected kit map.");
  };
  const duplicateSelected = () => {
    if (!presetsReady) return;
    const source = presets.find(item => item.id === selectedId);
    if (!source) return;
    if (presets.length >= PRESET_LIMIT) { setMessage(`Keep up to ${PRESET_LIMIT} kit maps for this device.`); return; }
    const copy = { ...source, id: crypto.randomUUID(), name: `${source.name.slice(0, 52)} copy` };
    if (persist([...presets, copy], "Duplicated kit map.")) setSelectedId(copy.id);
  };

  const exportProfile = () => {
    const presetName = presets.find(item => item.id === selectedId)?.name ?? (name.trim() || "My drum kit");
    const payload = { application: "Drum Hero", format: KIT_PROFILE_FORMAT, version: 1, name: presetName, midiMap, midiArticulations, midiVelocityRanges };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${presetName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "drum-kit"}-kit-profile.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Exported “${presetName}” with MIDI mappings, articulations, and velocity ranges. Device latency and audio calibration stay local.`);
  };
  const importProfile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 200_000) throw new Error("Choose a kit profile smaller than 200 KB.");
      const profile = parseKitProfile(JSON.parse(await file.text()));
      if (!profile) throw new Error("This file is not a valid Drum Hero MIDI kit profile.");
      const imported = { id: crypto.randomUUID(), ...profile };
      onApply({ ...imported.midiMap }, { ...imported.midiArticulations }, { ...imported.midiVelocityRanges });
      setName(imported.name);
      if (presets.length < PRESET_LIMIT && persist([...presets, imported], `Imported “${imported.name}”.`)) setSelectedId(imported.id);
      else setMessage(`Loaded “${imported.name}” for this session. The local kit map list is full, so it was not added there.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import this MIDI kit profile."); }
    finally { if (profileFileRef.current) profileFileRef.current.value = ""; }
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
    <div className="transport"><button type="button" className="button-secondary" disabled={disabled} onClick={exportProfile}>Export kit profile</button><button type="button" className="button-secondary" disabled={disabled} onClick={() => profileFileRef.current?.click()}>Import kit profile</button><input ref={profileFileRef} type="file" accept="application/json,.json" hidden onChange={event => void importProfile(event.target.files?.[0])} /></div>
    {lastMidiNote !== null && <section className="trainer-midi-velocity-calibration"><strong>Velocity range · MIDI {lastMidiNote}</strong><p>Latest raw strike: {lastMidiVelocity ?? "not reported"} · soft and hard samples normalize to a comparable strength range for scoring.</p><div className="transport"><button type="button" disabled={disabled || lastMidiVelocity === null} onClick={() => { const soft = lastMidiVelocity!; const hard = midiVelocityRanges[lastMidiNote]?.hard; onMapVelocityRange(lastMidiNote, { soft, hard: hard !== undefined && hard >= soft + 4 ? hard : Math.min(127, soft + 20) }); }}>Set current strike as soft</button><button type="button" disabled={disabled || lastMidiVelocity === null} onClick={() => { const hard = lastMidiVelocity!; const soft = midiVelocityRanges[lastMidiNote]?.soft; onMapVelocityRange(lastMidiNote, { soft: soft !== undefined && soft <= hard - 4 ? soft : Math.max(1, hard - 20), hard }); }}>Set current strike as hard</button><button type="button" className="button-secondary" disabled={disabled || !midiVelocityRanges[lastMidiNote]} onClick={() => onMapVelocityRange(lastMidiNote, null)}>Clear range</button></div>{midiVelocityRanges[lastMidiNote] && <small>Saved raw range {midiVelocityRanges[lastMidiNote].soft}–{midiVelocityRanges[lastMidiNote].hard}.</small>}</section>}
    {lastMidiNote !== null && <fieldset className="trainer-midi-current"><legend>Latest note · MIDI {lastMidiNote}</legend>{renderMapping(lastMidiNote)}</fieldset>}
    <details><summary>All mapped notes · quick edit</summary><div className="trainer-midi-map-list">{noteRows.map(renderMapping)}</div></details>
    <small>Kit profile files include voice mappings, articulations, and optional per-pad velocity ranges. Input latency and microphone calibration stay on this device.</small>
    {message && <p role="status">{message}</p>}
  </div>;
}
