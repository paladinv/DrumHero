"use client";
import { useMemo } from "react";
import { songPartEvidenceFingerprint, type DrumSong, type SongLibraryState } from "@/lib/song-library";
import type { SongPartHit } from "@/lib/types";

type Skill = { id: string; label: string; describe: string; matches: (song: DrumSong, section: DrumSong["sections"][number], hits: SongPartHit[], subdivision: number) => boolean };
const skills: Skill[] = [
  { id: "pocket", label: "Kick and snare pocket", describe: "Backbeats with kick and snare", matches: (_song, _section, hits) => hits.some(hit => hit.instrument === "kick") && hits.some(hit => hit.instrument === "snare") },
  { id: "cymbal-time", label: "Cymbal timekeeping", describe: "Steady hi-hat, open hat, or ride patterns", matches: (_song, _section, hits) => hits.some(hit => ["hihat", "openhat", "ride"].includes(hit.instrument)) },
  { id: "fills", label: "Fills and movement", describe: "Tom movement, fills, and rudiment articulations", matches: (_song, section, hits) => section.kind === "fill" || hits.some(hit => hit.instrument === "tom" || ["flam", "drag", "buzz", "roll"].includes(hit.articulation ?? "")) },
  { id: "dynamics", label: "Dynamics and touch", describe: "Accents, ghost notes, and velocity changes", matches: (_song, _section, hits) => hits.some(hit => hit.accent || hit.ghost || (typeof hit.velocity === "number" && (hit.velocity <= 64 || hit.velocity >= 110))) },
  { id: "sticking", label: "Sticking control", describe: "Parts with annotated right and left hands", matches: (_song, _section, hits) => hits.some(hit => hit.sticking === "R" || hit.sticking === "L") },
  { id: "subdivision", label: "Subdivision and meter", describe: "Triplets, sixteenths, or non-four beat meters", matches: (song, section, _hits, subdivision) => subdivision > 4 || !/^(4|8)\/(4|8)$/.test(section.meter ?? song.meter) }
];
type Candidate = { song: DrumSong; section: DrumSong["sections"][number]; part: DrumSong["sections"][number]["parts"][number]; latestScore?: number; latestAt?: string; recentAverage?: number };

export function SongRepertoireSkillMap({ state, songs, onPractice }: { state: SongLibraryState; songs: DrumSong[]; onPractice: (songId: string, sectionId: string, partId: string, bpm: number) => void }) {
  const map = useMemo(() => skills.map(skill => {
    const candidates: Candidate[] = [];
    for (const song of songs) {
      if (song.archived) continue;
      for (const section of song.sections) for (const part of section.parts) {
        if (!part.hits.length || !skill.matches(song, section, part.hits, part.subdivision)) continue;
        const fingerprint = songPartEvidenceFingerprint(part);
        const attempts = (state.progress.find(progress => progress.songId === song.id && progress.sectionId === section.id)?.attempts ?? [])
          .filter(attempt => attempt.partId === part.id && attempt.completePart !== false && attempt.patternFingerprint === fingerprint && !["self", "unknown"].includes(attempt.inputMode))
          .sort((left, right) => left.playedAt.localeCompare(right.playedAt)).slice(-3);
        const average = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length) : undefined;
        candidates.push({ song, section, part, latestScore: attempts.at(-1)?.score, latestAt: attempts.at(-1)?.playedAt, recentAverage: average });
      }
    }
    const practiced = candidates.filter(candidate => candidate.recentAverage !== undefined);
    const average = practiced.length ? Math.round(practiced.reduce((sum, candidate) => sum + candidate.recentAverage!, 0) / practiced.length) : undefined;
    const weakest = [...candidates].sort((a, b) => (a.recentAverage ?? -1) - (b.recentAverage ?? -1) || (a.song.title.localeCompare(b.song.title)))[0];
    return { skill, candidates, practiced: practiced.length, average, weakest };
  }), [songs, state.progress]);
  const suggestions = map.filter(item => item.candidates.length).sort((a, b) => (a.average ?? -1) - (b.average ?? -1)).slice(0, 6);

  return <section className="song-tool-panel song-repertoire-skill-map" aria-labelledby="song-repertoire-skills-title">
    <h3 id="song-repertoire-skills-title">Repertoire skill map</h3>
    <p>Skills are estimated from your current charts and recent complete scored passes. Scores are grouped across songs; self ratings and edited parts are excluded.</p>
    {suggestions.length ? <div className="song-skill-map-grid">{suggestions.map(({ skill, candidates, practiced, average, weakest }) => <article key={skill.id}>
      <h4>{skill.label}</h4><p>{skill.describe}</p><p><strong>{average === undefined ? "No scored passes yet" : `${average}% recent average`}</strong> · {practiced} of {candidates.length} matching parts practiced</p>
      {weakest && <><p>{weakest.song.title} · {weakest.section.name} · {weakest.part.name}{weakest.latestScore !== undefined ? ` · latest ${weakest.latestScore}%` : " · not practiced yet"}</p><button type="button" onClick={() => onPractice(weakest.song.id, weakest.section.id, weakest.part.id, weakest.latestScore !== undefined ? Math.max(40, weakest.part.bpm) : Math.max(40, Math.round(weakest.part.bpm * 0.75)))}>{weakest.latestScore === undefined ? "Start suggested part" : "Practice weakest part"}</button></>}
    </article>)}</div> : <p>Add parts with hits, dynamics, sticking, and varied subdivisions to see skill areas across your repertoire.</p>}
  </section>;
}
