"use client";

import { useState } from "react";
import { verifyOfflineCache } from "@/lib/song-offline-check";
import { setlistEntries } from "@/lib/song-library-next";
import type { DrumSong, Setlist, SongLibraryState } from "@/lib/song-library";
import { loadTake } from "@/lib/song-recording";

type Check = { label: string; status: "ready" | "attention" | "blocked"; detail: string };
type Report = { signature: string; checkedAt: string; checks: Check[] };

function signatureFor(state: SongLibraryState, songs: DrumSong[], plan: Setlist) {
  const ids = new Set(setlistEntries(plan).map((entry) => entry.songId));
  return JSON.stringify([
    plan.id,
    plan.kitProfileId,
    state.kitProfiles?.find(profile => profile.id === plan.kitProfileId),
    setlistEntries(plan),
    songs.filter((song) => ids.has(song.id)).map((song) => [song.id, song.updatedAt, song.sections.map((section) => [section.id, section.parts.map((part) => [part.id, part.hits.length])])]),
    state.notes.filter((note) => ids.has(note.songId)).map((note) => [note.id, note.kind, note.sectionId, note.bar, note.url, note.text]),
    (state.referenceTracks ?? []).filter((track) => ids.has(track.songId)).map((track) => [track.id, track.songId, track.sectionId, track.name, track.createdAt, track.durationMs, track.sectionStartMs, track.sectionEndMs])
  ]);
}

export function SongSetlistOfflinePreflight({ state, songs, plan }: { state: SongLibraryState; songs: DrumSong[]; plan: Setlist }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const currentSignature = signatureFor(state, songs, plan);
  const currentReport = report?.signature === currentSignature ? report : null;

  const runPreflight = async () => {
    setBusy(true);
    const checks: Check[] = [];
    const entries = setlistEntries(plan);
    const includedSongIds = new Set(entries.map((entry) => entry.songId));
    let availableEntries = 0;
    let playableCharts = 0;
    let brokenEntries = 0;

    for (const entry of entries) {
      const song = songs.find((candidate) => candidate.id === entry.songId);
      if (!song) {
        brokenEntries++;
        checks.push({ label: `Setlist entry ${entry.id}`, status: "blocked", detail: "Song is missing from this device’s library." });
        continue;
      }
      const sections = entry.sectionId ? song.sections.filter((section) => section.id === entry.sectionId) : song.sections;
      if (!sections.length) {
        brokenEntries++;
        checks.push({ label: song.title, status: "blocked", detail: "The selected section is no longer in this arrangement." });
        continue;
      }
      const selectedPartExists = !entry.partId || sections.some((section) => section.parts.some((part) => part.id === entry.partId));
      if (!selectedPartExists) {
        brokenEntries++;
        checks.push({ label: song.title, status: "blocked", detail: "The selected drum part is no longer in this section." });
        continue;
      }
      availableEntries++;
      const arrangedParts = sections.flatMap((section) => section.parts.filter((part) => !entry.partId || part.id === entry.partId).filter((part) => part.hits.length && (!section.clips || section.clips.some((clip) => clip.partId === part.id))));
      if (arrangedParts.length) playableCharts++;
      checks.push({
        label: song.title,
        status: arrangedParts.length ? "ready" : "attention",
        detail: arrangedParts.length ? `${sections.length} selected section${sections.length === 1 ? "" : "s"} and ${arrangedParts.length} playable chart part${arrangedParts.length === 1 ? "" : "s"} are present locally.` : "The selected section has no playable arranged hits; review its chart before the performance."
      });
    }
    if (!entries.length) checks.push({ label: "Setlist contents", status: "blocked", detail: "This setlist has no entries." });

    if (!plan.kitProfileId) {
      checks.push({ label: "Kit setup profile", status: "attention", detail: "No kit profile is assigned. Confirm the physical kit and MIDI pad map before the show." });
    } else {
      const profile = state.kitProfiles?.find(item => item.id === plan.kitProfileId);
      if (!profile) checks.push({ label: "Kit setup profile", status: "blocked", detail: "The assigned kit profile is missing from this device. Choose an available profile or clear the assignment." });
      else {
        const requiredVoices = [...new Set(entries.flatMap(entry => {
          const song = songs.find(item => item.id === entry.songId);
          const sections = song?.sections.filter(section => !entry.sectionId || section.id === entry.sectionId) ?? [];
          return sections.flatMap(section => section.parts.filter(part => !entry.partId || part.id === entry.partId).flatMap(part => part.hits.map(hit => hit.instrument)));
        }))];
        const unavailable = requiredVoices.filter(voice => !profile.availableVoices.includes(voice));
        const unmapped = requiredVoices.filter(voice => profile.midiNotes[voice] === undefined);
        checks.push({
          label: "Kit setup profile",
          status: unavailable.length ? "attention" : unmapped.length ? "attention" : "ready",
          detail: unavailable.length || unmapped.length
            ? profile.name + " · unavailable voices: " + (unavailable.join(", ") || "none") + " · missing MIDI notes: " + (unmapped.join(", ") || "none") + "."
            : profile.name + " covers all " + requiredVoices.length + " charted voices with MIDI note assignments."
        });
      }
    }

    const cues = state.notes.filter((note) => includedSongIds.has(note.songId) && note.kind === "stage-cue");
    const staleCues = cues.filter((note) => {
      if (!note.sectionId) return false;
      const song = songs.find((candidate) => candidate.id === note.songId);
      return !song?.sections.some((section) => section.id === note.sectionId);
    });
    checks.push({
      label: "Stage cues",
      status: staleCues.length ? "attention" : "ready",
      detail: staleCues.length ? `${cues.length - staleCues.length} cue${cues.length - staleCues.length === 1 ? "" : "s"} available; ${staleCues.length} cue${staleCues.length === 1 ? " points to" : "s point to"} a removed section.` : `${cues.length} saved stage cue${cues.length === 1 ? "" : "s"} available in local library data.`
    });

    const referenceTracks = (state.referenceTracks ?? []).filter((track) => includedSongIds.has(track.songId));
    let missingAudio = 0;
    let unavailableAudioStorage = false;
    for (const track of referenceTracks) {
      try {
        const blob = await loadTake(track.id);
        if (!blob) missingAudio++;
        if (track.sectionId) {
          const song = songs.find((candidate) => candidate.id === track.songId);
          if (!song?.sections.some((section) => section.id === track.sectionId)) missingAudio++;
        }
      } catch {
        unavailableAudioStorage = true;
        break;
      }
    }
    checks.push({
      label: "Local reference audio",
      status: unavailableAudioStorage || missingAudio ? "attention" : "ready",
      detail: unavailableAudioStorage
        ? "The browser could not read local audio storage. Reopen this check after confirming local audio storage is available."
        : missingAudio
          ? `${referenceTracks.length} reference track${referenceTracks.length === 1 ? "" : "s"} listed; ${missingAudio} audio file or section link is missing.`
          : referenceTracks.length ? `${referenceTracks.length} linked local reference track${referenceTracks.length === 1 ? "" : "s"} and their audio files are available.` : "No local reference audio is linked to these songs." 
    });

    const externalReferences = state.notes.filter((note) => includedSongIds.has(note.songId) && note.kind === "reference" && /^https?:\/\//i.test(note.url ?? ""));
    if (externalReferences.length) checks.push({ label: "External reference links", status: "attention", detail: `${externalReferences.length} web reference link${externalReferences.length === 1 ? "" : "s"} may need an internet connection.` });

    try {
      if (typeof caches === "undefined") throw new Error("This browser does not provide offline page storage.");
      const meta = await caches.open("drum-hero-song-offline-meta");
      const response = await meta.match("/song-offline-status");
      if (!response) throw new Error("No offline app download is saved on this device.");
      const status = await response.json() as { name?: string; version?: string; routes?: string[] };
      if (!status.name || !status.routes?.includes("/song-library")) throw new Error("The saved offline download does not include the Song Library page.");
      const cache = await caches.open(status.name);
      if (!await cache.match("/song-library")) throw new Error("The Song Library page is missing from the saved offline download.");
      const verification = await verifyOfflineCache();
      const damaged = verification.missing.length + verification.corrupt.length;
      checks.push({
        label: "Offline app and chart page",
        status: damaged ? "attention" : "ready",
        detail: damaged
          ? `Song Library page is cached in build ${status.version ?? "unknown"}, but ${verification.missing.length} asset${verification.missing.length === 1 ? "" : "s"} are missing and ${verification.corrupt.length} are corrupt. Open Library tools → Offline app download and storage to update it.`
          : `Song Library page and all ${verification.checked} downloaded app resources passed their integrity check (build ${status.version ?? "unknown"}).`
      });
    } catch (error) {
      checks.push({ label: "Offline app and chart page", status: "blocked", detail: `${error instanceof Error ? error.message : "Offline page verification failed."} Open Library tools → Offline app download and storage while online to prepare it.` });
    }

    if (brokenEntries) checks.push({ label: "Setlist links", status: "blocked", detail: `${brokenEntries} setlist entr${brokenEntries === 1 ? "y refers" : "ies refer"} to missing songs, sections, or parts.` });
    else checks.push({ label: "Setlist links", status: "ready", detail: `${availableEntries} of ${entries.length} entries resolve to local song data; ${playableCharts} contain playable chart material.` });

    setReport({ signature: currentSignature, checkedAt: new Date().toISOString(), checks });
    setBusy(false);
  };

  const blockingCount = currentReport?.checks.filter((check) => check.status === "blocked").length ?? 0;
  const attentionCount = currentReport?.checks.filter((check) => check.status === "attention").length ?? 0;
  return <section className="song-setlist-preflight" aria-labelledby="song-setlist-preflight-title">
    <h4 id="song-setlist-preflight-title">Offline setlist preflight</h4>
    <p>Checks this setlist’s songs, sections, charts, stage cues, local reference audio, and the saved Song Library page on this device. It does not copy or upload audio.</p>
    <button type="button" disabled={busy} onClick={() => void runPreflight()}>{busy ? "Checking this device…" : "Check setlist offline readiness"}</button>
    {currentReport && <>
      <p role="status">Checked {new Date(currentReport.checkedAt).toLocaleString()} · {blockingCount ? `${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"}` : "no blocking issues"} · {attentionCount} item{attentionCount === 1 ? " needs" : "s need"} attention.</p>
      <ul>{currentReport.checks.map((check, index) => <li key={`${check.label}:${index}`}><strong>{check.status === "ready" ? "Ready" : check.status === "blocked" ? "Fix before show" : "Review"} · {check.label}</strong><p>{check.detail}</p></li>)}</ul>
    </>}
    {report && !currentReport && <p role="status">The setlist or its local arrangements changed since this report. Run the preflight again.</p>}
  </section>;
}

