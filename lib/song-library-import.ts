import { normalizeSong, type DrumSong } from "./song-library";
import { readSongProjectFile, type SongBuilderProjectFile } from "./song-builder-project";
export type SongImportReview = { song: DrumSong; project?: SongBuilderProjectFile };
export function parseLibrarySongImport(text: string): SongImportReview {
  if (text.length > 40 * 1024 * 1024) throw new Error("Song files must be 40 MB or smaller.");
  let parsed: { format?: string; song?: unknown };
  try { parsed = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
  if (!parsed || typeof parsed !== "object") throw new Error("Choose a Drum Hero song export or Song Builder project.");
  if (parsed.format === "drum-hero-song") { const project = readSongProjectFile(parsed); if (!project) throw new Error("The Song Builder project or its audio samples are invalid."); return { song: project.song, project }; }
  if (parsed.format !== "drum-hero-song-v1") throw new Error("Choose a Drum Hero song export or Song Builder project. Library backups belong in Backup and sync.");
  const song = normalizeSong(parsed.song);
  if (!song) throw new Error("This song has missing metadata or invalid drum parts.");
  return { song: { ...song, id: crypto.randomUUID(), bundled: false } };
}
export function songImportChanges(existing: DrumSong, incoming: DrumSong) {
  const changes: string[] = [];
  for (const section of incoming.sections) { const old = existing.sections.find((item) => item.name.toLowerCase() === section.name.toLowerCase()); if (!old) changes.push(`Add section: ${section.name}`); else if (JSON.stringify(old.parts.map((part) => ({ ...part, id: "" }))) !== JSON.stringify(section.parts.map((part) => ({ ...part, id: "" })))) changes.push(`Update drum parts: ${section.name}`); }
  for (const section of existing.sections) if (!incoming.sections.some((item) => item.name.toLowerCase() === section.name.toLowerCase())) changes.push(`Remove section: ${section.name}`);
  if (existing.bpm !== incoming.bpm || existing.meter !== incoming.meter) changes.push("Change song tempo or meter");
  return changes.length ? changes : ["Song metadata or notes will be updated"];
}
export function replaceImportedSong(existing: DrumSong, incoming: DrumSong): DrumSong {
  const sections = incoming.sections.map((section) => { const previous = existing.sections.find((item) => item.name.toLowerCase() === section.name.toLowerCase()); if (!previous) return section; const ids = new Map<string, string>(); const parts = section.parts.map((part) => { const old = previous.parts.find((item) => item.name.toLowerCase() === part.name.toLowerCase()); ids.set(part.id, old?.id ?? part.id); return { ...part, id: old?.id ?? part.id }; }); return { ...section, id: previous.id, parts, clips: section.clips?.map((clip) => ({ ...clip, partId: ids.get(clip.partId) ?? clip.partId, repeatVariants: clip.repeatVariants?.map(variant=>({...variant,partId:ids.get(variant.partId)??variant.partId})) })) }; });
  return { ...incoming, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString(), bundled: false, sections };
}

export function detailedImportChanges(existing:DrumSong,incoming:DrumSong){
 const clean=(value:unknown):unknown=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['id','createdAt','updatedAt','bundled'].includes(key)).map(([key,item])=>[key,clean(item)])):value;
 const changes:Array<{path:string;before:unknown;after:unknown}>=[];
 const walk=(before:unknown,after:unknown,path:string)=>{if(JSON.stringify(before)===JSON.stringify(after))return;if(before&&after&&typeof before==='object'&&typeof after==='object'&&Array.isArray(before)===Array.isArray(after)){const a=before as Record<string,unknown>,b=after as Record<string,unknown>;for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[key],b[key],path?`${path}.${key}`:key);}else changes.push({path,before,after});};walk(clean(existing),clean(incoming),'song');return changes;
}
