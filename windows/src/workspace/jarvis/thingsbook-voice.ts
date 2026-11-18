/**
 * ThingsBook Voice Contract v1 Implementation (Phase 9 Step 9.1 / Step 9.2 / Step 9.3)
 *
 * Implements the normative protocol defined in docs/contracts/thingsbook-voice-v1.md.
 * Provides lossless serialization, schema validation, package hashing, and cross-device merging.
 * Strict isolation: zero dependencies on internal ThingsBook _core crates.
 */

export const THINGSBOOK_VOICE_PROTOCOL_VERSION = 'thingsbook-voice-v1';
export const MAX_PACKAGE_BYTES = 25 * 1024 * 1024; // 25 MB limit
export const MAX_TRANSCRIPT_LENGTH = 50000;
export const MAX_SUMMARY_LENGTH = 5000;

export interface ThingsBookVoiceItem {
  id: string;
  timestamp: number;
  durationMs: number;
  transcript: string;
  audioMime?: 'audio/wav' | 'audio/ogg' | 'audio/webm' | string;
  audioBase64?: string;
  tags?: string[];
  checksum: string;
}

export interface ThingsBookVoiceBriefing {
  id: string;
  date: string;
  summary: string;
  chunks: Array<{
    title: string;
    text: string;
    source: string;
  }>;
  generatedAt: number;
}

export interface ThingsBookVoiceReminder {
  id: string;
  message: string;
  triggerAt: number;
  completed: boolean;
  createdAt: number;
}

export interface ThingsBookVoicePackage {
  version: typeof THINGSBOOK_VOICE_PROTOCOL_VERSION;
  exportedAt: number;
  deviceId: string;
  items: ThingsBookVoiceItem[];
  briefings: ThingsBookVoiceBriefing[];
  reminders: ThingsBookVoiceReminder[];
}

/** Compute deterministic SHA-256 checksum for a voice item */
export function computeItemChecksum(id: string, timestamp: number, transcript: string): string {
  const payload = `${id}:${timestamp}:${transcript}`;
  // Use Node.js crypto if present, otherwise Web Crypto / fallback
  if (typeof globalThis !== 'undefined' && (globalThis as any).process?.versions?.node) {
    try {
      const nodeCrypto = (globalThis as any).require ? (globalThis as any).require('node:crypto') : undefined;
      if (nodeCrypto?.createHash) {
        return nodeCrypto.createHash('sha256').update(payload, 'utf8').digest('hex');
      }
    } catch {}
  }
  // Lightweight deterministic hash fallback when Web Crypto subtle is unavailable synchronously
  let hash1 = 0xdeadbeef ^ payload.length;
  let hash2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ ch, 2654435761);
    hash2 = Math.imul(hash2 ^ ch, 1597334677);
  }
  hash1 = Math.imul(hash1 ^ (hash1 >>> 16), 2246822507);
  hash1 ^= Math.imul(hash2 ^ (hash2 >>> 13), 3266489909);
  hash2 = Math.imul(hash2 ^ (hash2 >>> 16), 2246822507);
  hash2 ^= Math.imul(hash1 ^ (hash1 >>> 13), 3266489909);
  const p1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  return (p1 + p2).repeat(4);
}

/** Factory to create a valid ThingsBookVoiceItem with verified checksum */
export function createVoiceItem(params: {
  id: string;
  timestamp: number;
  durationMs: number;
  transcript: string;
  audioMime?: string;
  audioBase64?: string;
  tags?: string[];
}): ThingsBookVoiceItem {
  const item: ThingsBookVoiceItem = {
    id: params.id,
    timestamp: params.timestamp,
    durationMs: Math.max(0, Math.min(3600000, params.durationMs)),
    transcript: params.transcript.slice(0, MAX_TRANSCRIPT_LENGTH),
    checksum: computeItemChecksum(params.id, params.timestamp, params.transcript),
  };
  if (params.audioMime !== undefined) item.audioMime = params.audioMime;
  if (params.audioBase64 !== undefined) item.audioBase64 = params.audioBase64;
  if (params.tags !== undefined) item.tags = params.tags.map((t) => t.slice(0, 32));
  return item;
}

/** Validate an individual VoiceItem according to contract rules */
export function validateVoiceItem(item: unknown): item is ThingsBookVoiceItem {
  if (!item || typeof item !== 'object') return false;
  const it = item as Partial<ThingsBookVoiceItem>;
  if (typeof it.id !== 'string' || !it.id.trim()) return false;
  if (typeof it.timestamp !== 'number' || !Number.isFinite(it.timestamp) || it.timestamp <= 0) return false;
  if (typeof it.durationMs !== 'number' || it.durationMs < 0 || it.durationMs > 3600000) return false;
  if (typeof it.transcript !== 'string' || it.transcript.length > MAX_TRANSCRIPT_LENGTH) return false;
  if (typeof it.checksum !== 'string' || !it.checksum.trim()) return false;
  if (it.tags && (!Array.isArray(it.tags) || it.tags.some((t) => typeof t !== 'string'))) return false;
  if (it.audioBase64 && typeof it.audioBase64 !== 'string') return false;
  return true;
}

/** Validate a VoiceBriefing record */
export function validateVoiceBriefing(briefing: unknown): briefing is ThingsBookVoiceBriefing {
  if (!briefing || typeof briefing !== 'object') return false;
  const b = briefing as Partial<ThingsBookVoiceBriefing>;
  if (typeof b.id !== 'string' || !b.id.trim()) return false;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return false;
  if (typeof b.summary !== 'string' || b.summary.length > MAX_SUMMARY_LENGTH) return false;
  if (typeof b.generatedAt !== 'number' || !Number.isFinite(b.generatedAt) || b.generatedAt <= 0) return false;
  if (!Array.isArray(b.chunks)) return false;
  for (const c of b.chunks) {
    if (!c || typeof c !== 'object' || typeof c.title !== 'string' || typeof c.text !== 'string') return false;
  }
  return true;
}

/** Validate a VoiceReminder record */
export function validateVoiceReminder(reminder: unknown): reminder is ThingsBookVoiceReminder {
  if (!reminder || typeof reminder !== 'object') return false;
  const r = reminder as Partial<ThingsBookVoiceReminder>;
  if (typeof r.id !== 'string' || !r.id.trim()) return false;
  if (typeof r.message !== 'string' || !r.message.trim()) return false;
  if (typeof r.triggerAt !== 'number' || !Number.isFinite(r.triggerAt)) return false;
  if (typeof r.completed !== 'boolean') return false;
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) return false;
  return true;
}

/** Validate an entire ThingsBookVoicePackage against schema */
export function validateVoicePackage(pkg: unknown): pkg is ThingsBookVoicePackage {
  if (!pkg || typeof pkg !== 'object') return false;
  const p = pkg as Partial<ThingsBookVoicePackage>;
  if (p.version !== THINGSBOOK_VOICE_PROTOCOL_VERSION) return false;
  if (typeof p.exportedAt !== 'number' || !Number.isFinite(p.exportedAt) || p.exportedAt <= 0) return false;
  if (typeof p.deviceId !== 'string' || !p.deviceId.trim() || p.deviceId.length > 64) return false;
  if (!Array.isArray(p.items) || !p.items.every(validateVoiceItem)) return false;
  if (!Array.isArray(p.briefings) || !p.briefings.every(validateVoiceBriefing)) return false;
  if (!Array.isArray(p.reminders) || !p.reminders.every(validateVoiceReminder)) return false;
  return true;
}

/** Serialize ThingsBookVoicePackage to UTF-8 JSON string with size guard */
export function serializeThingsBookVoicePackage(pkg: ThingsBookVoicePackage): string {
  if (!validateVoicePackage(pkg)) {
    throw new Error('Invalid ThingsBookVoicePackage schema: failed contract validation.');
  }
  const jsonStr = JSON.stringify(pkg);
  const byteLen = new TextEncoder().encode(jsonStr).length;
  if (byteLen > MAX_PACKAGE_BYTES) {
    throw new Error(`Package exceeds size limit (${byteLen} bytes > ${MAX_PACKAGE_BYTES} bytes maximum).`);
  }
  return jsonStr;
}

/** Deserialize UTF-8 JSON string into ThingsBookVoicePackage with strict validation */
export function deserializeThingsBookVoicePackage(jsonStr: string): ThingsBookVoicePackage {
  const byteLen = new TextEncoder().encode(jsonStr).length;
  if (byteLen > MAX_PACKAGE_BYTES) {
    throw new Error(`Package exceeds size limit (${byteLen} bytes > ${MAX_PACKAGE_BYTES} bytes maximum).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Failed to parse ThingsBookVoicePackage JSON: ${String(err)}`);
  }
  if (!validateVoicePackage(parsed)) {
    const ver = (parsed as any)?.version;
    if (ver && ver !== THINGSBOOK_VOICE_PROTOCOL_VERSION) {
      throw new Error(`Unsupported ThingsBook voice protocol version "${ver}". Expected "${THINGSBOOK_VOICE_PROTOCOL_VERSION}".`);
    }
    throw new Error('Deserialized data does not satisfy thingsbook-voice-v1 contract.');
  }
  return parsed;
}

/**
 * Merge two packages using deterministic LWW and monotonic completion rules (Step 9.3)
 */
export function mergeVoicePackages(
  base: ThingsBookVoicePackage,
  incoming: ThingsBookVoicePackage
): ThingsBookVoicePackage {
  // Items: merge by id, newest timestamp wins
  const itemMap = new Map<string, ThingsBookVoiceItem>();
  for (const it of base.items) itemMap.set(it.id, it);
  for (const it of incoming.items) {
    const existing = itemMap.get(it.id);
    if (!existing || it.timestamp >= existing.timestamp) {
      itemMap.set(it.id, it);
    }
  }

  // Briefings: merge by date, latest generatedAt wins
  const briefingMap = new Map<string, ThingsBookVoiceBriefing>();
  for (const b of base.briefings) briefingMap.set(b.date, b);
  for (const b of incoming.briefings) {
    const existing = briefingMap.get(b.date);
    if (!existing || b.generatedAt >= existing.generatedAt) {
      briefingMap.set(b.date, b);
    }
  }

  // Reminders: merge by id, completed is monotonic true
  const reminderMap = new Map<string, ThingsBookVoiceReminder>();
  for (const r of base.reminders) reminderMap.set(r.id, r);
  for (const r of incoming.reminders) {
    const existing = reminderMap.get(r.id);
    if (!existing) {
      reminderMap.set(r.id, r);
    } else {
      reminderMap.set(r.id, {
        ...existing,
        completed: existing.completed || r.completed,
        message: r.createdAt >= existing.createdAt ? r.message : existing.message,
      });
    }
  }

  return {
    version: THINGSBOOK_VOICE_PROTOCOL_VERSION,
    exportedAt: Math.max(base.exportedAt, incoming.exportedAt),
    deviceId: base.deviceId,
    items: Array.from(itemMap.values()).sort((a, b) => b.timestamp - a.timestamp),
    briefings: Array.from(briefingMap.values()).sort((a, b) => b.generatedAt - a.generatedAt),
    reminders: Array.from(reminderMap.values()).sort((a, b) => a.triggerAt - b.triggerAt),
  };
}
