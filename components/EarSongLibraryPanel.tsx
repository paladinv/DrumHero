"use client";

import { useEffect, useState } from "react";
import { allSongs, readActiveSongLibrary, songPartPattern } from "@/lib/song-library";
import { EAR_METERS, type EarFeel, type EarMeter } from "@/lib/ear-training";
import type { DrumSong } from "@/lib/song-library";
import type { PracticePattern } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";
import styles from "./RhythmEarTraining.module.css";

export type SongEarSelection = { pattern: PracticePattern; meter: EarMeter; bpm: number; feel: EarFeel; activity: "play" | "identify" | "error"; label: string };

export function EarSongLibraryPanel({ disabled, onStart }: { disabled?: boolean; onStart: (selection: SongEarSelection) => void }) {
  const { t } = useLocalization();
  const [songs, setSongs] = useState<DrumSong[]>([]);
  const [songId, setSongId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [partId, setPartId] = useState("");
  const [activity, setActivity] = useState<SongEarSelection["activity"]>("play");

  useEffect(() => {
    const refresh = () => setSongs(allSongs(readActiveSongLibrary()).filter(song => !song.archived));
    refresh();
    window.addEventListener("drum-hero:song-library-change", refresh);
    return () => window.removeEventListener("drum-hero:song-library-change", refresh);
  }, []);

  const song = songs.find(item => item.id === songId) ?? songs[0];
  const section = song?.sections.find(item => item.id === sectionId) ?? song?.sections[0];
  const part = section?.parts.find(item => item.id === partId) ?? section?.parts[0];

  const start = () => {
    if (!song || !section || !part) return;
    const rawMeter = section.meter ?? song.meter;
    const meter = EAR_METERS.includes(rawMeter as EarMeter) ? rawMeter as EarMeter : "4/4";
    const feel: EarFeel = section.feel?.kind === "swing" ? "swing" : section.feel?.kind === "shuffle" ? "shuffle" : "straight";
    onStart({
      pattern: songPartPattern(song, section, part),
      meter,
      bpm: part.bpm || section.bpm || song.bpm,
      feel,
      activity,
      label: `${song.title} · ${section.name} · ${part.name}`,
    });
  };

  return <section className={`card ${styles.builder}`} aria-label={t("Practice a song from your library")}>
    <span className="eyebrow">{t("Repertoire practice")}</span>
    <h3>{t("Train with your song library")}</h3>
    <p>{t("Choose a saved drum part to hear it, read its notation, and play it back in ear training. Song arrangements stay on this device.")}</p>
    {!songs.length ? <p>{t("Your Song Library is empty. Add a song or drum part, then return here to make a personal listening drill.")}</p> : <>
      <div className={styles.builderControls}>
        <label>{t("Song")}<select value={song?.id ?? ""} disabled={disabled} onChange={event => { setSongId(event.target.value); setSectionId(""); setPartId(""); }}>{songs.map(item => <option key={item.id} value={item.id}>{item.title}{item.artist ? ` · ${item.artist}` : ""}</option>)}</select></label>
        <label>{t("Song section")}<select value={section?.id ?? ""} disabled={disabled || !song} onChange={event => { setSectionId(event.target.value); setPartId(""); }}>{song?.sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>{t("Drum part")}<select value={part?.id ?? ""} disabled={disabled || !section} onChange={event => setPartId(event.target.value)}>{section?.parts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>{t("Listening activity")}<select value={activity} disabled={disabled} onChange={event => setActivity(event.target.value as SongEarSelection["activity"])}><option value="play">{t("Play the song part back")}</option><option value="identify">{t("Choose matching notation")}</option><option value="error">{t("Compare for a moved hit")}</option></select></label>
      </div>
      {song && section && part ? <><p>{t(section.meter ?? song.meter)} · {part.bpm || section.bpm || song.bpm} BPM · {part.hits.length} {t("written hits")}</p><button type="button" className="button" disabled={disabled || !part.hits.length} onClick={start}>{t("Start notation-led song drill")}</button></> : <p>{t("Add a drum part in Song Library to use it here.")}</p>}
    </>}
  </section>;
}
