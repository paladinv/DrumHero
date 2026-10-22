"use client";
import { useEffect, useRef, useState } from 'react';
import { parseSavedTrainerRoutine, type TrainerRoutine } from '@/lib/trainer-enhancements';
import type { PracticePattern } from '@/lib/types';

type SavedRoutine = { id: string; archived: boolean; routine: TrainerRoutine };
const KEY = 'drum-hero:trainer-routines:v1';
const LIMIT = 30;

export function TrainerRoutineShelf({ current, patterns, disabled, onLoad }: { current: TrainerRoutine; patterns: PracticePattern[]; disabled: boolean; onLoad: (routine: TrainerRoutine, id: string) => void }) {
  const [items, setItems] = useState<SavedRoutine[]>([]);
  const [ready, setReady] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [undoItems, setUndoItems] = useState<SavedRoutine[] | null>(null);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const timer = setTimeout(() => { try { const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]'); if (Array.isArray(raw)) setItems(raw.slice(0, LIMIT).flatMap(item => { const routine = parseSavedTrainerRoutine(JSON.stringify(item?.routine)); return routine && typeof item.id === 'string' ? [{ id: item.id, archived: item.archived === true, routine }] : []; })); } catch { /* An empty shelf remains usable. */ } setReady(true); }, 0); return () => clearTimeout(timer); }, []);

  const commit = (next: SavedRoutine[], success: string) => {
    if (next.length > LIMIT) { setMessage(`Keep the library to ${LIMIT} routines or fewer.`); return false; }
    try { localStorage.setItem(KEY, JSON.stringify(next)); setUndoItems(items); setItems(next); setMessage(success); return true; }
    catch { setMessage('Storage is full or unavailable. Export the library and try again.'); return false; }
  };
  const duration = (routine: TrainerRoutine) => Math.ceil(routine.steps.reduce((sum, step) => { const pattern = patterns.find(p => p.id === step.patternId); return sum + ((pattern?.beats ?? 4) * (step.fillPatternId ? step.fillAfterBars + 1 : 1) * step.repetitions + 4) * 60 / step.bpm; }, 0) / 60);
  const saveAs = () => {
    const routine = parseSavedTrainerRoutine(JSON.stringify({ ...current, name: current.name.trim() || 'My practice routine' }));
    if (!routine) { setMessage('Check the routine tempo and repetitions before saving.'); return; }
    const saved = { id: crypto.randomUUID(), archived: false, routine };
    if (commit([...items, saved], 'Saved a new routine.')) setSelectedId(saved.id);
  };
  const updateSelected = () => {
    const routine = parseSavedTrainerRoutine(JSON.stringify({ ...current, name: current.name.trim() || 'My practice routine' }));
    if (!routine) { setMessage('Check the routine tempo and repetitions before saving.'); return; }
    if (!items.some(item => item.id === selectedId)) { setMessage('Load or select a routine before updating it.'); return; }
    commit(items.map(item => item.id === selectedId ? { ...item, routine } : item), 'Updated the selected routine.');
  };
  const exportLibrary = () => {
    const blob = new Blob([JSON.stringify({ application: 'Drum Hero', type: 'trainer-routine-library', version: 1, routines: items }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'drum-hero-trainer-routines.json'; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Exported ${items.length} routine${items.length === 1 ? '' : 's'}, including archived routines.`);
  };
  const importLibrary = async (file?: File) => {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== 'object' || (value as Record<string, unknown>).application !== 'Drum Hero' || (value as Record<string, unknown>).type !== 'trainer-routine-library' || (value as Record<string, unknown>).version !== 1 || !Array.isArray((value as Record<string, unknown>).routines)) throw new Error('This is not a Drum Hero routine library backup.');
      const rawRoutines = (value as { routines: unknown[] }).routines;
      if (rawRoutines.length > LIMIT) throw new Error(`This backup contains more than ${LIMIT} routines.`);
      const incoming = rawRoutines.flatMap(item => {
        const routine = parseSavedTrainerRoutine(JSON.stringify((item as SavedRoutine)?.routine));
        const id = (item as SavedRoutine)?.id;
        return routine && typeof id === 'string' && id.length > 0 && id.length <= 200 ? [{ id, archived: (item as SavedRoutine).archived === true, routine }] : [];
      });
      if (!incoming.length && (value as { routines: unknown[] }).routines.length) throw new Error('No valid routines were found in this backup.');
      const merged = [...items];
      for (const item of incoming) { const index = merged.findIndex(existing => existing.id === item.id); if (index >= 0) merged[index] = item; else merged.push(item); }
      if (merged.length > LIMIT) throw new Error(`This backup would exceed the ${LIMIT}-routine library limit. Archive or remove routines, then retry.`);
      if (commit(merged, `Imported ${incoming.length} routine${incoming.length === 1 ? '' : 's'} into the library.`)) setSelectedId('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this routine backup.'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const undo = () => { if (!undoItems) return; try { localStorage.setItem(KEY, JSON.stringify(undoItems)); setItems(undoItems); setUndoItems(null); setMessage('Restored the previous library state.'); } catch { setMessage('Could not restore the previous library state.'); } };

  return <div className="trainer-routine-shelf"><strong>Named routines</strong><p>Load a routine, edit it above, then update that routine or save a new copy.</p><div className="transport"><button type="button" disabled={disabled || !ready || !current.steps.length || items.length >= LIMIT} onClick={saveAs}>Save as new routine</button><button type="button" disabled={disabled || !ready || !current.steps.length || !items.some(item => item.id === selectedId)} onClick={updateSelected}>Update selected routine</button><button type="button" disabled={!undoItems} onClick={undo}>Undo library change</button></div><label><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Show archived routines</label><ul>{items.filter(item => showArchived || !item.archived).map(item => <li key={item.id} aria-current={selectedId === item.id ? 'true' : undefined}><strong>{item.routine.name}</strong><small>{item.routine.steps.length} steps · about {duration(item.routine)} min{item.archived ? ' · archived' : ''}</small><div className="transport"><button type="button" disabled={disabled} onClick={() => { setSelectedId(item.id); onLoad(item.routine, item.id); }}>Load</button><button type="button" disabled={disabled || items.length >= LIMIT} onClick={() => commit([...items, { ...item, id: crypto.randomUUID(), archived: false, routine: { ...item.routine, name: `${item.routine.name.slice(0, 44)} copy` } }], 'Duplicated routine.')}>Duplicate</button><button type="button" disabled={disabled} onClick={() => commit(items.map(entry => entry.id === item.id ? { ...entry, archived: !entry.archived } : entry), item.archived ? 'Restored routine.' : 'Archived routine.')}>{item.archived ? 'Restore' : 'Archive'}</button><button type="button" disabled={disabled} onClick={() => { if (commit(items.filter(entry => entry.id !== item.id), 'Deleted routine.')) { if (selectedId === item.id) setSelectedId(''); } }}>Delete</button></div></li>)}</ul><div className="transport"><button type="button" disabled={!ready || !items.length} onClick={exportLibrary}>Export library backup</button><label>Import library backup<input ref={fileRef} type="file" accept="application/json,.json" disabled={disabled} onChange={event => void importLibrary(event.target.files?.[0])} /></label></div>{message && <p role="status">{message}</p>}</div>;
}
