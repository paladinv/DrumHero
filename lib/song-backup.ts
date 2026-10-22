import { migrateSongLibrary, type SongLibraryState } from "./song-library";
const enc = new TextEncoder(), dec = new TextDecoder();
const MAX_AUDIO_BYTES = 96 * 1024 * 1024;
const MAX_HEADER_BYTES = 8 * 1024 * 1024;
const toBase64 = (bytes: Uint8Array) => { let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000))); return btoa(binary); };
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (x) => x.charCodeAt(0));
async function key(password: string, salt: Uint8Array) { const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 210000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
export async function encryptSongBackup(state: SongLibraryState, password: string): Promise<string> { if (password.length < 12) throw new Error("Use at least 12 password characters."); const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(password, salt), enc.encode(JSON.stringify(state)))); return JSON.stringify({ format: "drum-hero-encrypted-library-v1", salt: toBase64(salt), iv: toBase64(iv), data: toBase64(encrypted) }); }
export async function decryptSongBackup(payload: string, password: string): Promise<SongLibraryState> { const value = JSON.parse(payload); if (value.format !== "drum-hero-encrypted-library-v1") throw new Error("Unknown backup format."); if (typeof value.salt !== "string" || value.salt.length > 32 || typeof value.iv !== "string" || value.iv.length > 24 || typeof value.data !== "string" || value.data.length > 11_000_000) throw new Error("Invalid backup data."); const salt = fromBase64(value.salt), iv = fromBase64(value.iv), data = fromBase64(value.data); if (salt.length !== 16 || iv.length !== 12 || data.length > 8_000_000) throw new Error("Invalid backup data."); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(password, salt), data); const parsed = JSON.parse(dec.decode(plain)); if (parsed.version !== 1) throw new Error("Unsupported library version."); return migrateSongLibrary(parsed); }

export async function encryptSongBackupWithAudio(state: SongLibraryState, password: string, audio: Array<{ id: string; blob: Blob }>): Promise<string> {
  if (password.length < 12) throw new Error("Use at least 12 password characters.");
  if (audio.length > 300) throw new Error("An encrypted library backup can include up to 300 song audio files.");
  if (audio.reduce((sum, item) => sum + item.blob.size, 0) > MAX_AUDIO_BYTES) throw new Error("Encrypted library backups support up to 96 MiB of song audio. Export or remove some audio before retrying.");
  const ids = new Set<string>(), files = await Promise.all(audio.map(async item => {
    if (!item.id || item.id.length > 200 || ids.has(item.id)) throw new Error("Audio backup contains an invalid or duplicate file ID.");
    ids.add(item.id);
    if (!item.blob.type.startsWith("audio/")) throw new Error("Only audio files can be added to an encrypted library backup.");
    return { id: item.id, mimeType: item.blob.type, bytes: new Uint8Array(await item.blob.arrayBuffer()) };
  }));
  const totalAudio = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (totalAudio > MAX_AUDIO_BYTES) throw new Error("Encrypted library backups support up to 96 MiB of song audio. Export or remove some audio before retrying.");
  const header = enc.encode(JSON.stringify({ version: 1, state, audio: files.map(file => ({ id: file.id, mimeType: file.mimeType, size: file.bytes.byteLength })) }));
  if (header.byteLength > MAX_HEADER_BYTES) throw new Error("Library metadata exceeds the encrypted backup limit.");
  const plain = new Uint8Array(4 + header.byteLength + totalAudio), view = new DataView(plain.buffer);
  view.setUint32(0, header.byteLength, false);
  plain.set(header, 4);
  let offset = 4 + header.byteLength;
  files.forEach(file => { plain.set(file.bytes, offset); offset += file.bytes.byteLength; });
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(password, salt), plain));
  return JSON.stringify({ format: "drum-hero-encrypted-library-audio-v2", salt: toBase64(salt), iv: toBase64(iv), data: toBase64(encrypted) });
}

export async function decryptSongBackupBundle(payload: string, password: string): Promise<{ state: SongLibraryState; audio: Array<{ id: string; blob: Blob }> }> {
  const value = JSON.parse(payload);
  if (value.format === "drum-hero-encrypted-library-v1") return { state: await decryptSongBackup(payload, password), audio: [] };
  if (value.format !== "drum-hero-encrypted-library-audio-v2" || typeof value.salt !== "string" || typeof value.iv !== "string" || typeof value.data !== "string" || value.data.length > 150 * 1024 * 1024) throw new Error("Unknown or oversized encrypted backup.");
  const salt = fromBase64(value.salt), iv = fromBase64(value.iv), data = fromBase64(value.data);
  if (salt.length !== 16 || iv.length !== 12 || data.byteLength > MAX_AUDIO_BYTES + MAX_HEADER_BYTES + 64) throw new Error("Invalid encrypted backup data.");
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(password, salt), data));
  if (plain.byteLength < 4) throw new Error("Encrypted backup header is missing.");
  const headerLength = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0, false);
  if (headerLength > MAX_HEADER_BYTES || headerLength > plain.byteLength - 4) throw new Error("Encrypted backup header is invalid.");
  const header = JSON.parse(dec.decode(plain.subarray(4, 4 + headerLength)));
  if (header.version !== 1 || header.state?.version !== 1 || !Array.isArray(header.audio) || header.audio.length > 300) throw new Error("Encrypted backup contents are invalid.");
  let offset = 4 + headerLength, totalAudio = 0;
  const seen = new Set<string>(), audio: Array<{ id: string; blob: Blob }> = [];
  for (const item of header.audio as Array<{ id?: unknown; mimeType?: unknown; size?: unknown }>) {
    if (typeof item.id !== "string" || !item.id || item.id.length > 200 || seen.has(item.id) || typeof item.mimeType !== "string" || !item.mimeType.startsWith("audio/") || !Number.isInteger(item.size) || Number(item.size) < 0) throw new Error("Encrypted backup contains invalid audio metadata.");
    const size = Number(item.size);
    totalAudio += size;
    if (totalAudio > MAX_AUDIO_BYTES || offset + size > plain.byteLength) throw new Error("Encrypted backup audio exceeds its limit or is truncated.");
    seen.add(item.id);
    audio.push({ id: item.id, blob: new Blob([plain.slice(offset, offset + size)], { type: item.mimeType }) });
    offset += size;
  }
  if (offset !== plain.byteLength) throw new Error("Encrypted backup contains trailing or malformed data.");
  return { state: migrateSongLibrary(header.state), audio };
}
