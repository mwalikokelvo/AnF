import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  THINGSBOOK_VOICE_PROTOCOL_VERSION,
  createVoiceItem,
  validateVoiceItem,
  validateVoiceBriefing,
  validateVoiceReminder,
  validateVoicePackage,
  serializeThingsBookVoicePackage,
  deserializeThingsBookVoicePackage,
  packageVoiceMemos,
  exportVoicePackage,
  importVoicePackage,
  extractVoicePackageSummary,
  mergeVoicePackages,
  mergeVoicePackagesWithReport,
  OfflineVoiceSyncQueue,
  type ThingsBookVoicePackage,
} from '../src/workspace/jarvis/thingsbook-voice';
import { toVoiceWire, fromVoiceWire } from '../../android/web/sync';

describe('Phase 9 Step 9.1: ThingsBook Voice Contract & Serialization Specs', () => {
  it('createVoiceItem produces contract-compliant voice item with checksum', () => {
    const item = createVoiceItem({
      id: 'voice-note-001',
      timestamp: 1773830400000,
      durationMs: 4500,
      transcript: 'Meeting with product lead scheduled for 3 PM.',
      audioMime: 'audio/wav',
      tags: ['work', 'calendar'],
    });

    assert.strictEqual(item.id, 'voice-note-001');
    assert.strictEqual(item.timestamp, 1773830400000);
    assert.strictEqual(item.durationMs, 4500);
    assert.strictEqual(item.transcript, 'Meeting with product lead scheduled for 3 PM.');
    assert.strictEqual(item.audioMime, 'audio/wav');
    assert.deepStrictEqual(item.tags, ['work', 'calendar']);
    assert.ok(item.checksum.length >= 32, 'Checksum has valid hash length');
    assert.strictEqual(validateVoiceItem(item), true);
  });

  it('validates briefing and reminder records strictly', () => {
    const validBriefing = {
      id: 'briefing-2026-11-18',
      date: '2026-11-18',
      summary: 'All systems operational. 3 reminders pending.',
      chunks: [{ title: 'Vault', text: '120 notes indexed', source: 'local_db' }],
      generatedAt: 1773830000000,
    };
    assert.strictEqual(validateVoiceBriefing(validBriefing), true);

    // Invalid date format fails
    const invalidBriefing = { ...validBriefing, date: '18-11-2026' };
    assert.strictEqual(validateVoiceBriefing(invalidBriefing), false);

    const validReminder = {
      id: 'rem-101',
      message: 'Call warehouse supplier',
      triggerAt: 1773835000000,
      completed: false,
      createdAt: 1773830000000,
    };
    assert.strictEqual(validateVoiceReminder(validReminder), true);

    // Missing message fails
    assert.strictEqual(validateVoiceReminder({ ...validReminder, message: '' }), false);
  });

  it('round-trips full ThingsBookVoicePackage through lossless serialization', () => {
    const pkg: ThingsBookVoicePackage = {
      version: THINGSBOOK_VOICE_PROTOCOL_VERSION,
      exportedAt: 1773830100000,
      deviceId: 'anf-pc-01',
      items: [
        createVoiceItem({
          id: 'item-1',
          timestamp: 1773830000000,
          durationMs: 2500,
          transcript: 'Turn off office lights',
        }),
      ],
      briefings: [
        {
          id: 'b-1',
          date: '2026-11-18',
          summary: 'Quiet evening.',
          chunks: [{ title: 'Audio', text: 'Engine idle', source: 'dsp' }],
          generatedAt: 1773830050000,
        },
      ],
      reminders: [
        {
          id: 'r-1',
          message: 'Review pull request',
          triggerAt: 1773836000000,
          completed: true,
          createdAt: 1773820000000,
        },
      ],
    };

    assert.strictEqual(validateVoicePackage(pkg), true);
    const serialized = serializeThingsBookVoicePackage(pkg);
    assert.ok(typeof serialized === 'string');

    const deserialized = deserializeThingsBookVoicePackage(serialized);
    assert.deepStrictEqual(deserialized, pkg);
  });

  it('rejects unsupported protocol versions with clear error message', () => {
    const invalidJson = JSON.stringify({
      version: 'thingsbook-voice-v999',
      exportedAt: 1773830000000,
      deviceId: 'device-x',
      items: [],
      briefings: [],
      reminders: [],
    });

    assert.throws(
      () => deserializeThingsBookVoicePackage(invalidJson),
      /Unsupported ThingsBook voice protocol version "thingsbook-voice-v999"/
    );
  });

  it('rejects corrupted or truncated JSON payloads', () => {
    assert.throws(
      () => deserializeThingsBookVoicePackage('{ "version": "thingsbook-voice-v1", items: [ truncated...'),
      /Failed to parse ThingsBookVoicePackage JSON/
    );
  });
});

describe('Phase 9 Step 9.2: Cross-Device Voice Artifact Packaging & Exchange', () => {
  it('packageVoiceMemos bundles artifacts into validated ThingsBookVoicePackage', () => {
    const item = createVoiceItem({
      id: 'memo-10',
      timestamp: 1773831000000,
      durationMs: 3200,
      transcript: 'Drafting new proposal',
      audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
    });

    const pkg = packageVoiceMemos({
      deviceId: 'desk-companion-tablet',
      items: [item],
      now: 1773832000000,
    });

    assert.strictEqual(pkg.version, THINGSBOOK_VOICE_PROTOCOL_VERSION);
    assert.strictEqual(pkg.deviceId, 'desk-companion-tablet');
    assert.strictEqual(pkg.exportedAt, 1773832000000);
    assert.strictEqual(pkg.items.length, 1);
  });

  it('exportVoicePackage formats .anfvoice file with correct MIME and filename', () => {
    const pkg = packageVoiceMemos({
      deviceId: 'anf-laptop',
      items: [],
      now: 1773830400000,
    });

    const exported = exportVoicePackage(pkg);
    assert.ok(exported.filename.startsWith('kevo-voice-anf-laptop-'));
    assert.ok(exported.filename.endsWith('.anfvoice'));
    assert.strictEqual(exported.mime, 'application/vnd.thingsbook.voice+json');
    assert.ok(exported.size > 0);

    const reimported = importVoicePackage(exported.data);
    assert.strictEqual(reimported.deviceId, 'anf-laptop');
  });

  it('extractVoicePackageSummary counts artifacts and audio bytes accurately', () => {
    const audioData = 'A'.repeat(400); // 400 base64 chars = 300 bytes
    const item1 = createVoiceItem({
      id: 'i-1',
      timestamp: 1773830000000,
      durationMs: 1000,
      transcript: 'First',
      audioBase64: audioData,
    });
    const item2 = createVoiceItem({
      id: 'i-2',
      timestamp: 1773835000000,
      durationMs: 2000,
      transcript: 'Second',
    });

    const pkg = packageVoiceMemos({
      items: [item1, item2],
      briefings: [{
        id: 'b-1',
        date: '2026-11-18',
        summary: 'Good progress.',
        chunks: [],
        generatedAt: 1773830000000,
      }],
      reminders: [{
        id: 'r-1',
        message: 'Reminder',
        triggerAt: 1773840000000,
        completed: false,
        createdAt: 1773830000000,
      }],
    });

    const summary = extractVoicePackageSummary(pkg);
    assert.strictEqual(summary.itemCount, 2);
    assert.strictEqual(summary.briefingCount, 1);
    assert.strictEqual(summary.reminderCount, 1);
    assert.strictEqual(summary.totalAudioBytes, 300);
    assert.strictEqual(summary.latestItemTimestamp, 1773835000000);
  });

  it('toVoiceWire and fromVoiceWire in android/web/sync.ts round-trip cleanly', () => {
    const pkg = packageVoiceMemos({ deviceId: 'phone-01' });
    const wire = toVoiceWire(pkg);
    const parsed = fromVoiceWire(wire);
    assert.deepStrictEqual(parsed, pkg);

    assert.throws(
      () => toVoiceWire({ version: 'bad-version' }),
      /Invalid ThingsBook voice package version/
    );
  });
});

describe('Phase 9 Step 9.3: Conflict Resolution & Offline Fault Tolerance', () => {
  it('mergeVoicePackagesWithReport resolves divergent transcripts via deterministic LWW', () => {
    const baseItem = createVoiceItem({
      id: 'conflict-note-1',
      timestamp: 1000,
      durationMs: 2000,
      transcript: 'Draft note on PC',
    });
    const incomingItem = createVoiceItem({
      id: 'conflict-note-1',
      timestamp: 2000,
      durationMs: 2500,
      transcript: 'Draft note updated on Phone',
    });

    const basePkg = packageVoiceMemos({ deviceId: 'pc', items: [baseItem] });
    const incomingPkg = packageVoiceMemos({ deviceId: 'phone', items: [incomingItem] });

    const result = mergeVoicePackagesWithReport(basePkg, incomingPkg);
    assert.strictEqual(result.package.items.length, 1);
    assert.strictEqual(result.package.items[0].transcript, 'Draft note updated on Phone');
    assert.strictEqual(result.conflicts.length, 1);
    assert.strictEqual(result.conflicts[0].id, 'conflict-note-1');
    assert.strictEqual(result.conflicts[0].strategy, 'last-write-wins');
    assert.strictEqual(result.conflicts[0].divergentItem.transcript, 'Draft note on PC');
  });

  it('mergeVoicePackages applies monotonic completion to voice reminders', () => {
    const baseReminder = {
      id: 'rem-sync-1',
      message: 'Buy coffee beans',
      triggerAt: 5000,
      completed: false,
      createdAt: 1000,
    };
    const incomingReminder = {
      id: 'rem-sync-1',
      message: 'Buy coffee beans',
      triggerAt: 5000,
      completed: true,
      createdAt: 1000,
    };

    const basePkg = packageVoiceMemos({ reminders: [baseReminder] });
    const incomingPkg = packageVoiceMemos({ reminders: [incomingReminder] });

    const merged = mergeVoicePackages(basePkg, incomingPkg);
    assert.strictEqual(merged.reminders.length, 1);
    assert.strictEqual(merged.reminders[0].completed, true);
  });

  it('OfflineVoiceSyncQueue manages queue and failure tracking safely', () => {
    const queue = new OfflineVoiceSyncQueue();
    assert.strictEqual(queue.size(), 0);

    const item1 = createVoiceItem({
      id: 'q-1',
      timestamp: 100,
      durationMs: 1000,
      transcript: 'First offline memo',
    });
    queue.enqueue(item1);
    assert.strictEqual(queue.size(), 1);

    // Enqueue updated item with newer timestamp replaces in place
    const item1v2 = createVoiceItem({
      id: 'q-1',
      timestamp: 200,
      durationMs: 1200,
      transcript: 'First offline memo (edited)',
    });
    queue.enqueue(item1v2);
    assert.strictEqual(queue.size(), 1);
    assert.strictEqual(queue.peek()[0].transcript, 'First offline memo (edited)');

    // Failure tracking
    queue.recordFailure();
    queue.recordFailure();
    assert.strictEqual(queue.getFailedAttempts(), 2);

    // Acknowledge removes synced items and resets failure count
    queue.acknowledge(['q-1']);
    assert.strictEqual(queue.size(), 0);
    assert.strictEqual(queue.getFailedAttempts(), 0);
  });
});
