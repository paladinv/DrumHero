"use client";

import { useEffect, useState } from "react";
import { normalizeTrainerCueSequence, parseSavedTrainerCueSequences, type SavedTrainerCueSequence, type TrainerCueAction, type TrainerCueSequence } from "@/lib/trainer-cue-sequences";
import type { Instrument } from "@/lib/types";

const KEY = "drum-hero:trainer-cue-sequences:v1";
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const actionLabels: Record<TrainerCueAction, string> = { crash: "Add a crash", loud: "Play louder", soft: "Play softer", dropout: "Drop one voice", "accent-shift": "Shift the accent" };

export function TrainerCueSequenceEditor({ value, beatsPerBar, disabled, onChange }: {
  value: TrainerCueSequence;
  beatsPerBar: number;
  disabled: boolean;
  onChange: (sequence: TrainerCueSequence) => void;
}) {
  const [saved, setSaved] = useState<SavedTrainerCueSequence[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [action, setAction] = useState<TrainerCueAction>("crash");
  const [beat, setBeat] = useState(1);
  const [voice, setVoice] = useState<Instrument>("hihat");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setSaved(parseSavedTrainerCueSequences(localStorage.getItem(KEY))); }
      catch { setSaved([]); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const update = (next: TrainerCueSequence) => {
    const normalized = normalizeTrainerCueSequence(next, beatsPerBar);
    if (normalized) onChange(normalized);
    else onChange(next);
  };
  const addCue = () => {
    if (value.cues.length >= 16) { setMessage("A cue sequence can contain up to 16 responses."); return; }
    update({ ...value, cues: [...value.cues, { beat: Math.min(beatsPerBar, beat), action, ...(action === "dropout" ? { voice } : {}) }] });
    setMessage("");
  };
  const save = () => {
    const sequence = normalizeTrainerCueSequence(value, beatsPerBar);
    if (!sequence) { setMessage("Add at least one valid response and give the sequence a name."); return; }
    const id = selectedId || crypto.randomUUID();
    const next = selectedId
      ? saved.map(item => item.id === selectedId ? { id, ...sequence } : item)
      : [{ id, ...sequence }, ...saved].slice(0, 30);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setSaved(next); setSelectedId(id); setMessage(`Saved “${sequence.name}” on this device.`);
    } catch { setMessage("Could not save this sequence. Browser storage may be full or unavailable."); }
  };

  return <div className="trainer-cue-sequence-editor" aria-label="Custom cue sequence editor">
    <label>Sequence name<input value={value.name} maxLength={60} disabled={disabled} onChange={event => update({ ...value, name: event.target.value })} /></label>
    <label>Saved sequences<select value={selectedId} disabled={disabled || !ready} onChange={event => {
      const id = event.target.value;
      setSelectedId(id);
      const match = saved.find(item => item.id === id);
      if (match) { onChange({ name: match.name, cues: match.cues }); setMessage(`Loaded “${match.name}”.`); }
      else setMessage("");
    }}><option value="">Current unsaved sequence</option>{saved.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="trainer-cue-sequence-add">
      <label>Response<select value={action} disabled={disabled} onChange={event => setAction(event.target.value as TrainerCueAction)}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Beat<select value={Math.min(beat, beatsPerBar)} disabled={disabled} onChange={event => setBeat(Number(event.target.value))}>{Array.from({ length: Math.max(1, Math.min(16, beatsPerBar)) }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      {action === "dropout" && <label>Voice<select value={voice} disabled={disabled} onChange={event => setVoice(event.target.value as Instrument)}>{voices.map(item => <option key={item} value={item}>{item}</option>)}</select></label>}
      <button type="button" className="button-secondary" disabled={disabled} onClick={addCue}>Add response</button>
    </div>
    <ol className="trainer-cue-sequence-list" aria-label="Responses in this sequence">{value.cues.map((cue, index) => <li key={`${cue.action}-${cue.beat}-${index}`}><span>{index + 1}. {actionLabels[cue.action]}{cue.action === "dropout" ? ` · ${cue.voice ?? "hihat"}` : ""} on beat {cue.beat}</span><button type="button" className="button-secondary" aria-label={`Remove response ${index + 1}`} disabled={disabled} onClick={() => { setSelectedId(""); update({ ...value, cues: value.cues.filter((_, cueIndex) => cueIndex !== index) }); }}>Remove</button></li>)}</ol>
    <p>Responses repeat in each bar. The cue appears one or two beats before the selected beat and the changed targets are scored.</p>
    <button type="button" className="button-secondary" disabled={disabled || !ready} onClick={save}>{selectedId ? "Update saved sequence" : "Save cue sequence"}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
