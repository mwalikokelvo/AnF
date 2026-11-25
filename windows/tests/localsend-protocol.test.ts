// Tests for LocalSend Peer-to-Peer Protocol
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDiscoveryBeacon,
  parseDiscoveryBeacon,
  frameChunk,
  deframeChunk,
  evaluateTransferRequest,
} from '../src/workspace/storage/localsend-protocol.js';

test('LocalSend Suite - Discovery Beacon Handshake', async (t) => {
  await t.test('creates and parses valid multicast discovery beacon', () => {
    const device = {
      alias: 'AnF Studio Laptop',
      version: '2.1',
      deviceType: 'desktop' as const,
      fingerprint: 'fp-sha256-abcdef123456',
      port: 53317,
      protocol: 'https' as const,
    };

    const beaconJson = createDiscoveryBeacon(device);
    assert.ok(beaconJson.includes('"alias":"AnF Studio Laptop"'));
    assert.ok(beaconJson.includes('"download":true'));

    const parsed = parseDiscoveryBeacon(beaconJson);
    assert.ok(parsed !== null);
    assert.equal(parsed.alias, 'AnF Studio Laptop');
    assert.equal(parsed.deviceType, 'desktop');
    assert.equal(parsed.fingerprint, 'fp-sha256-abcdef123456');
  });

  await t.test('rejects malformed or incomplete beacons', () => {
    assert.equal(parseDiscoveryBeacon('not-json'), null);
    assert.equal(parseDiscoveryBeacon('{}'), null);
    assert.equal(parseDiscoveryBeacon('{"alias":"test"}'), null);
  });
});

test('LocalSend Suite - Binary Chunk Framing & Deframing', async (t) => {
  await t.test('frames payload with magic and deframes intact', () => {
    const rawData = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const frame = frameChunk(42, rawData);
    assert.equal(frame.byteLength, 12 + 6);

    const deframed = deframeChunk(frame);
    assert.ok(deframed !== null);
    assert.equal(deframed.chunkIndex, 42);
    assert.deepEqual(deframed.data, rawData);
  });

  await t.test('rejects corrupted frames with invalid magic or truncated bytes', () => {
    const badMagic = new Uint8Array(16);
    assert.equal(deframeChunk(badMagic), null);

    const tooShort = new Uint8Array(5);
    assert.equal(deframeChunk(tooShort), null);
  });
});

test('LocalSend Suite - Transfer Request Security Evaluation', async (t) => {
  const baseDevice = {
    alias: 'Sender',
    version: '2.0',
    deviceType: 'mobile' as const,
    fingerprint: 'fp-1',
    port: 53317,
    protocol: 'https' as const,
  };

  await t.test('accepts safe valid transfer request', () => {
    const req = {
      info: baseDevice,
      sessionId: 'sess-100',
      files: {
        'f1': { id: 'f1', fileName: 'chapter1.epub', size: 1024 * 1024, fileType: 'application/epub+zip' },
        'f2': { id: 'f2', fileName: 'notes.md', size: 4096, fileType: 'text/markdown' },
      },
    };

    const evalRes = evaluateTransferRequest(req);
    assert.equal(evalRes.accepted, true);
  });

  await t.test('rejects path traversal attacks in file names', () => {
    const maliciousReq = {
      info: baseDevice,
      sessionId: 'sess-101',
      files: {
        'f1': { id: 'f1', fileName: '../../Windows/System32/payload.dll', size: 500, fileType: 'application/octet-stream' },
      },
    };

    const evalRes = evaluateTransferRequest(maliciousReq);
    assert.equal(evalRes.accepted, false);
    assert.ok(evalRes.reason?.includes('dangerous filename'));
  });

  await t.test('rejects transfers exceeding total size limit', () => {
    const hugeReq = {
      info: baseDevice,
      sessionId: 'sess-102',
      files: {
        'f1': { id: 'f1', fileName: 'huge.iso', size: 5000, fileType: 'application/octet-stream' },
      },
    };

    const evalRes = evaluateTransferRequest(hugeReq, { maxTotalBytes: 1000 });
    assert.equal(evalRes.accepted, false);
    assert.ok(evalRes.reason?.includes('exceeds maximum limit'));
  });
});
