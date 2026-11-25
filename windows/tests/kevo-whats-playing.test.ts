import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWhatsPlaying,
  isWhatsPlayingRequest,
  type CurrentTrack,
} from '../src/workspace/jarvis/voice/kevo-whats-playing';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { executeKevoAction } from '../src/workspace/jarvis/voice/kevo-actions';

describe("Kevo: What's playing?", () => {
  it('formats currently playing track correctly', () => {
    assert.equal(formatWhatsPlaying(null), 'Nothing is playing right now, sir.');
    assert.equal(formatWhatsPlaying(undefined), 'Nothing is playing right now, sir.');
    assert.equal(formatWhatsPlaying({ title: '' }), 'Nothing is playing right now, sir.');
    assert.equal(formatWhatsPlaying({ title: '   ' }), 'Nothing is playing right now, sir.');

    assert.equal(formatWhatsPlaying({ title: 'Resonance' }), 'Now playing Resonance, sir.');
    assert.equal(
      formatWhatsPlaying({ title: 'Resonance', artist: 'HOME' }),
      'Now playing Resonance by HOME, sir.'
    );
    assert.equal(
      formatWhatsPlaying({ title: 'Resonance', artist: 'HOME', album: 'Odyssey' }),
      'Now playing Resonance by HOME from Odyssey, sir.'
    );
  });

  it('recognizes natural phrases for what is playing', () => {
    assert.equal(isWhatsPlayingRequest("what's playing"), true);
    assert.equal(isWhatsPlayingRequest('what is playing'), true);
    assert.equal(isWhatsPlayingRequest('what is playing right now'), true);
    assert.equal(isWhatsPlayingRequest('what song is this'), true);
    assert.equal(isWhatsPlayingRequest('what track is this'), true);
    assert.equal(isWhatsPlayingRequest("what's this song"), true);
    assert.equal(isWhatsPlayingRequest('what are we listening to'), true);
    assert.equal(isWhatsPlayingRequest('current song'), true);
    assert.equal(isWhatsPlayingRequest('who is singing'), true);

    // Bare request handling ("Kevo, what's playing?")
    assert.equal(isWhatsPlayingRequest("kevo, what's playing?"), true);
    assert.equal(isWhatsPlayingRequest('can you tell me what song is this please'), true);

    // Non-matches
    assert.equal(isWhatsPlayingRequest('play bohemian rhapsody'), false);
    assert.equal(isWhatsPlayingRequest('pause music'), false);
    assert.equal(isWhatsPlayingRequest('what time is it'), false);
  });

  it('integrates with JarvisVoiceAgent', async () => {
    let currentTrack: CurrentTrack | null = {
      title: 'Midnight City',
      artist: 'M83',
      album: 'Hurry Up, We\'re Dreaming',
    };

    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      getCurrentTrack: () => currentTrack,
    });

    const res1 = await agent.processVoiceInput("Kevo, what's playing?");
    assert.equal(res1.handled, true);
    assert.equal(res1.actionName, 'whats_playing');
    assert.equal(res1.speechReply, "Now playing Midnight City by M83 from Hurry Up, We're Dreaming, sir.");

    currentTrack = null;
    const res2 = await agent.processVoiceInput('What song is this?');
    assert.equal(res2.handled, true);
    assert.equal(res2.actionName, 'whats_playing');
    assert.equal(res2.speechReply, 'Nothing is playing right now, sir.');
  });

  it('executes whats_playing action via executeKevoAction', async () => {
    const context = {
      switchView: () => {},
      getCurrentTrack: () => ({ title: 'Starlight', artist: 'Muse' }),
    };

    const result = await executeKevoAction('whats_playing', {}, context);
    assert.equal(result.handled, true);
    assert.equal(result.actionName, 'whats_playing');
    assert.equal(result.speechReply, 'Now playing Starlight by Muse, sir.');
    assert.equal(result.status, 'success');
  });
});
