"use client";
import { useMemo, useState } from "react";
import { SONG_INSTRUMENTS, type SongInstrument } from "@/lib/types";
import { DEFAULT_MIDI_NOTES } from "@/lib/song-builder-settings";
import type { DrumSong, SongKitProfile, SongLibraryState } from "@/lib/song-library";

const uid = () => crypto.randomUUID();
const voices = SONG_INSTRUMENTS;
const MIDI_KEY = "drum-hero:song-midi:v1";
function currentMidiNotes() {
  const notes = { ...DEFAULT_MIDI_NOTES };
  try {
    const saved = JSON.parse(localStorage.getItem(MIDI_KEY) || "null") as { notes?: Partial<Record<SongInstrument, number>> } | null;
    for (const voice of voices) {
      const note = saved?.notes?.[voice];
      if (typeof note === "number" && Number.isInteger(note) && note >= 0 && note <= 127) notes[voice] = note;
    }
  } catch { /* Keep the General MIDI defaults when device storage is unavailable. */ }
  return notes;
}

export function SongKitProfiles({ state, song, save }: { state: SongLibraryState; song: DrumSong; save: (state: SongLibraryState | ((current: SongLibraryState) => SongLibraryState)) => void }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const profiles = state.kitProfiles ?? [];
  const assigned = profiles.find(profile => profile.id === song.kitSetup?.profileId);
  const requiredVoices = useMemo(() => [...new Set(song.sections.flatMap(section => section.parts.flatMap(part => part.hits.map(hit => hit.instrument))))], [song.sections]);

  const createProfile = () => {
    if (!name.trim() || profiles.length >= 100) return;
    const setup = song.kitSetup;
    const profile: SongKitProfile = { id: uid(), name: name.trim().slice(0, 80), kitType: setup?.kitType ?? "acoustic", tuning: setup?.tuning ?? "", cymbals: setup?.cymbals ?? "", pedal: setup?.pedal ?? "", notes: setup?.notes ?? "", availableVoices: [...voices], midiNotes: currentMidiNotes() };
    const updatedSong = { ...song, bundled: false, updatedAt: new Date().toISOString(), kitSetup: { ...setup, profileId: profile.id, kitType: profile.kitType, tuning: profile.tuning, cymbals: profile.cymbals, pedal: profile.pedal, notes: profile.notes } };
    save(current => ({ ...current, kitProfiles: [...(current.kitProfiles ?? []), profile], songs: [...current.songs.filter(item => item.id !== song.id), updatedSong] }));
    setName("");
  };
  const updateProfile = (id: string, change: Partial<SongKitProfile>) => save(current => ({ ...current, kitProfiles: (current.kitProfiles ?? []).map(profile => profile.id === id ? { ...profile, ...change } : profile) }));
  const deleteProfile = (profile: SongKitProfile) => {
    if (!window.confirm("Delete the kit profile “" + profile.name + "”? Songs and setlists will keep their copied setup details.")) return;
    save(current => ({
      ...current,
      kitProfiles: (current.kitProfiles ?? []).filter(item => item.id !== profile.id),
      setlists: current.setlists.map(setlist => setlist.kitProfileId === profile.id ? { ...setlist, kitProfileId: undefined } : setlist),
      songs: current.songs.map(item => item.kitSetup?.profileId === profile.id
        ? { ...item, bundled: false, updatedAt: new Date().toISOString(), kitSetup: { ...item.kitSetup, profileId: undefined } }
        : item)
    }));
  };
  const applyProfile = (profile?: SongKitProfile) => {
    const kitSetup = profile ? { profileId: profile.id, kitType: profile.kitType, tuning: profile.tuning, cymbals: profile.cymbals, pedal: profile.pedal, notes: profile.notes } : { ...song.kitSetup, profileId: undefined };
    const updatedSong = { ...song, bundled: false, updatedAt: new Date().toISOString(), kitSetup };
    save(current => ({ ...current, songs: [...current.songs.filter(item => item.id !== song.id), updatedSong] }));
  };
  const applyMidiMap = () => {
    if (!assigned) return;
    try {
      const previous = JSON.parse(localStorage.getItem(MIDI_KEY) || "null") as { inputId?: string; latencyMs?: number } | null;
      localStorage.setItem(MIDI_KEY, JSON.stringify({ inputId: typeof previous?.inputId === "string" ? previous.inputId : "", latencyMs: Number.isFinite(previous?.latencyMs) ? previous!.latencyMs : 0, notes: { ...DEFAULT_MIDI_NOTES, ...assigned.midiNotes } }));
      window.dispatchEvent(new CustomEvent("drum-hero:song-midi-config-change"));
      setMessage("Applied the " + assigned.name + " MIDI note map to this browser’s Song Library practice input.");
    } catch { setMessage("Could not apply this MIDI map because browser storage is unavailable."); }
  };
  return <section className="song-kit-profiles" aria-labelledby="song-kit-profiles-title">
    <h4 id="song-kit-profiles-title">Reusable kit profiles</h4>
    <p>Profiles keep kit notes and MIDI note maps together. Device names and timing calibration remain in this browser’s MIDI setup.</p>
    <div className="song-actions"><label>Profile for this song<select value={assigned?.id ?? ""} onChange={event => applyProfile(profiles.find(profile => profile.id === event.target.value))}><option value="">Use song-specific setup</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>{assigned && <button type="button" onClick={() => applyProfile(assigned)}>Apply profile details</button>}</div>
    <label>New profile name<input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Studio acoustic kit" /></label>
    <button type="button" disabled={!name.trim() || profiles.length >= 100} onClick={createProfile}>Save this setup as a kit profile</button>
    {profiles.length > 0 && <details className="song-kit-profile-catalog"><summary>Saved kit profiles ({profiles.length})</summary><ul>{profiles.map(profile => <li key={profile.id}><strong>{profile.name}</strong> · {profile.kitType} kit<div className="song-actions"><button type="button" onClick={() => applyProfile(profile)}>{assigned?.id === profile.id ? "Profile in use for this song" : "Use for this song"}</button><button type="button" onClick={() => deleteProfile(profile)}>Delete profile</button></div></li>)}</ul></details>}
    {assigned && <details className="song-kit-profile-editor" open>
      <summary>Edit {assigned.name}</summary>
      <label>Profile name<input maxLength={80} value={assigned.name} onChange={event => updateProfile(assigned.id, { name: event.target.value.slice(0, 80) })} /></label>
      <label>Kit type<select value={assigned.kitType} onChange={event => updateProfile(assigned.id, { kitType: event.target.value as SongKitProfile["kitType"] })}><option value="acoustic">Acoustic</option><option value="electronic">Electronic</option><option value="hybrid">Hybrid</option></select></label>
      <label>Drum tuning<textarea maxLength={200} value={assigned.tuning} onChange={event => updateProfile(assigned.id, { tuning: event.target.value.slice(0, 200) })} /></label>
      <label>Cymbals<textarea maxLength={300} value={assigned.cymbals} onChange={event => updateProfile(assigned.id, { cymbals: event.target.value.slice(0, 300) })} /></label>
      <label>Pedal<input maxLength={200} value={assigned.pedal} onChange={event => updateProfile(assigned.id, { pedal: event.target.value.slice(0, 200) })} /></label>
      <label>Setup notes<textarea maxLength={1000} value={assigned.notes} onChange={event => updateProfile(assigned.id, { notes: event.target.value.slice(0, 1000) })} /></label>
      <button type="button" onClick={applyMidiMap}>Apply MIDI map to Song Library practice</button>
      <fieldset className="song-kit-profile-voices"><legend>Voices available on this kit</legend>{voices.map(voice => <label key={voice}><input type="checkbox" checked={assigned.availableVoices.includes(voice)} onChange={event => updateProfile(assigned.id, { availableVoices: event.target.checked ? [...new Set([...assigned.availableVoices, voice])] : assigned.availableVoices.filter(item => item !== voice) })} />{voice}</label>)}</fieldset>
      <details><summary>MIDI note map</summary><p>Duplicate MIDI notes are allowed for shared triggers; missing entries are reported below.</p>{voices.map(voice => <label className="song-kit-profile-midi" key={voice}>{voice} MIDI note<input type="number" min={0} max={127} value={assigned.midiNotes[voice] ?? ""} onChange={event => { const value = event.target.value === "" ? undefined : Math.max(0, Math.min(127, Math.round(Number(event.target.value)))); const midiNotes = { ...assigned.midiNotes }; if (value === undefined) delete midiNotes[voice]; else midiNotes[voice] = value; updateProfile(assigned.id, { midiNotes }); }} /></label>)}</details>
      <button type="button" onClick={() => deleteProfile(assigned)}>Delete profile</button>
    </details>}
    <p role="status" aria-live="polite">{message}</p>
    {assigned && <div className="song-kit-profile-readiness"><strong>{assigned.name} compatibility</strong>{requiredVoices.length ? <p>Arrangement voices: {requiredVoices.join(", ")}</p> : <p>No drum voices are charted yet.</p>}{requiredVoices.some(voice => !assigned.availableVoices.includes(voice)) && <p role="status">Missing kit voices: {requiredVoices.filter(voice => !assigned.availableVoices.includes(voice)).join(", ")}</p>}{requiredVoices.some(voice => assigned.midiNotes[voice] === undefined) && <p role="status">Missing MIDI notes: {requiredVoices.filter(voice => assigned.midiNotes[voice] === undefined).join(", ")}</p>}</div>}
  </section>;
}
