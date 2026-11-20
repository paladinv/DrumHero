"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { allSongs, readActiveSongLibrary, readSongLibrary, recordSongScore, writeSongLibrary, type DrumSong, type SongLibraryState } from "@/lib/song-library";
import type { SongRunResult } from "./SongSessionPlayer";

const SongSessionPlayer = dynamic(() => import("./SongSessionPlayer").then(module => module.SongSessionPlayer), { loading: () => <p>Loading full kit scoring…</p> });

export function SongLinkedPractice({ patternId, engine, targetBpm }: { patternId: string; engine: "pad" | "trainer"; targetBpm?: number }) {
  const [state, setState] = useState<SongLibraryState>(() => readActiveSongLibrary());
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const refresh = () => { setState(readActiveSongLibrary()); setLoaded(true); };
    refresh();
    window.addEventListener("drum-hero:song-library-change", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("drum-hero:song-library-change", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const [, songId, sectionId, partId] = patternId.split(":");
  const song = useMemo(() => allSongs(state).find(item => item.id === songId), [state, songId]);
  const section = song?.sections.find(item => item.id === sectionId);
  const part = section?.parts.find(item => item.id === partId);
  const record = (results: SongRunResult[]) => {
    try {
      const latest = readSongLibrary();
      const next = results.reduce((current, result) => recordSongScore(current, result.songId, result.sectionId, result.score, {
        partId: result.partId,
        bpm: result.bpm,
        inputMode: result.inputMode,
        engine,
        completePart: result.completePart,
        tempoScale: result.tempoScale,
        timing: result.timing,
        stickingCorrect: result.stickingCorrect,
        stickingChecked: result.stickingChecked
      }), latest);
      writeSongLibrary(next);
      setMessage(`${engine === "trainer" ? "Trainer" : "Practice Pad"} results were linked to this score in Song Library.`);
    } catch { setMessage("Practice finished, but its progress could not be saved on this device."); }
  };
  if (!loaded) return <p role="status">Loading the selected song arrangement…</p>;
  if (!song || !section || !part) return <section className="song-tool-panel"><h2>Song part unavailable</h2><p>This arrangement may have changed. Return to Song Library and choose the part again.</p><Link href="/song-library">Open Song Library</Link></section>;
  const practiceBpm = targetBpm ?? part.bpm;
  return <section className="song-linked-practice"><p>Song Library part · all eight voices are available · {section.name} / {part.name} · {practiceBpm} BPM</p><SongSessionPlayer key={`${song.id}:${section.id}:${part.id}:${song.updatedAt}:${practiceBpm}`} song={song} sectionId={section.id} partId={part.id} targetBpm={practiceBpm} onResults={record} /><p role="status" aria-live="polite">{message}</p><Link href={engine === "pad" ? "/practice" : "/trainer"}>Return to {engine === "pad" ? "Practice Pad" : "Trainer"}</Link> · <Link href="/song-library">Song Library</Link></section>;
}
