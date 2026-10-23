"use client";

import Link from "next/link";
import { useState } from "react";
import type { DrumSong, SongLibraryState } from "@/lib/song-library";
import { listStoredAudio } from "@/lib/audio-storage";
import { loadTake } from "@/lib/song-recording";
import { readSongLibraryBackupAt } from "@/lib/song-library-health";

type Attachment = { id: string; songId: string; sectionId?: string; name: string; kind: "recording" | "reference" };
type HealthResult = {
  checkedAt: string;
  storage: string;
  missing: Attachment[];
  stale: Array<{ title: string; songId?: string; reason: string }>;
  large: Array<{ id: string; label: string; bytes: number; songId?: string }>;
  orphanedCount: number;
  audioReadError: boolean;
  backupAt: string | null;
  backupAgeDays: number | null;
};

const LARGE_AUDIO_BYTES = 20 * 1024 * 1024;
const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(bytes / 1024))} KiB`;

export function SongLibraryHealth({ state, songs, onExportBackup, onOpenSong }: {
  state: SongLibraryState;
  songs: DrumSong[];
  onExportBackup: () => void;
  onOpenSong: (songId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [message, setMessage] = useState("");

  const checkLibrary = async () => {
    setBusy(true);
    setMessage("");
    const attachments: Attachment[] = [
      ...state.recordings.map((item) => ({ id: item.id, songId: item.songId, sectionId: item.sectionId, name: item.name || "Song take", kind: "recording" as const })),
      ...(state.referenceTracks ?? []).map((item) => ({ id: item.id, songId: item.songId, sectionId: item.sectionId, name: item.name, kind: "reference" as const }))
    ];
    const uniqueAttachments = [...new Map(attachments.map((item) => [item.id, item])).values()];
    const songById = new Map(songs.map((song) => [song.id, song]));
    const stale: HealthResult["stale"] = [];
    for (const attachment of attachments) {
      const song = songById.get(attachment.songId);
      if (!song) stale.push({ title: attachment.name, songId: attachment.songId, reason: "Audio metadata points to a song that is not in this library." });
      else if (attachment.sectionId && !song.sections.some((section) => section.id === attachment.sectionId)) stale.push({ title: attachment.name, songId: song.id, reason: "Audio metadata points to a section that has been removed." });
    }
    for (const note of state.notes.filter((item) => item.sectionId && (item.kind === "reference" || item.kind === "stage-cue"))) {
      const song = songById.get(note.songId);
      if (!song?.sections.some((section) => section.id === note.sectionId)) stale.push({ title: note.text.slice(0, 80) || "Song note", songId: song?.id, reason: "A saved reference or stage cue points to a missing section." });
    }

    const missing: Attachment[] = [];
    let audioReadError = false;
    for (const attachment of uniqueAttachments) {
      try {
        const blob = await loadTake(attachment.id);
        if (!blob) missing.push(attachment);
      } catch {
        audioReadError = true;
        break;
      }
    }

    let audioRows: Awaited<ReturnType<typeof listStoredAudio>> = [];
    try { audioRows = await listStoredAudio(); } catch { audioReadError = true; }
    const knownIds = new Set(uniqueAttachments.map((item) => item.id));
    const songRows = audioRows.filter((item) => item.kind === "song");
    const orphanedCount = songRows.filter((item) => !knownIds.has(item.id)).length;
    const attachmentById = new Map(uniqueAttachments.map((item) => [item.id, item]));
    const large = songRows.filter((item) => item.bytes >= LARGE_AUDIO_BYTES).map((item) => ({
      id: item.id,
      label: attachmentById.get(item.id)?.name ?? item.label,
      bytes: item.bytes,
      songId: attachmentById.get(item.id)?.songId
    }));

    let storage = "Browser storage estimate is unavailable.";
    try {
      const estimate = await navigator.storage?.estimate();
      if (estimate?.usage !== undefined) storage = `${formatBytes(estimate.usage)} used by this site${estimate.quota ? ` of ${formatBytes(estimate.quota)} estimated browser storage` : ""}. This includes other Drum Hero data and the offline page cache.`;
    } catch { /* Storage estimates are optional browser data. */ }

    const checkedAt = new Date();
    const backupAt = readSongLibraryBackupAt();
    const backupAgeDays = backupAt ? Math.max(0, Math.floor((checkedAt.getTime() - Date.parse(backupAt)) / 86400000)) : null;
    setResult({ checkedAt: checkedAt.toISOString(), storage, missing, stale, large, orphanedCount, audioReadError, backupAt, backupAgeDays });
    setBusy(false);
  };

  return <details className="song-tool-panel song-library-health">
    <summary>Song Library health</summary>
    <p>Check local audio attachments, stale song and section links, large files, orphaned audio, site storage, and the last library backup recorded by this version.</p>
    <button type="button" disabled={busy} onClick={() => void checkLibrary()}>{busy ? "Checking local library…" : "Check library health"}</button>
    {message && <p role="status">{message}</p>}
    {result && <>
      <p role="status">Checked {new Date(result.checkedAt).toLocaleString()} · {result.missing.length} missing attachment{result.missing.length === 1 ? "" : "s"} · {result.stale.length} stale link{result.stale.length === 1 ? "" : "s"} · {result.large.length} large audio item{result.large.length === 1 ? "" : "s"} · {result.orphanedCount} unlinked file{result.orphanedCount === 1 ? "" : "s"}.</p>
      <p>{result.storage}</p>
      {result.audioReadError && <p role="status">Some local audio storage could not be read. Retry after closing other audio tools or checking browser storage access.</p>}
      <section><h4>Backup status</h4>
        {result.backupAt && result.backupAgeDays !== null && result.backupAgeDays <= 30
          ? <p>Last library backup recorded {new Date(result.backupAt).toLocaleString()} ({result.backupAgeDays} day{result.backupAgeDays === 1 ? "" : "s"} ago).</p>
          : <p>{result.backupAt ? `The last recorded library backup is ${result.backupAgeDays} days old.` : "No library backup has been recorded by this version of the app."} Export a fresh backup for important arrangements.</p>}
        <button type="button" onClick={() => { onExportBackup(); setMessage("Library backup export started."); }}>Export library backup now</button>
      </section>
      {result.missing.length > 0 && <section><h4>Missing audio attachments</h4><ul>{result.missing.map((item) => <li key={`${item.kind}:${item.id}`}>{item.name} · {item.kind}{songByLabel(songs, item.songId) && ` · ${songByLabel(songs, item.songId)}`} {songByLabel(songs, item.songId) && <button type="button" onClick={() => onOpenSong(item.songId)}>Select song</button>}</li>)}</ul></section>}
      {result.stale.length > 0 && <section><h4>Stale references</h4><ul>{result.stale.map((item, index) => <li key={`${item.title}:${index}`}>{item.title}: {item.reason} {item.songId && songByLabel(songs, item.songId) && <button type="button" onClick={() => onOpenSong(item.songId!)}>Open song</button>}</li>)}</ul></section>}
      {result.large.length > 0 && <section><h4>Large local audio · 20 MiB or more</h4><ul>{result.large.map((item) => <li key={item.id}>{item.label} · {formatBytes(item.bytes)} {item.songId && <button type="button" onClick={() => onOpenSong(item.songId!)}>Select song</button>}</li>)}</ul><p>Export originals before deleting audio. The site storage estimate includes all local Drum Hero data.</p></section>}
      {result.orphanedCount > 0 && <p>{result.orphanedCount} local Song Library audio file{result.orphanedCount === 1 ? " has" : "s have"} no matching recording or reference metadata. Review it in <Link href="/progress#local-audio-storage">Manage local audio storage</Link> before deleting.</p>}
      {!result.missing.length && !result.stale.length && !result.large.length && !result.orphanedCount && !result.audioReadError && <p>No missing attachments, stale audio links, unusually large audio files, or unlinked Song Library audio were found.</p>}
    </>}
  </details>;
}

function songByLabel(songs: DrumSong[], songId: string) { return songs.find((song) => song.id === songId)?.title ?? ""; }
