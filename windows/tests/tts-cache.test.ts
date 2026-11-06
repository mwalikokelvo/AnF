import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readdir, readFile, writeFile, rename, unlink, mkdir, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  VoiceCacheError,
  cleanupVoiceCache,
  createFileVoiceDisk,
  synthesizeChunk,
  type TtsProvider,
  type TtsSynthesisRequest,
  type VoiceDisk,
  type VoiceFileOps,
} from '../src/workspace/tts-service.ts';

/** 16-bit mono WAV large enough for the cache to treat it as audio. Payload bytes are the fixture. */
function tinyWav(payload: number[]): Uint8Array {
  const data = Uint8Array.from(payload);
  const bytes = new Uint8Array(44 + data.length);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  const size = 36 + data.length;
  bytes[4] = size & 0xff;
  bytes[5] = (size >> 8) & 0xff;
  bytes[6] = (size >> 16) & 0xff;
  bytes[7] = (size >> 24) & 0xff;
  bytes.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  bytes[16] = 16;
  bytes[20] = 1;
  bytes[22] = 1;
  bytes[24] = 0x80;
  bytes[25] = 0x3e;
  bytes[32] = 2;
  bytes[34] = 16;
  bytes.set([0x64, 0x61, 0x74, 0x61], 36);
  bytes[40] = data.length & 0xff;
  bytes[41] = (data.length >> 8) & 0xff;
  bytes.set(data, 44);
  return bytes;
}

const WAV_A = tinyWav([1, 2, 3, 4, 5, 6, 7, 8]);
const WAV_B = tinyWav([8, 7, 6, 5, 4, 3, 2, 1]);

function request(over: Partial<TtsSynthesisRequest> = {}): TtsSynthesisRequest {
  return {
    providerId: 'piper',
    voiceId: 'en-us-lessac',
    text: 'Hello from the notch.',
    format: 'wav',
    sampleRate: 22050,
    ...over,
  };
}

function nodeFileOps(): VoiceFileOps {
  return {
    readFile: async (file) => new Uint8Array(await readFile(file)),
    writeFile: (file, data) => writeFile(file, data),
    rename,
    unlink,
    readdir,
    mkdir: (dir) => mkdir(dir, { recursive: true }).then(() => undefined),
    stat: async (file) => {
      const info = await stat(file);
      return { size: info.size, mtimeMs: info.mtimeMs };
    },
  };
}

function providerOf(chunks: Uint8Array[]): { provider: TtsProvider; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    provider: {
      synthesize: async () => {
        const chunk = chunks[calls] ?? chunks[chunks.length - 1];
        calls += 1;
        return chunk;
      },
    },
  };
}

async function withDisk(run: (dir: string, disk: VoiceDisk) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'anf-voice-'));
  try {
    await run(dir, createFileVoiceDisk(dir, nodeFileOps()));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a repeated chunk is served from disk and the provider is not called again', async () => {
  await withDisk(async (dir, disk) => {
    const made = providerOf([WAV_A]);
    const first = await synthesizeChunk(disk, made.provider, request());
    assert.equal(first.source, 'provider');
    assert.equal(first.cacheStored, true);
    assert.deepEqual(first.audio, WAV_A);
    assert.equal(made.calls(), 1);
    const stored = (await readdir(dir)).filter((name) => name.endsWith('.chunk'));
    assert.equal(stored.length, 1);
    const framed = await readFile(path.join(dir, stored[0]));
    assert.equal(framed.subarray(0, 4).toString('utf8'), 'ANF1');
    assert.equal(framed.readUInt32BE(36), WAV_A.length);
    assert.deepEqual(Uint8Array.from(framed.subarray(40)), WAV_A);

    const second = await synthesizeChunk(disk, made.provider, request());
    assert.equal(second.source, 'cache');
    assert.equal(second.cacheStored, true);
    assert.deepEqual(second.audio, WAV_A);
    assert.equal(made.calls(), 1);
    second.audio[0] ^= 0xff;
    const third = await synthesizeChunk(disk, made.provider, request());
    assert.equal(third.source, 'cache');
    assert.equal(third.audio[0], WAV_A[0]);
    assert.deepEqual(third.audio, WAV_A);
    assert.equal(made.calls(), 1);
  });
});

test('the disk is read before a provider is asked to synthesize', async () => {
  await withDisk(async (_dir, disk) => {
    let reads = 0;
    const wrapped: VoiceDisk = {
      ...disk,
      read: async (name) => {
        reads += 1;
        return disk.read(name);
      },
    };
    let calls = 0;
    const provider: TtsProvider = {
      synthesize: async () => {
        assert.equal(reads, 1);
        calls += 1;
        return WAV_A;
      },
    };
    await synthesizeChunk(wrapped, provider, request());
    assert.equal(calls, 1);
    assert.equal(reads, 1);
  });
});

test('a different voice or sample rate is a cache miss', async () => {
  await withDisk(async (_dir, disk) => {
    const made = providerOf([WAV_A, WAV_B, WAV_A]);
    await synthesizeChunk(disk, made.provider, request());
    const otherVoice = await synthesizeChunk(disk, made.provider, request({ voiceId: 'en-gb-alba' }));
    assert.equal(otherVoice.source, 'provider');
    assert.deepEqual(otherVoice.audio, WAV_B);
    const otherRate = await synthesizeChunk(disk, made.provider, request({ sampleRate: 16000 }));
    assert.equal(otherRate.source, 'provider');
    assert.equal(made.calls(), 3);
    await synthesizeChunk(disk, made.provider, request({ voiceId: 'en-gb-alba' }));
    assert.equal(made.calls(), 3);
  });
});

test('a corrupt or bit-flipped chunk is deleted and synthesized again', async () => {
  await withDisk(async (dir, disk) => {
    const made = providerOf([WAV_A, WAV_B]);
    await synthesizeChunk(disk, made.provider, request());
    const [name] = (await readdir(dir)).filter((entry) => entry.endsWith('.chunk'));
    const file = path.join(dir, name);
    const framed = await readFile(file);
    framed[framed.length - 1] ^= 0xff;
    await writeFile(file, framed);
    const again = await synthesizeChunk(disk, made.provider, request());
    assert.equal(again.source, 'provider');
    assert.deepEqual(again.audio, WAV_B);
    assert.equal(made.calls(), 2);
    const replaced = await readFile(file);
    assert.notEqual(replaced[replaced.length - 1], framed[framed.length - 1]);

    await writeFile(file, Buffer.from('this is not a voice chunk'));
    const recovered = await synthesizeChunk(disk, made.provider, request());
    assert.deepEqual(recovered.audio, WAV_B);
    assert.equal(made.calls(), 3);
    const huge = new Uint8Array(40);
    huge.set([0x41, 0x4e, 0x46, 0x31]);
    huge[36] = 0x7f;
    huge[37] = 0xff;
    huge[38] = 0xff;
    huge[39] = 0xff;
    await writeFile(file, huge);
    const refused = await synthesizeChunk(disk, made.provider, request());
    assert.deepEqual(refused.audio, WAV_B);
    assert.equal(made.calls(), 4);
  });
});

test('a full disk still returns the synthesized audio and leaves no partial file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'anf-voice-'));
  try {
    const ops = nodeFileOps();
    ops.writeFile = async () => {
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    };
    const made = providerOf([WAV_A]);
    const result = await synthesizeChunk(createFileVoiceDisk(dir, ops), made.provider, request());
    assert.equal(result.source, 'provider');
    assert.equal(result.cacheStored, false);
    assert.equal(result.cacheError, 'disk-full');
    assert.deepEqual(result.audio, WAV_A);
    assert.equal(made.calls(), 1);
    assert.deepEqual(await readdir(dir).catch(() => []), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a rename that runs out of space deletes the partial chunk', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'anf-voice-'));
  try {
    const ops = nodeFileOps();
    ops.rename = async () => {
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    };
    const result = await synthesizeChunk(createFileVoiceDisk(dir, ops), providerOf([WAV_A]).provider, request());
    assert.equal(result.cacheStored, false);
    const names = await readdir(dir);
    assert.equal(names.some((name) => name.includes('partial')), false);
    assert.equal(names.some((name) => name.endsWith('.chunk')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a full disk during lookup does not dispatch synthesis', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'anf-voice-'));
  try {
    const ops = nodeFileOps();
    ops.readFile = async () => {
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    };
    const made = providerOf([WAV_A]);
    await assert.rejects(
      () => synthesizeChunk(createFileVoiceDisk(dir, ops), made.provider, request()),
      (err: unknown) => err instanceof VoiceCacheError && err.code === 'disk-full',
    );
    assert.equal(made.calls(), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a cache read failure does not dispatch synthesis', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'anf-voice-'));
  try {
    const ops = nodeFileOps();
    ops.readFile = async () => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    };
    const made = providerOf([WAV_A]);
    await assert.rejects(
      () => synthesizeChunk(createFileVoiceDisk(dir, ops), made.provider, request()),
      (err: unknown) => err instanceof VoiceCacheError && err.code === 'io',
    );
    assert.equal(made.calls(), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('empty text and a non-audio response never store a chunk', async () => {
  await withDisk(async (dir, disk) => {
    const made = providerOf([WAV_A]);
    await assert.rejects(
      () => synthesizeChunk(disk, made.provider, request({ text: '   ' })),
      (err: unknown) => err instanceof VoiceCacheError && err.code === 'empty-text',
    );
    assert.equal(made.calls(), 0);
    made.provider.synthesize = async () => new TextEncoder().encode('<html>error</html>');
    await assert.rejects(
      () => synthesizeChunk(disk, made.provider, request()),
      (err: unknown) => err instanceof VoiceCacheError && err.code === 'invalid-audio',
    );
    assert.deepEqual(await readdir(dir).catch(() => []), []);
  });
});

test('ogg and mp3 chunks can be cached and an html body cannot', async () => {
  const ogg = new Uint8Array(16);
  ogg.set([0x4f, 0x67, 0x67, 0x53]);
  const mp3 = new Uint8Array(16);
  mp3.set([0xff, 0xfb]);
  await withDisk(async (dir, disk) => {
    const made = providerOf([ogg, mp3]);
    const first = await synthesizeChunk(disk, made.provider, request({ format: 'ogg', text: 'ogg line' }));
    assert.equal(first.source, 'provider');
    assert.deepEqual(first.audio, ogg);
    const again = await synthesizeChunk(disk, made.provider, request({ format: 'ogg', text: 'ogg line' }));
    assert.equal(again.source, 'cache');
    assert.equal(made.calls(), 1);
    const encoded = await synthesizeChunk(disk, made.provider, request({ format: 'mp3', text: 'mp3 line' }));
    assert.deepEqual(encoded.audio, mp3);
    assert.equal(made.calls(), 2);
    made.provider.synthesize = async () => new TextEncoder().encode('{"error":"no audio"}');
    await assert.rejects(
      () => synthesizeChunk(disk, made.provider, request({ text: 'json line' })),
      (err: unknown) => err instanceof VoiceCacheError && err.code === 'invalid-audio',
    );
    assert.equal((await readdir(dir)).filter((name) => name.endsWith('.chunk')).length, 2);
  });
});

test('cleanup drops corrupt and expired chunks and trims to the byte budget', async () => {
  await withDisk(async (dir, disk) => {
    const made = providerOf([WAV_A, WAV_B, WAV_A]);
    await synthesizeChunk(disk, made.provider, request({ text: 'older line' }));
    const older = (await readdir(dir)).find((name) => name.endsWith('.chunk'));
    assert.ok(older);
    await utimes(path.join(dir, older), new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));
    await synthesizeChunk(disk, made.provider, request({ text: 'newer line' }));
    const newer = (await readdir(dir)).find((name) => name.endsWith('.chunk') && name !== older);
    assert.ok(newer);
    await writeFile(path.join(dir, `${'ab'.repeat(32)}.chunk`), Buffer.from('not-a-chunk'));
    const expired = await cleanupVoiceCache(disk, { maxAgeMs: 24 * 60 * 60 * 1000 });
    assert.equal(expired.corrupt, 1);
    assert.equal(expired.expired, 1);
    assert.deepEqual((await readdir(dir)).filter((name) => name.endsWith('.chunk')), [newer]);
    const hit = await synthesizeChunk(disk, made.provider, request({ text: 'newer line' }));
    assert.equal(hit.source, 'cache');
    const miss = await synthesizeChunk(disk, made.provider, request({ text: 'older line' }));
    assert.equal(miss.source, 'provider');

    const freshOlder = (await readdir(dir)).find((name) => name.endsWith('.chunk') && name !== newer);
    assert.ok(freshOlder);
    await utimes(path.join(dir, freshOlder), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    const budget = (await stat(path.join(dir, newer))).size;
    const trimmed = await cleanupVoiceCache(disk, { maxBytes: budget });
    assert.equal(trimmed.trimmed, 1);
    assert.deepEqual((await readdir(dir)).filter((name) => name.endsWith('.chunk')), [newer]);
    const stillCached = await synthesizeChunk(disk, made.provider, request({ text: 'newer line' }));
    assert.equal(stillCached.source, 'cache');
  });
});

/** Independent of the writer: same ANF1 layout the decoder accepts (SHA-256, big-endian length). */
function frameAudio(audio: Uint8Array): Buffer {
  const framed = Buffer.alloc(40 + audio.length);
  framed.set([0x41, 0x4e, 0x46, 0x31], 0);
  framed.set(createHash('sha256').update(audio).digest(), 4);
  framed.writeUInt32BE(audio.length, 36);
  framed.set(audio, 40);
  return framed;
}

async function onlyChunk(dir: string): Promise<string> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.chunk'));
  assert.equal(names.length, 1);
  return path.join(dir, names[0]);
}

test('decoding a planted frame returns that payload, and a non-audio frame is synthesized again', async () => {
  const flac = new Uint8Array(16);
  flac.set([0x66, 0x4c, 0x61, 0x43]);
  flac[15] = 0x5a;
  const id3 = new Uint8Array(16);
  id3.set([0x49, 0x44, 0x33, 0x03]);
  id3[10] = 0x11;
  const shortOgg = new Uint8Array(15);
  shortOgg.set([0x4f, 0x67, 0x67, 0x53]);
  const riff = new Uint8Array(16);
  riff.set([0x52, 0x49, 0x46, 0x46]);
  const html = new TextEncoder().encode('<html>not audio</html>');

  await withDisk(async (dir, disk) => {
    const made = providerOf([WAV_A, WAV_B]);
    await synthesizeChunk(disk, made.provider, request());
    const file = await onlyChunk(dir);

    await writeFile(file, frameAudio(flac));
    const decoded = await synthesizeChunk(disk, made.provider, request());
    assert.equal(decoded.source, 'cache');
    assert.deepEqual(decoded.audio, flac);
    assert.equal(decoded.audio[15], 0x5a);
    assert.equal(made.calls(), 1);

    await writeFile(file, frameAudio(id3));
    const tagged = await synthesizeChunk(disk, made.provider, request());
    assert.equal(tagged.source, 'cache');
    assert.deepEqual(tagged.audio, id3);
    assert.equal(made.calls(), 1);

    for (const bogus of [shortOgg, riff, html]) {
      await writeFile(file, frameAudio(bogus));
      const before = made.calls();
      const again = await synthesizeChunk(disk, made.provider, request());
      assert.equal(again.source, 'provider');
      assert.deepEqual(again.audio, WAV_B);
      assert.equal(made.calls(), before + 1);
      const stored = await readFile(file);
      assert.equal(stored.subarray(0, 4).toString('utf8'), 'ANF1');
      assert.deepEqual(Uint8Array.from(stored.subarray(40)), again.audio);
    }
  });
});

test('a truncated, overlong, zero-length, or hash-mismatched frame is not decoded', async () => {
  await withDisk(async (dir, disk) => {
    const made = providerOf([WAV_A]);
    await synthesizeChunk(disk, made.provider, request());
    const file = await onlyChunk(dir);
    const original = Buffer.from(await readFile(file));
    const mutations: Array<(framed: Buffer) => Buffer> = [
      (framed) => framed.subarray(0, 39),
      (framed) => framed.subarray(0, framed.length - 1),
      (framed) => Buffer.concat([framed, Buffer.from([0])]),
      (framed) => {
        const copy = Buffer.from(framed);
        copy.fill(0, 36, 40);
        return copy;
      },
      (framed) => {
        const copy = Buffer.from(framed);
        copy[4] ^= 0xff;
        return copy;
      },
      (framed) => {
        const copy = Buffer.from(framed);
        const length = copy.subarray(36, 40);
        copy.set([length[3], length[2], length[1], length[0]], 36);
        return copy;
      },
      (framed) => {
        const copy = Buffer.from(framed);
        copy[0] = 0x61;
        return copy;
      },
    ];

    for (const mutate of mutations) {
      await writeFile(file, mutate(original));
      const before = made.calls();
      const again = await synthesizeChunk(disk, made.provider, request());
      assert.equal(again.source, 'provider');
      assert.deepEqual(again.audio, WAV_A);
      assert.equal(made.calls(), before + 1);
      const hit = await synthesizeChunk(disk, made.provider, request());
      assert.equal(hit.source, 'cache');
      assert.deepEqual(hit.audio, WAV_A);
      assert.equal(made.calls(), before + 1);
      const restored = await readFile(file);
      assert.equal(restored.readUInt32BE(36), WAV_A.length);
      assert.deepEqual(Uint8Array.from(restored.subarray(40)), WAV_A);
    }
  });
});

test('audio one byte past the cache limit is refused and the limit itself round-trips', async () => {
  const limit = 8 * 1024 * 1024;
  const accepted = new Uint8Array(limit);
  accepted.set([0x4f, 0x67, 0x67, 0x53]);
  accepted[100] = 0x11;
  accepted[limit - 1] = 0x5a;
  const rejected = new Uint8Array(limit + 1);
  rejected.set([0x4f, 0x67, 0x67, 0x53]);

  await withDisk(async (dir, disk) => {
    const made = providerOf([rejected, accepted]);
    await assert.rejects(
      () => synthesizeChunk(disk, made.provider, request({ text: 'too big' })),
      (err: unknown) => err instanceof VoiceCacheError && err.code === 'invalid-audio',
    );
    assert.equal(made.calls(), 1);
    assert.deepEqual(await readdir(dir).catch(() => []), []);

    const stored = await synthesizeChunk(disk, made.provider, request({ text: 'at the limit' }));
    assert.equal(stored.source, 'provider');
    assert.equal(stored.audio.length, limit);
    assert.equal(stored.audio[100], 0x11);
    assert.equal(stored.audio[limit - 1], 0x5a);
    const file = await onlyChunk(dir);
    const framed = await readFile(file);
    assert.equal(framed.readUInt32BE(36), limit);
    assert.equal(framed[40 + 100], 0x11);
    assert.equal(framed[framed.length - 1], 0x5a);

    const hit = await synthesizeChunk(disk, made.provider, request({ text: 'at the limit' }));
    assert.equal(hit.source, 'cache');
    assert.equal(hit.audio.length, limit);
    assert.equal(hit.audio[100], 0x11);
    assert.equal(hit.audio[limit - 1], 0x5a);
    assert.equal(made.calls(), 2);
  });
});
