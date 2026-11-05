"use client";

import { useMemo, useState } from "react";
import { collectionSongIds } from "@/lib/song-library-next";
import { DEFAULT_SUBSTITUTIONS, PAD_VOICES, substitutePart } from "@/lib/song-library-tools";
import type { Collection, DrumSong, SongLibraryState } from "@/lib/song-library";
import type { SongInstrument } from "@/lib/types";

const MAX_PACK_BYTES = 32 * 1024 * 1024;
const PACK_SPLIT_TARGET_BYTES = MAX_PACK_BYTES - 4096;
const MAX_PACK_SONGS = 200;
type Pack = { filename: string; content: string; bytes: number; songCount: number };

function transferEnvelope(songs: DrumSong[], part: number, total: number) {
  const voices = new Set(PAD_VOICES);
  const compatibilityWarnings = songs.flatMap(song => {
    const unsupported = [...new Set(song.sections.flatMap(section => section.parts.flatMap(item => item.hits.map(hit => hit.instrument))))].filter(voice => !voices.has(voice as typeof PAD_VOICES[number]));
    return unsupported.length ? [`${song.title}: unsupported iOS voices: ${unsupported.join(", ")}.`] : [];
  });
  return JSON.stringify({ format: "drum-hero-song-library-pack-v1", version: 1, exportedAt: new Date().toISOString(), pack: { part, total }, songs, compatibilityWarnings }, null, 2);
}

function splitIntoPacks(songs: DrumSong[]): Pack[] {
  const groups: DrumSong[][] = [];
  let group: DrumSong[] = [];
  for (const song of songs) {
    const candidate = [...group, song];
    const candidateBytes = new Blob([transferEnvelope(candidate, 1, 1)]).size;
    if (candidate.length > MAX_PACK_SONGS || candidateBytes > MAX_PACK_BYTES) {
      if (!group.length) throw new Error(`“${song.title}” is larger than the 32 MiB transfer-pack limit by itself.`);
      groups.push(group);
      group = [song];
      if (new Blob([transferEnvelope(group, 1, 1)]).size > MAX_PACK_BYTES) throw new Error(`“${song.title}” is larger than the 32 MiB transfer-pack limit by itself.`);
    } else if (group.length && candidateBytes > PACK_SPLIT_TARGET_BYTES) {
      groups.push(group);
      group = [song];
    } else group = candidate;
  }
  if (group.length) groups.push(group);
  return groups.map((items, index) => {
    const part = index + 1, content = transferEnvelope(items, part, groups.length);
    const bytes = new Blob([content]).size;
    if (bytes > MAX_PACK_BYTES) throw new Error(`Pack ${part} exceeded the 32 MiB limit while preparing its final download.`);
    return { filename: `drum-hero-song-library-transfer-${String(part).padStart(2, "0")}-of-${String(groups.length).padStart(2, "0")}.json`, content, bytes, songCount: items.length };
  });
}

export function SongTransferPackPanel({ songs, collections, state, save }: { songs: DrumSong[]; collections: Collection[]; state: SongLibraryState; save: (state: SongLibraryState | ((current: SongLibraryState) => SongLibraryState)) => void }) {
  const activeSongs = useMemo(() => songs.filter(song => !song.archived), [songs]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => activeSongs.map(song => song.id));
  const [collectionId, setCollectionId] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<SongInstrument, SongInstrument>>>(DEFAULT_SUBSTITUTIONS);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [downloaded, setDownloaded] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const selectedSongs = activeSongs.filter(song => selectedIds.includes(song.id));
  const unsupportedVoices = [...new Set(selectedSongs.flatMap(song => song.sections.flatMap(section => section.parts.flatMap(part => part.hits.map(hit => hit.instrument)))))]
    .filter(voice => !PAD_VOICES.includes(voice));
  const adaptationPreview = selectedSongs.flatMap(song => {
    let affectedHits = 0, mergedHitCount = 0;
    for (const section of song.sections) for (const part of section.parts) {
      const mappedKeys = new Set<string>();
      for (const hit of part.hits) {
        const target = PAD_VOICES.includes(hit.instrument) ? hit.instrument : mapping[hit.instrument];
        if (!PAD_VOICES.includes(hit.instrument)) affectedHits++;
        if (!target) continue;
        const key = `${hit.step}:${target}`;
        if (mappedKeys.has(key)) mergedHitCount++;
        mappedKeys.add(key);
      }
    }
    return affectedHits ? [{ song, affectedHits, mergedHitCount }] : [];
  });

  const selectCollection = (id: string) => {
    setCollectionId(id);
    if (!id) return;
    const collection = collections.find(item => item.id === id);
    if (collection) setSelectedIds(collectionSongIds(collection, songs, state).filter(songId => activeSongs.some(song => song.id === songId)));
    setPacks([]);
  };

  const compatibleCopies = () => {
    try {
      const sourcesToAdapt = selectedSongs.filter(song => song.sections.some(section => section.parts.some(part => part.hits.some(hit => !PAD_VOICES.includes(hit.instrument)))));
      const copies = sourcesToAdapt.map(song => ({
        ...structuredClone(song),
        id: crypto.randomUUID(),
        title: `${song.title} · iOS compatible`,
        bundled: false,
        archived: false,
        arrangementLocked: false,
        tags: [...new Set([...song.tags, "ios-compatible"])].slice(0, 12),
        notes: [song.notes, "iOS-compatible practice copy. The source arrangement is preserved separately."].filter(Boolean).join("\n\n").slice(0, 4000),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sections: song.sections.map(section => ({ ...section, parts: section.parts.map(part => substitutePart(part, mapping)) }))
      }));
      save(current => ({ ...current, songs: [...current.songs, ...copies] }));
      setSelectedIds(copies.map(song => song.id));
      setCollectionId("");
      setPacks([]);
      setMessage(`Saved ${copies.length} compatible copy${copies.length === 1 ? "" : "ies"}. Original arrangements were preserved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Choose a supported substitute for every unsupported voice.");
    }
  };

  const preparePacks = () => {
    if (!selectedSongs.length) { setMessage("Choose at least one song to transfer."); return; }
    try {
      const result = splitIntoPacks(selectedSongs);
      setPacks(result);
      setDownloaded([]);
      setMessage(`Prepared ${result.length} reviewed pack${result.length === 1 ? "" : "s"} for ${selectedSongs.length} selected songs. Download each file separately.`);
    } catch (error) {
      setPacks([]);
      setMessage(error instanceof Error ? error.message : "The selected songs could not be split into transfer packs.");
    }
  };

  const downloadPack = (pack: Pack, index: number) => {
    const url = URL.createObjectURL(new Blob([pack.content], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = pack.filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(current => [...new Set([...current, index])]);
  };

  return <section className="song-tool-panel song-transfer-packs" aria-labelledby="song-transfer-heading">
    <h3 id="song-transfer-heading">Web–iOS transfer packs</h3>
    <p>Select songs or start from a collection, review iOS voice compatibility, then prepare numbered JSON packs. Each pack stays under 200 songs and 32 MiB.</p>
    <label>Start from a collection<select value={collectionId} onChange={event => selectCollection(event.target.value)}><option value="">Choose any songs</option>{collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <fieldset><legend>Songs to include · {selectedSongs.length} selected</legend><div className="song-transfer-select-actions"><button type="button" onClick={() => { setSelectedIds(activeSongs.map(song => song.id)); setPacks([]); }}>Select all</button><button type="button" onClick={() => { setSelectedIds([]); setPacks([]); }}>Clear selection</button></div>{activeSongs.map(song => <label key={song.id}><input type="checkbox" checked={selectedIds.includes(song.id)} onChange={event => { setSelectedIds(current => event.target.checked ? [...new Set([...current, song.id])] : current.filter(id => id !== song.id)); setPacks([]); }} />{song.title} · {song.artist}{song.tags.includes("ios-compatible") ? " · compatible copy" : ""}</label>)}</fieldset>
    {unsupportedVoices.length > 0 && <details className="song-transfer-compatibility" open>
      <summary>Guide iOS voice adaptation · {unsupportedVoices.length} unsupported voice{unsupportedVoices.length === 1 ? "" : "s"}</summary>
      <p>Choose how each voice should translate to the five voices supported by iOS. The preview describes the new copy; the original song stays unchanged.</p>
      {unsupportedVoices.map(voice => <label key={voice}>Map {voice}<select value={mapping[voice] ?? ""} onChange={event => { setMapping(current => ({ ...current, [voice]: event.target.value as SongInstrument || undefined })); setPacks([]); }}><option value="">Choose a voice</option>{PAD_VOICES.map(target => <option key={target} value={target}>{target}</option>)}</select></label>)}
      <ul>{adaptationPreview.map(({ song, affectedHits, mergedHitCount }) => <li key={song.id}><strong>{song.title}</strong>: {unsupportedVoices.filter(voice => song.sections.some(section => section.parts.some(part => part.hits.some(hit => hit.instrument === voice)))).map(voice => `${voice} → ${mapping[voice] ?? "choose a voice"}`).join(" · ")}. {affectedHits} hit{affectedHits === 1 ? "" : "s"} remapped{mergedHitCount ? `; ${mergedHitCount} same-step collision${mergedHitCount === 1 ? "" : "s"} will merge` : ""}. Save a compatible copy to keep both arrangements.</li>)}</ul>
      <button type="button" disabled={unsupportedVoices.some(voice => !mapping[voice] || !PAD_VOICES.includes(mapping[voice]!)) || adaptationPreview.length === 0} onClick={compatibleCopies}>Save compatible song copies and select them for transfer</button>
    </details>}
    {unsupportedVoices.length === 0 && selectedSongs.length > 0 && <p>All selected arrangements use voices supported by iOS.</p>}
    <button type="button" disabled={!selectedSongs.length} onClick={preparePacks}>Preview and prepare transfer packs</button>
    {packs.length > 0 && <section className="song-transfer-pack-review" aria-label="Prepared transfer packs"><h4>Pack review · {packs.length} file{packs.length === 1 ? "" : "s"}</h4><ul>{packs.map((pack, index) => <li key={pack.filename}><strong>{pack.filename}</strong> · {pack.songCount} song{pack.songCount === 1 ? "" : "s"} · {(pack.bytes / 1048576).toFixed(2)} MiB <button type="button" onClick={() => downloadPack(pack, index)}>{downloaded.includes(index) ? "Download again" : "Download pack"}</button></li>)}</ul></section>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
