import { describe, it, expect } from 'vitest';
import { isNewsRequest } from '../src/workspace/jarvis/voice/kevo-news';
import { parseAlarmRequest } from '../src/workspace/jarvis/voice/kevo-alarm';
import { parseCreatePlaylist, isListPlaylists } from '../src/workspace/jarvis/voice/kevo-playlists';

describe('Kevo new features', () => {
  it('detects news requests', () => {
    expect(isNewsRequest("what's the news")).toBe(true);
    expect(isNewsRequest("news headlines")).toBe(true);
    expect(isNewsRequest("play music")).toBe(false);
  });

  it('parses alarm times', () => {
    expect(parseAlarmRequest('set an alarm for 7 am')).toEqual({ hour: 7, minute: 0 });
    expect(parseAlarmRequest('wake me at 6:30 pm')).toEqual({ hour: 18, minute: 30 });
    expect(parseAlarmRequest('set alarm for 25:00')).toBeNull();
  });

  it('parses playlist commands', () => {
    expect(parseCreatePlaylist('create playlist called Workout')).toBe('Workout');
    expect(isListPlaylists('list my playlists')).toBe(true);
  });
});
