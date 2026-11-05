/**
 * Disk cache for neural TTS chunks.
 *
 * Chunks are files in a caller-chosen directory. Nothing is written to the
 * coucou-audio IndexedDB library, so this does not migrate that schema.
 * synthesizeChunk reads and checks a chunk before it calls the provider.
 */

export type TtsAudioFormat = 'wav' | 'mp3' | 'ogg' | 'opus';

export interface TtsSynthesisRequest {
  providerId: string;
  voiceId: string;
  text: string;
  format: TtsAudioFormat;
  sampleRate: number;
}

export interface TtsProvider {
  synthesize(request: TtsSynthesisRequest): Promise<Uint8Array>;
}

export interface VoiceDiskEntry {
  name: string;
  bytes: number;
  mtimeMs: number;
}

export interface VoiceDisk {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<VoiceDiskEntry[]>;
}

export interface VoiceFileOps {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  stat(path: string): Promise<{ size: number; mtimeMs: number }>;
}

export interface SynthesisResult {
  audio: Uint8Array;
  source: 'cache' | 'provider';
  cacheStored: boolean;
  cacheError?: 'disk-full';
}

const HEADER_BYTES = 40;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const CHUNK_NAME = /^[a-f0-9]{64}\.chunk$/;

export class VoiceCacheError extends Error {
  readonly code: 'disk-full' | 'invalid-audio' | 'empty-text' | 'io';

  constructor(code: VoiceCacheError['code'], message: string) {
    super(message);
    this.name = 'VoiceCacheError';
    this.code = code;
  }
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isDiskFull(err: unknown): boolean {
  if (err instanceof VoiceCacheError && err.code === 'disk-full') return true;
  if (errorCode(err) === 'ENOSPC') return true;
  return /no space left on device/i.test(errorText(err));
}

function cacheRoot(root: string): string {
  const trimmed = root.trim();
  if (!trimmed) throw new VoiceCacheError('io', 'Voice cache directory is missing.');
  return trimmed.replace(/[/\\]+$/, '');
}

function chunkFile(root: string, name: string): string {
  if (!CHUNK_NAME.test(name)) throw new VoiceCacheError('io', 'Voice cache file name is not a chunk.');
  return `${cacheRoot(root)}/${name}`;
}

export function createFileVoiceDisk(root: string, ops: VoiceFileOps): VoiceDisk {
  const dir = cacheRoot(root);
  return {
    async read(name) {
      try {
        return await ops.readFile(chunkFile(dir, name));
      } catch (err) {
        if (errorCode(err) === 'ENOENT') return null;
        if (isDiskFull(err)) throw new VoiceCacheError('disk-full', 'The voice cache disk is full.');
        throw new VoiceCacheError('io', 'The voice cache could not be read.');
      }
    },
    async write(name, bytes) {
      const finalPath = chunkFile(dir, name);
      const partial = `${finalPath}.partial`;
      try {
        await ops.mkdir(dir);
        await ops.writeFile(partial, bytes);
        await ops.rename(partial, finalPath);
      } catch (err) {
        await ops.unlink(partial).catch(() => undefined);
        if (isDiskFull(err)) throw new VoiceCacheError('disk-full', 'The voice cache disk is full.');
        throw new VoiceCacheError('io', 'The voice cache could not be written.');
      }
    },
    async remove(name) {
      const finalPath = chunkFile(dir, name);
      await ops.unlink(finalPath).catch((err: unknown) => {
        if (errorCode(err) !== 'ENOENT') throw new VoiceCacheError('io', 'The voice cache could not delete a file.');
      });
      await ops.unlink(`${finalPath}.partial`).catch(() => undefined);
    },
    async list() {
      let names: string[];
      try {
        names = await ops.readdir(dir);
      } catch (err) {
        if (errorCode(err) === 'ENOENT') return [];
        throw new VoiceCacheError('io', 'The voice cache could not be listed.');
      }
      const entries: VoiceDiskEntry[] = [];
      for (const name of names) {
        if (!CHUNK_NAME.test(name)) continue;
        try {
          const info = await ops.stat(chunkFile(dir, name));
          entries.push({ name, bytes: info.size, mtimeMs: info.mtimeMs });
        } catch (err) {
          if (errorCode(err) !== 'ENOENT') throw new VoiceCacheError('io', 'The voice cache could not stat a file.');
        }
      }
      return entries;
    },
  };
}

function u32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]) >>> 0;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return new Uint8Array(digest);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function isNeuralAudioChunk(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const wave = bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  if (riff && wave) return true;
  const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (head === 'OggS' || head === 'fLaC') return true;
  // ID3 is three bytes; the fourth is the tag version and is not part of the magic.
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

async function frameChunk(audio: Uint8Array): Promise<Uint8Array> {
  const hash = await sha256(audio);
  const framed = new Uint8Array(HEADER_BYTES + audio.length);
  framed.set([0x41, 0x4e, 0x46, 0x31], 0);
  framed.set(hash, 4);
  framed.set(u32(audio.length), 36);
  framed.set(audio, HEADER_BYTES);
  return framed;
}

async function readCachedChunk(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (bytes.length < HEADER_BYTES || bytes.length > HEADER_BYTES + MAX_AUDIO_BYTES) return null;
  if (bytes[0] !== 0x41 || bytes[1] !== 0x4e || bytes[2] !== 0x46 || bytes[3] !== 0x31) return null;
  const length = readU32(bytes, 36);
  if (length === 0 || length > MAX_AUDIO_BYTES || bytes.length !== HEADER_BYTES + length) return null;
  const audio = bytes.slice(HEADER_BYTES);
  const hash = bytes.slice(4, 36);
  if (!sameBytes(hash, await sha256(audio))) return null;
  if (!isNeuralAudioChunk(audio)) return null;
  return audio;
}

async function chunkName(request: TtsSynthesisRequest): Promise<string> {
  const canonical = JSON.stringify([request.providerId, request.voiceId, request.format, request.sampleRate, request.text]);
  const hash = await sha256(new TextEncoder().encode(canonical));
  return `${[...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('')}.chunk`;
}

function assertRequest(request: TtsSynthesisRequest): void {
  if (!request.text.trim()) throw new VoiceCacheError('empty-text', 'There is no text to speak.');
  if (!request.providerId.trim() || !request.voiceId.trim()) throw new VoiceCacheError('io', 'Voice cache request is missing a provider or voice.');
  if (!Number.isInteger(request.sampleRate) || request.sampleRate < 8000 || request.sampleRate > 96000) {
    throw new VoiceCacheError('io', 'Voice cache sample rate is not usable.');
  }
  if (request.format !== 'wav' && request.format !== 'mp3' && request.format !== 'ogg' && request.format !== 'opus') {
    throw new VoiceCacheError('io', 'Voice cache audio format is not supported.');
  }
}

export async function synthesizeChunk(disk: VoiceDisk, provider: TtsProvider, request: TtsSynthesisRequest): Promise<SynthesisResult> {
  assertRequest(request);
  const name = await chunkName(request);
  let stored: Uint8Array | null;
  try {
    stored = await disk.read(name);
  } catch (err) {
    if (isDiskFull(err)) throw new VoiceCacheError('disk-full', 'The voice cache disk is full.');
    throw err instanceof VoiceCacheError ? err : new VoiceCacheError('io', 'The voice cache could not be read.');
  }
  const cached = stored ? await readCachedChunk(stored) : null;
  if (stored && !cached) await disk.remove(name).catch(() => undefined);
  if (cached) return { audio: cached, source: 'cache', cacheStored: true };

  const audio = await provider.synthesize(request);
  if (!isNeuralAudioChunk(audio) || audio.length > MAX_AUDIO_BYTES) {
    throw new VoiceCacheError('invalid-audio', 'The voice provider did not return an audio chunk.');
  }
  try {
    await disk.write(name, await frameChunk(audio));
    return { audio, source: 'provider', cacheStored: true };
  } catch (err) {
    if (!isDiskFull(err)) throw err instanceof VoiceCacheError ? err : new VoiceCacheError('io', 'The voice cache could not be written.');
    await disk.remove(name).catch(() => undefined);
    return { audio, source: 'provider', cacheStored: false, cacheError: 'disk-full' };
  }
}

export interface VoiceCacheCleanup {
  removed: number;
  corrupt: number;
  expired: number;
  trimmed: number;
  bytesFreed: number;
}

export async function cleanupVoiceCache(
  disk: VoiceDisk,
  options: { maxAgeMs?: number; maxBytes?: number; now?: number } = {},
): Promise<VoiceCacheCleanup> {
  const result: VoiceCacheCleanup = { removed: 0, corrupt: 0, expired: 0, trimmed: 0, bytesFreed: 0 };
  const now = options.now ?? Date.now();
  const kept: VoiceDiskEntry[] = [];
  for (const entry of await disk.list()) {
    const raw = await disk.read(entry.name);
    if (raw === null) continue;
    const audio = await readCachedChunk(raw);
    if (!audio) {
      await disk.remove(entry.name);
      result.corrupt += 1;
      result.removed += 1;
      result.bytesFreed += entry.bytes;
      continue;
    }
    if (options.maxAgeMs !== undefined && now - entry.mtimeMs > options.maxAgeMs) {
      await disk.remove(entry.name);
      result.expired += 1;
      result.removed += 1;
      result.bytesFreed += entry.bytes;
      continue;
    }
    kept.push(entry);
  }
  if (options.maxBytes !== undefined) {
    kept.sort((left, right) => left.mtimeMs - right.mtimeMs);
    let total = kept.reduce((sum, entry) => sum + entry.bytes, 0);
    for (const entry of kept) {
      if (total <= options.maxBytes) break;
      await disk.remove(entry.name);
      total -= entry.bytes;
      result.trimmed += 1;
      result.removed += 1;
      result.bytesFreed += entry.bytes;
    }
  }
  return result;
}
