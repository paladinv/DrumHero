import type { BuilderBacking } from "./song-builder-storage";

export type PlayAlongStyle = "rock" | "funk" | "shuffle";
export type PlayAlongSection = "verse" | "chorus" | "bridge" | "break";
export type PlayAlongSectionChoice = PlayAlongSection | "full-form";
export type PlayAlongMix = {
  synthesized: boolean;
  bass: boolean;
  harmony: boolean;
  shaker: boolean;
  click: boolean;
  fill: boolean;
};
export type PlayAlongPart = { section: PlayAlongSection; bars: number; bpm?: number };
export type PortablePlayAlongStem = {
  name: string;
  blob: Blob;
  duration: number;
  downbeat: number;
  volume: number;
  bpm?: number;
  source?: string;
  rights?: string;
};
export type PortablePlayAlongProject = {
  name: string;
  style: PlayAlongStyle;
  section: PlayAlongSectionChoice;
  bpm: number;
  stemTempo: number;
  mix: PlayAlongMix;
  form: PlayAlongPart[];
  stems: PortablePlayAlongStem[];
};

const MAGIC = new TextEncoder().encode("DRUMHERO-PLAYALONG\n");
const MAX_HEADER_BYTES = 1_000_000;
const MAX_TRACK_BYTES = 60 * 1024 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;
const MAX_PACKAGE_BYTES = MAX_TOTAL_BYTES + MAX_HEADER_BYTES + MAGIC.length + 4;
const styles = new Set<PlayAlongStyle>(["rock", "funk", "shuffle"]);
const sections = new Set<PlayAlongSection>(["verse", "chorus", "bridge", "break"]);
const sectionChoices = new Set<PlayAlongSectionChoice>([...sections, "full-form"]);
const mixKeys: Array<keyof PlayAlongMix> = ["synthesized", "bass", "harmony", "shaker", "click", "fill"];

function validateMix(value: unknown): PlayAlongMix {
  if (!value || typeof value !== "object" || mixKeys.some((key) => typeof (value as Record<string, unknown>)[key] !== "boolean")) {
    throw new Error("This Play-Along package has invalid mix settings.");
  }
  return Object.fromEntries(mixKeys.map((key) => [key, (value as Record<string, boolean>)[key]])) as PlayAlongMix;
}

function validateForm(value: unknown): PlayAlongPart[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) throw new Error("This Play-Along package has an invalid arrangement form.");
  const form = value.map((item): PlayAlongPart => {
    if (!item || typeof item !== "object") throw new Error("This Play-Along package has an invalid arrangement part.");
    const part = item as Record<string, unknown>;
    if (typeof part.section !== "string" || !sections.has(part.section as PlayAlongSection)
      || !Number.isInteger(part.bars) || Number(part.bars) < 1 || Number(part.bars) > 16
      || (part.bpm !== undefined && (!Number.isInteger(part.bpm) || Number(part.bpm) < 55 || Number(part.bpm) > 160))) {
      throw new Error("This Play-Along package has an invalid arrangement part.");
    }
    return { section: part.section as PlayAlongSection, bars: Number(part.bars), ...(part.bpm === undefined ? {} : { bpm: Number(part.bpm) }) };
  });
  if (form.reduce((total, part) => total + part.bars, 0) > 64) throw new Error("This Play-Along package exceeds the 64-bar arrangement limit.");
  return form;
}

function validateProjectHeader(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("This file is not a Drum Hero Play-Along package.");
  const header = value as Record<string, unknown>;
  if (header.application !== "Drum Hero" || header.format !== "drum-hero-playalong-package" || header.version !== 1) {
    throw new Error("This Drum Hero Play-Along package version is not supported.");
  }
  if (typeof header.name !== "string" || !header.name.trim() || header.name.length > 60
    || typeof header.style !== "string" || !styles.has(header.style as PlayAlongStyle)
    || typeof header.section !== "string" || !sectionChoices.has(header.section as PlayAlongSectionChoice)
    || !Number.isInteger(header.bpm) || Number(header.bpm) < 55 || Number(header.bpm) > 160
    || !Number.isInteger(header.stemTempo) || Number(header.stemTempo) < 40 || Number(header.stemTempo) > 200
    || typeof header.createdAt !== "string" || !Number.isFinite(Date.parse(header.createdAt))) {
    throw new Error("This Play-Along package has invalid project settings.");
  }
  if (!Array.isArray(header.stems) || header.stems.length > 6) throw new Error("This Play-Along package can contain up to six audio stems.");
  const form = validateForm(header.form);
  const mix = validateMix(header.mix);
  let audioBytes = 0;
  const stems = header.stems.map((item): Omit<PortablePlayAlongStem, "blob"> & { size: number; mimeType: string } => {
    if (!item || typeof item !== "object") throw new Error("This Play-Along package contains invalid stem details.");
    const stem = item as Record<string, unknown>;
    if (typeof stem.name !== "string" || !stem.name.trim() || stem.name.length > 120
      || typeof stem.mimeType !== "string" || !stem.mimeType.startsWith("audio/") || stem.mimeType.length > 100
      || !Number.isInteger(stem.size) || Number(stem.size) < 1 || Number(stem.size) > MAX_TRACK_BYTES
      || !Number.isFinite(stem.duration) || Number(stem.duration) <= 0
      || !Number.isFinite(stem.downbeat) || Number(stem.downbeat) < -30 || Number(stem.downbeat) > Number(stem.duration)
      || !Number.isFinite(stem.volume) || Number(stem.volume) < 0 || Number(stem.volume) > 1
      || (stem.bpm !== undefined && (!Number.isInteger(stem.bpm) || Number(stem.bpm) < 40 || Number(stem.bpm) > 200))
      || (stem.source !== undefined && (typeof stem.source !== "string" || stem.source.length > 180))
      || (stem.rights !== undefined && (typeof stem.rights !== "string" || stem.rights.length > 180))) {
      throw new Error("This Play-Along package contains invalid stem metadata.");
    }
    audioBytes += Number(stem.size);
    if (audioBytes > MAX_TOTAL_BYTES) throw new Error("This Play-Along package exceeds the 120 MB audio limit.");
    return {
      name: stem.name,
      mimeType: stem.mimeType,
      size: Number(stem.size),
      duration: Number(stem.duration),
      downbeat: Number(stem.downbeat),
      volume: Number(stem.volume),
      ...(stem.bpm === undefined ? {} : { bpm: Number(stem.bpm) }),
      ...(typeof stem.source === "string" ? { source: stem.source } : {}),
      ...(typeof stem.rights === "string" ? { rights: stem.rights } : {}),
    };
  });
  return {
    name: header.name.trim(),
    style: header.style as PlayAlongStyle,
    section: header.section as PlayAlongSectionChoice,
    bpm: Number(header.bpm),
    stemTempo: Number(header.stemTempo),
    mix,
    form,
    stems,
  };
}

export function createPlayAlongPackage(project: PortablePlayAlongProject): Blob {
  if (project.stems.length > 6) throw new Error("A Play-Along package can contain up to six audio stems.");
  const header = {
    application: "Drum Hero",
    format: "drum-hero-playalong-package",
    version: 1,
    createdAt: new Date().toISOString(),
    name: project.name.trim().slice(0, 60) || "My Play-Along",
    style: project.style,
    section: project.section,
    bpm: project.bpm,
    stemTempo: project.stemTempo,
    mix: project.mix,
    form: project.form.map(({ section, bars, bpm }) => ({ section, bars, ...(bpm === undefined ? {} : { bpm }) })),
    stems: project.stems.map((stem) => ({
      name: stem.name,
      mimeType: stem.blob.type || "audio/octet-stream",
      size: stem.blob.size,
      duration: stem.duration,
      downbeat: stem.downbeat,
      volume: stem.volume,
      ...(stem.bpm === undefined ? {} : { bpm: stem.bpm }),
      ...(stem.source === undefined ? {} : { source: stem.source }),
      ...(stem.rights === undefined ? {} : { rights: stem.rights }),
    })),
  };
  const validated = validateProjectHeader(header);
  const headerBytes = new TextEncoder().encode(JSON.stringify({ ...header, name: validated.name }));
  if (headerBytes.byteLength > MAX_HEADER_BYTES) throw new Error("Play-Along project details are too large to export.");
  const headerLength = new Uint8Array(4);
  new DataView(headerLength.buffer).setUint32(0, headerBytes.byteLength, false);
  const totalBytes = project.stems.reduce((total, stem) => total + stem.blob.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES || totalBytes + headerBytes.byteLength + MAGIC.length + 4 > MAX_PACKAGE_BYTES) {
    throw new Error("This Play-Along package exceeds the 120 MB audio limit.");
  }
  return new Blob([MAGIC, headerLength, headerBytes, ...project.stems.map((stem) => stem.blob)], { type: "application/vnd.drumhero.playalong" });
}

export async function parsePlayAlongPackage(file: Blob): Promise<Omit<PortablePlayAlongProject, "stems"> & { stems: PortablePlayAlongStem[] }> {
  if (file.size < MAGIC.length + 4 || file.size > MAX_PACKAGE_BYTES) throw new Error("This file is not a valid Drum Hero Play-Along package.");
  const magic = new Uint8Array(await file.slice(0, MAGIC.length).arrayBuffer());
  if (!magic.every((byte, index) => byte === MAGIC[index])) throw new Error("This file is not a Drum Hero Play-Along package.");
  const lengthBytes = await file.slice(MAGIC.length, MAGIC.length + 4).arrayBuffer();
  const headerLength = new DataView(lengthBytes).getUint32(0, false);
  const headerStart = MAGIC.length + 4;
  const dataStart = headerStart + headerLength;
  if (headerLength < 2 || headerLength > MAX_HEADER_BYTES || dataStart > file.size) throw new Error("This Play-Along package has an invalid header.");
  let rawHeader: unknown;
  try { rawHeader = JSON.parse(await file.slice(headerStart, dataStart).text()); }
  catch { throw new Error("This Play-Along package has invalid project details."); }
  const header = validateProjectHeader(rawHeader);
  const expectedSize = dataStart + header.stems.reduce((total, stem) => total + stem.size, 0);
  if (expectedSize !== file.size) throw new Error("This Play-Along package is incomplete or contains unexpected data.");
  let offset = dataStart;
  const stems = header.stems.map((stem): PortablePlayAlongStem => {
    const blob = file.slice(offset, offset + stem.size, stem.mimeType);
    offset += stem.size;
    const { size: _size, mimeType: _mimeType, ...metadata } = stem;
    return { ...metadata, blob };
  });
  return { ...header, stems };
}

export function portableStemsFromBackings(backings: BuilderBacking[]): PortablePlayAlongStem[] {
  return backings.map(({ name, blob, duration, downbeat, volume, bpm, source, rights }) => ({
    name, blob, duration, downbeat, volume, ...(bpm === undefined ? {} : { bpm }),
    ...(source === undefined ? {} : { source }), ...(rights === undefined ? {} : { rights }),
  }));
}
