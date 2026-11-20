import { songPartVersionFingerprint, type DrumSong, type SongRightsReview } from "./song-library";

export const SONG_RIGHTS_CHECKS = [
  ["sourceIdentified", "The source or rights holder is identified."],
  ["attributionConfirmed", "The attribution is complete and accurate."],
  ["permissionConfirmed", "I have a documented basis to use this material."],
  ["redistributionConfirmed", "That permission allows the sharing or export I plan to make."]
] as const;

export function songRightsSourceSignature(song: Pick<DrumSong, "source" | "title" | "artist" | "bpm" | "meter" | "voiceLabels" | "arrangementAutomation" | "referenceTempoMap" | "sections">): string {
  const source = song.source;
  const arrangement = song.sections.map(section => ({ id: section.id, bpm: section.bpm ?? null, meter: section.meter ?? "", feel: section.feel ?? null, playbackFeel: section.playbackFeel ?? null, tempoRamp: section.tempoRamp ?? null, tempoPoints: section.tempoPoints ?? [], automation: section.automation ?? null, pickupBeats: section.pickupBeats ?? 0, parts: section.parts.map(part => songPartVersionFingerprint(part, section)) }));
  const serialized = JSON.stringify([source?.url?.trim() ?? "", source?.title?.trim() ?? "", source?.attribution?.trim() ?? "", source?.authorization?.trim() ?? "", song.title, song.artist, song.bpm, song.meter, song.voiceLabels ?? {}, song.arrangementAutomation ?? [], song.referenceTempoMap ?? [], arrangement]);
  let first = 2166136261, second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) { first = Math.imul(first ^ serialized.charCodeAt(index), 16777619); second = Math.imul(second ^ serialized.charCodeAt(index), 2246822507); }
  return `${serialized.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function songRightsReviewCurrent(song: DrumSong): boolean {
  const review = song.rightsReview;
  return !!review && review.sourceSignature === songRightsSourceSignature(song) && Object.values(review.checks).every(Boolean) && !!song.source?.attribution.trim() && !!song.source?.authorization.trim() && !!(song.source?.title.trim() || song.source?.url.trim());
}

export function makeSongRightsReview(song: DrumSong, checks: SongRightsReview["checks"], at = new Date()): SongRightsReview {
  return { reviewedAt: at.toISOString(), sourceSignature: songRightsSourceSignature(song), checks: { ...checks } };
}
