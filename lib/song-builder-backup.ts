import { normalizeSong } from './song-library';
import type { SongBuilderSettings } from './song-builder-settings';
import { normalizeSongBuilderSettings } from './song-builder-settings';
import { readBuilderBacking, readBuilderTakes, readBuilderVersions, saveBuilderBacking, saveBuilderTake, saveBuilderVersion, type BuilderBacking } from './song-builder-storage';
import type { BuilderTake } from './song-builder-editing';

export type BuilderArchive = {
  settings: SongBuilderSettings;
  swing: number;
  backing?: Omit<BuilderBacking, 'blob'> & { type: string; base64: string };
  takes: BuilderTake[];
  versions: Array<{ label: string; kind: 'autosave' | 'named'; createdAt?: string; song: unknown }>;
};
export async function packBuilderWorkspace(songId: string, settings: SongBuilderSettings, swing: number): Promise<BuilderArchive> {
  const [backing, takes, versions] = await Promise.all([readBuilderBacking(songId), readBuilderTakes(songId), readBuilderVersions(songId)]);
  let embedded: BuilderArchive['backing'];
  if (backing) {
    const bytes = new Uint8Array(await backing.blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    const { blob, ...metadata } = backing;
    embedded = { ...metadata, type: blob.type, base64: btoa(binary) };
  }
  return { settings: structuredClone(settings), swing, backing: embedded, takes, versions: versions.map(({ label, kind, createdAt, song }) => ({ label, kind, createdAt, song })) };
}
export function readBuilderArchive(input: unknown): BuilderArchive | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object') throw new Error('Invalid workspace backup.');
  const value = input as BuilderArchive;
  if (!Array.isArray(value.takes) || value.takes.length > 10 || !Array.isArray(value.versions) || value.versions.length > 32) throw new Error('Invalid recovery data.');
  const takes = value.takes.map(take => {
    if (!take || typeof take.name !== 'string' || !['overdub', 'replace'].includes(take.mode) || !Array.isArray(take.hits) || take.hits.length > 20000 || !Array.isArray(take.targets) || take.targets.length > 8192 || !take.targets.every(t => t && typeof t.sectionId === 'string' && typeof t.partId === 'string') || !take.hits.every(h => h && typeof h.sectionId === 'string' && typeof h.partId === 'string' && ['kick','snare','hihat','openhat','tom','crash','ride','rimshot','cowbell','shaker','tambourine','custom1','custom2','custom3','custom4','custom5','custom6','custom7','custom8'].includes(h.instrument) && Number.isFinite(h.step) && h.step >= 0 && Number.isFinite(h.bpm) && h.bpm >= 40 && h.bpm <= 200 && Number.isFinite(h.velocity) && h.velocity >= 1 && h.velocity <= 127 && Number.isFinite(h.atMs) && (h.subdivision === undefined || [4,8,12,16,20].includes(h.subdivision)))) throw new Error('Invalid recorded take.');
    return { ...take, name: take.name.slice(0,100), createdAt: typeof take.createdAt === 'string' ? take.createdAt : new Date().toISOString() };
  });
  const versions = value.versions.map(v => {
    const song = normalizeSong(v?.song);
    if (!song || typeof v.label !== 'string' || !['autosave','named'].includes(v.kind)) throw new Error('Invalid saved version.');
    return { label: v.label.slice(0,60), kind: v.kind, createdAt: typeof v.createdAt === "string" && Number.isFinite(Date.parse(v.createdAt)) ? v.createdAt : undefined, song };
  });
  const b = value.backing;
  if (b && (typeof b.name !== 'string' || typeof b.type !== 'string' || !b.type.startsWith('audio/') || typeof b.base64 !== 'string' || b.base64.length > 84 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64) || b.base64.length % 4 !== 0 || !Number.isFinite(b.duration) || b.duration <= 0 || !Number.isFinite(b.downbeat) || b.downbeat < -30 || b.downbeat > b.duration || !Number.isFinite(b.volume) || b.volume < 0 || b.volume > 1 || !Array.isArray(b.peaks) || b.peaks.length > 600 || !b.peaks.every(p => Number.isFinite(p) && p >= 0 && p <= 1))) throw new Error('Invalid backing audio.');
  return { settings: normalizeSongBuilderSettings(value.settings), swing: Number.isFinite(value.swing) ? Math.max(50, Math.min(75,value.swing)) : 50, takes, versions, backing: b };
}
export async function unpackBuilderWorkspace(songId: string, archive: BuilderArchive) {
  if (archive.backing) {
    const { base64, type, ...metadata } = archive.backing;
    const binary = atob(base64), bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    await saveBuilderBacking({ ...metadata, id: songId, songId, stemId: 'main', blob: new Blob([bytes], { type }) }, true);
  }
  for (const take of archive.takes) await saveBuilderTake({ ...take, id: crypto.randomUUID(), songId });
  for (const version of [...archive.versions].reverse()) {
    const song = normalizeSong(version.song);
    if (song) await saveBuilderVersion({ ...song, id: songId, bundled: false }, version.label, version.kind, version.createdAt);
  }
}
