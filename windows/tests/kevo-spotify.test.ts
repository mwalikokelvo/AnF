import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSpotifySearchRequest, spotifySearchUrl } from '../src/workspace/jarvis/voice/kevo-spotify';
import { JarvisVoiceAgent, type JarvisActionContext } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

describe('Kevo Spotify search', () => {
  it('detects search requests', () => {
    assert.equal(isSpotifySearchRequest('search spotify for queen'), 'queen');
    assert.equal(isSpotifySearchRequest('spotify bohemian rhapsody'), 'bohemian rhapsody');
    assert.equal(isSpotifySearchRequest('play on spotify the beatles'), 'the beatles');
    assert.equal(isSpotifySearchRequest('what is the weather'), null);
  });

  it('builds public search URL', () => {
    assert.equal(spotifySearchUrl('queen'), 'https://open.spotify.com/search/queen');
    assert.equal(spotifySearchUrl('bohemian rhapsody'), 'https://open.spotify.com/search/bohemian%20rhapsody');
  });

  it('opens Spotify search via agent', async () => {
    const urls: string[] = [];
    const agent = new JarvisVoiceAgent({
      openUrl: async (url) => { urls.push(url); },
      dryRun: false,
    } as JarvisActionContext);
    const result = await agent.handle('search spotify for queen');
    assert.equal(result.handled, true);
    assert.equal(result.actionName, 'spotify_search');
    assert.ok(result.speechReply?.includes('queen'));
    assert.deepEqual(urls, ['https://open.spotify.com/search/queen']);
  });
});
