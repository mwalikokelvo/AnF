import { parseLyricsRequest } from '../kevo-lyrics';
import { parsePodcastRequest } from '../kevo-podcast';
import { parseRecommendRequest } from '../kevo-recommend';

describe('Kevo new features parsers', () => {
  test('parseLyricsRequest extracts title and artist', () => {
    const r = parseLyricsRequest('what are the lyrics to Yellow by Coldplay');
    expect(r).toEqual({ artist: 'Coldplay', title: 'Yellow' });
  });

  test('parsePodcastRequest extracts topic', () => {
    expect(parsePodcastRequest('search for podcasts about technology')).toBe('technology');
  });

  test('parseRecommendRequest extracts seed', () => {
    expect(parseRecommendRequest('play something like Radiohead')).toBe('Radiohead');
  });
});
