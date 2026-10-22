"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { assertArrangementChangesAllowed, emptySongLibrary, readSongLibrary, SONG_LIBRARY_KEY, writeSongLibrary, type ArrangementSaveOptions, type SongLibraryState } from "./song-library";
export function useSongLibraryStore() {
  const [state, setState] = useState<SongLibraryState>(emptySongLibrary);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Loading library…");
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const current = useRef<SongLibraryState>(emptySongLibrary());
  const history = useRef<{ past: SongLibraryState[]; future: SongLibraryState[]; lastEdit: number }>({ past: [], future: [], lastEdit: 0 });
  const writing = useRef(false);
  const persist = useCallback((next: SongLibraryState, options: ArrangementSaveOptions = {}) => { writing.current = true; try { writeSongLibrary(next, options); setSaveStatus("All changes saved on this device."); } catch { setSaveStatus("Changes are in memory. Browser storage is full or unavailable. Export a recovery backup, then retry saving."); } finally { writing.current = false; } }, []);
  useEffect(() => {
    const load = () => { if (writing.current) return; const next = readSongLibrary(); current.current = next; setState(next); history.current = { past: [], future: [], lastEdit: 0 }; setHistorySize({ past: 0, future: 0 }); setReady(true); setSaveStatus("Library loaded from this device."); };
    const timer = window.setTimeout(load, 0);
    const storage = (event: StorageEvent) => { if (event.key === SONG_LIBRARY_KEY) load(); };
    window.addEventListener("storage", storage); window.addEventListener("drum-hero:song-library-change", load);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", storage); window.removeEventListener("drum-hero:song-library-change", load); };
  }, []);
  const save = useCallback((value: SongLibraryState | ((state: SongLibraryState) => SongLibraryState), options: ArrangementSaveOptions = {}) => {
    const next = typeof value === "function" ? value(current.current) : value;
    try { assertArrangementChangesAllowed(current.current, next, options); } catch (error) { setSaveStatus(error instanceof Error ? error.message : 'Unlock the approved arrangement first.'); return; }
    const now = Date.now(), stack = history.current;
    if (now - stack.lastEdit > 700 || !stack.past.length) stack.past = [...stack.past, current.current].slice(-30);
    stack.future = []; stack.lastEdit = now;
    current.current = next; setState(next); setHistorySize({ past: stack.past.length, future: 0 }); persist(next, options);
  }, [persist]);
  const travel = useCallback((direction: "past" | "future") => {
    const stack = history.current, items = stack[direction], next = items.at(-1);
    if (!next) return;
    try { assertArrangementChangesAllowed(current.current, next); } catch (error) { setSaveStatus(error instanceof Error ? error.message : 'Unlock the arrangement first.'); return; }
    const reverse = direction === 'past' ? 'future' : 'past';
    stack[direction] = items.slice(0, -1); stack[reverse] = [...stack[reverse], current.current].slice(-30); stack.lastEdit = 0;
    current.current = next; setState(next); setHistorySize({ past: stack.past.length, future: stack.future.length }); persist(next);
  }, [persist]);
  return { state, ready, save, saveStatus, historySize, undo: () => travel("past"), redo: () => travel("future"), retry: () => persist(current.current) };
}
