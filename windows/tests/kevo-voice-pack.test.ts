import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JARVIS_VOICE_PACK,
  getSelectedVoiceId,
  getSelectedVoiceProfile,
  setSelectedVoiceId,
  verifyVoicePackRegistry,
  playVoicePreview,
  voicePackUrl,
} from '../src/workspace/jarvis/voice/jarvis-voice-pack';
import { JarvisSpeaker } from '../src/workspace/jarvis/voice/jarvis-speaker';

const root = fileURLToPath(new URL('../', import.meta.url));
const voicePackDir = path.join(root, 'voice-pack');

describe('Kevo Phase 7.3: Voice Pack Pipeline & Local Audio Previews', () => {
  it('contains exactly 13 voice profiles in registry', () => {
    const reg = verifyVoicePackRegistry();
    assert.strictEqual(reg.total, 13);
    assert.strictEqual(reg.valid, true);
    assert.strictEqual(reg.profiles.length, 13);
  });

  it('default voice is Kelvin Mwamburi / Kevo (Gentle Bass)', () => {
    // Reset selection to default
    setSelectedVoiceId('kelvin-mwamburi');
    const selectedId = getSelectedVoiceId();
    assert.strictEqual(selectedId, 'kelvin-mwamburi');

    const profile = getSelectedVoiceProfile();
    assert.strictEqual(profile.id, 'kelvin-mwamburi');
    assert.ok(profile.name.includes('Kevo'));
    assert.ok(profile.name.includes('Gentle Bass'));
    assert.strictEqual(profile.filename, 'Kevo - gentle bass.mp3');
  });

  it('every registered voice profile has an existing MP3 file in windows/voice-pack', () => {
    for (const profile of JARVIS_VOICE_PACK) {
      assert.ok(profile.id, 'profile has id');
      assert.ok(profile.name, 'profile has name');
      assert.ok(profile.filename, 'profile has filename');
      assert.ok(profile.gender === 'female' || profile.gender === 'male', 'gender is female or male');

      const fullPath = path.join(voicePackDir, profile.filename);
      assert.strictEqual(existsSync(fullPath), true, `File exists on disk: ${profile.filename}`);
    }
  });

  it('voice filenames match SOURCES.txt documentation', () => {
    const sourcesPath = path.join(voicePackDir, 'SOURCES.txt');
    assert.strictEqual(existsSync(sourcesPath), true);
    const content = readFileSync(sourcesPath, 'utf8');
    assert.ok(content.includes('Kevo - gentle bass.mp3'));
    assert.ok(content.includes('13 recordings'));
  });

  it('voicePackUrl encodes filenames properly', () => {
    const url = voicePackUrl('Kevo - gentle bass.mp3');
    assert.ok(url.startsWith('/voice-pack/'));
    assert.ok(url.includes('Kevo%20-%20gentle%20bass.mp3'));
  });

  it('playVoicePreview delegates to speaker and returns preview result', async () => {
    const mockSpeaker = {
      playVoicePreview: async (id: string) => ({
        success: true,
        fallbackUsed: false,
        profile: JARVIS_VOICE_PACK.find(v => v.id === id)!,
      }),
    };
    const res = await playVoicePreview('burt-deep-smooth', mockSpeaker);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.fallbackUsed, false);
    assert.strictEqual(res.profile.id, 'burt-deep-smooth');
  });

  it('playVoicePreview falls back gracefully when audio snippet cannot be played', async () => {
    // In Node test environment, new Audio() is undefined, so JarvisSpeaker exercises fallback path
    const speaker = new JarvisSpeaker();
    const res = await speaker.playVoicePreview('kelvin-mwamburi');
    assert.ok(res);
    assert.strictEqual(res.profile.id, 'kelvin-mwamburi');
    // Without browser DOM audio, fallback path was exercised cleanly without throwing
    assert.strictEqual(res.fallbackUsed, true);
    assert.strictEqual(res.success, true);
  });
});
