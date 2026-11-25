export interface AudioStreamCacheOptions {
  maxCacheSizeBytes: number;
}

export interface BufferedChunkRange {
  startChunk: number;
  endChunk: number;
}

export class AudioStreamCache {
  private readonly maxCacheSizeBytes: number;
  private readonly entries = new Map<string, { trackId: string; chunkIndex: number; data: Uint8Array }>();
  private totalBytes = 0;

  constructor(options: AudioStreamCacheOptions) {
    this.maxCacheSizeBytes = Math.max(0, options.maxCacheSizeBytes);
  }

  private key(trackId: string, chunkIndex: number): string {
    return `${trackId}::${chunkIndex}`;
  }

  putChunk(trackId: string, chunkIndex: number, data: Uint8Array): void {
    const k = this.key(trackId, chunkIndex);
    const existing = this.entries.get(k);
    if (existing) {
      this.totalBytes -= existing.data.byteLength;
      this.entries.delete(k);
    }

    if (data.byteLength > this.maxCacheSizeBytes) {
      return;
    }

    while (this.totalBytes + data.byteLength > this.maxCacheSizeBytes && this.entries.size > 0) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      if (oldest) this.totalBytes -= oldest.data.byteLength;
      this.entries.delete(oldestKey);
    }

    this.entries.set(k, { trackId, chunkIndex, data });
    this.totalBytes += data.byteLength;
  }

  hasChunk(trackId: string, chunkIndex: number): boolean {
    return this.entries.has(this.key(trackId, chunkIndex));
  }

  getChunk(trackId: string, chunkIndex: number): Uint8Array | undefined {
    const k = this.key(trackId, chunkIndex);
    const entry = this.entries.get(k);
    if (!entry) return undefined;
    this.entries.delete(k);
    this.entries.set(k, entry);
    return entry.data;
  }

  getTrackBufferedRanges(trackId: string): BufferedChunkRange[] {
    const indices: number[] = [];
    for (const entry of this.entries.values()) {
      if (entry.trackId === trackId) indices.push(entry.chunkIndex);
    }
    if (indices.length === 0) return [];
    indices.sort((a, b) => a - b);

    const ranges: BufferedChunkRange[] = [];
    let start = indices[0];
    let end = indices[0];
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === end + 1) {
        end = indices[i];
      } else {
        ranges.push({ startChunk: start, endChunk: end });
        start = indices[i];
        end = indices[i];
      }
    }
    ranges.push({ startChunk: start, endChunk: end });
    return ranges;
  }
}
