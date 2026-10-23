import { normalizeSong, type DrumSong } from "./song-library";

const SHARE_PREFIX = "drum-hero-song-v1.";
const MAX_SHARE_TOKEN_LENGTH = 60_000;
const MAX_DECOMPRESSED_BYTES = 2_000_000;

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function streamBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DECOMPRESSED_BYTES) {
        await reader.cancel();
        throw new Error("This shared arrangement is too large to open.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function shareableSong(song: DrumSong) {
  return normalizeSong({
    ...song,
    id: "shared-song",
    source: undefined,
    kitSetup: undefined,
    sharedOrigin: undefined,
    arrangementLocked: false,
    bundled: false,
    notes: "",
    sections: song.sections.map(section => ({ ...section, notes: "", rehearsalCues: section.rehearsalCues?.filter(cue => cue.kind !== "lyric") }))
  });
}

export async function createSongShareUrl(song: DrumSong) {
  const safeSong = shareableSong(song);
  if (!safeSong) throw new Error("This arrangement could not be prepared for sharing.");
  const payload = new TextEncoder().encode(JSON.stringify({ version: 1, song: safeSong }));
  let encoding = "j";
  let bytes = payload;
  if (typeof CompressionStream !== "undefined") {
    try {
      bytes = await streamBytes(new Blob([payload]).stream().pipeThrough(new CompressionStream("gzip")));
      encoding = "g";
    } catch { bytes = payload; encoding = "j"; }
  }
  const token = `${SHARE_PREFIX}${encoding}.${base64UrlEncode(bytes)}`;
  if (token.length > MAX_SHARE_TOKEN_LENGTH) throw new Error("This arrangement is too large for a playback link. Export a section instead.");
  return `${window.location.origin}/song-builder/share#${token}`;
}

export async function readSongShareHash(hash: string): Promise<DrumSong> {
  const token = hash.startsWith("#") ? hash.slice(1) : hash;
  if (token.length > MAX_SHARE_TOKEN_LENGTH || !token.startsWith(SHARE_PREFIX)) throw new Error("This playback link is invalid or too large.");
  const match = token.slice(SHARE_PREFIX.length).match(/^([jg])\.([A-Za-z0-9_-]+)$/);
  if (!match) throw new Error("This playback link is not in a supported format.");
  let bytes = base64UrlDecode(match[2]!);
  if (match[1] === "g") {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed playback links. Open the link in a recent browser.");
    bytes = await streamBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
  }
  if (bytes.byteLength > MAX_DECOMPRESSED_BYTES) throw new Error("This shared arrangement is too large to open.");
  const value = JSON.parse(new TextDecoder().decode(bytes)) as { version?: unknown; song?: unknown };
  if (value.version !== 1) throw new Error("This playback link uses an unsupported version.");
  const song = normalizeSong(value.song);
  if (!song) throw new Error("The arrangement in this playback link is incomplete.");
  return song;
}
