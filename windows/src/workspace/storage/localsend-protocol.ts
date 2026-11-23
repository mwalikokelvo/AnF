// LocalSend-grade Peer-to-Peer Local Network Discovery, Handshake, and Chunk Framing Protocol.
// Allows AnF and ThingsBook to discover peers on LAN/Wi-Fi and exchange notes, books, and audio securely.

export interface LocalSendDevice {
  alias: string;
  version: string;
  deviceModel?: string;
  deviceType: 'desktop' | 'mobile' | 'web';
  fingerprint: string;
  port: number;
  protocol: 'https' | 'http';
}

export interface FileMetadata {
  id: string;
  fileName: string;
  size: number;
  fileType: string;
  sha256?: string;
}

export interface PrepareUploadRequest {
  info: LocalSendDevice;
  sessionId: string;
  files: Record<string, FileMetadata>;
}

export interface PrepareUploadResponse {
  sessionId: string;
  files: Record<string, string>; // fileId -> token
}

export const LOCALSEND_MAGIC = 0x4c534e44; // 'LSND'

/**
 * Creates a JSON discovery beacon string broadcasted via UDP multicast (default port 53317).
 */
export function createDiscoveryBeacon(device: LocalSendDevice): string {
  return JSON.stringify({
    alias: device.alias,
    version: device.version || '2.0',
    deviceModel: device.deviceModel || 'PC',
    deviceType: device.deviceType,
    fingerprint: device.fingerprint,
    port: device.port || 53317,
    protocol: device.protocol || 'https',
    download: true,
    announcement: true,
  });
}

/**
 * Parses and validates a received UDP discovery beacon payload.
 */
export function parseDiscoveryBeacon(raw: string): LocalSendDevice | null {
  try {
    const data = JSON.parse(raw);
    if (!data.alias || !data.fingerprint || !data.deviceType) {
      return null;
    }
    return {
      alias: String(data.alias).slice(0, 32),
      version: String(data.version || '2.0'),
      deviceModel: data.deviceModel ? String(data.deviceModel) : undefined,
      deviceType: data.deviceType === 'mobile' ? 'mobile' : data.deviceType === 'web' ? 'web' : 'desktop',
      fingerprint: String(data.fingerprint),
      port: Number(data.port) || 53317,
      protocol: data.protocol === 'http' ? 'http' : 'https',
    };
  } catch {
    return null;
  }
}

/**
 * Frames a binary data chunk with magic header, sequence index, and length validation.
 * Structure: [4B Magic 'LSND'][4B ChunkIndex BE][4B DataLength BE][Data]
 */
export function frameChunk(chunkIndex: number, data: Uint8Array): Uint8Array {
  const frame = new Uint8Array(12 + data.byteLength);
  const view = new DataView(frame.buffer);

  view.setUint32(0, LOCALSEND_MAGIC, false);
  view.setUint32(4, chunkIndex, false);
  view.setUint32(8, data.byteLength, false);
  frame.set(data, 12);

  return frame;
}

/**
 * Deframes a binary packet, verifying magic and length bounds.
 */
export function deframeChunk(frame: Uint8Array): { chunkIndex: number; data: Uint8Array } | null {
  if (frame.byteLength < 12) return null;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);

  const magic = view.getUint32(0, false);
  if (magic !== LOCALSEND_MAGIC) return null;

  const chunkIndex = view.getUint32(4, false);
  const dataLen = view.getUint32(8, false);

  if (frame.byteLength < 12 + dataLen) return null;

  const data = frame.subarray(12, 12 + dataLen);
  return { chunkIndex, data };
}

/**
 * Evaluates an incoming file transfer request against safety policies.
 */
export function evaluateTransferRequest(
  req: PrepareUploadRequest,
  policy: { maxTotalBytes?: number; maxFileCount?: number; autoAcceptFingerprints?: string[] } = {}
): { accepted: boolean; reason?: string } {
  const maxBytes = policy.maxTotalBytes || 1024 * 1024 * 1024; // 1 GB default limit
  const maxCount = policy.maxFileCount || 50;

  const fileEntries = Object.values(req.files);
  if (fileEntries.length === 0) {
    return { accepted: false, reason: 'No files declared in transfer request.' };
  }
  if (fileEntries.length > maxCount) {
    return { accepted: false, reason: `File count (${fileEntries.length}) exceeds limit of ${maxCount}.` };
  }

  let totalSize = 0;
  for (const f of fileEntries) {
    // Check path traversal attempts in file names
    if (f.fileName.includes('..') || f.fileName.includes('/') || f.fileName.includes('\\')) {
      return { accepted: false, reason: `Invalid or dangerous filename "${f.fileName}".` };
    }
    totalSize += f.size;
  }

  if (totalSize > maxBytes) {
    return { accepted: false, reason: `Total transfer size (${totalSize} B) exceeds maximum limit (${maxBytes} B).` };
  }

  return { accepted: true };
}
