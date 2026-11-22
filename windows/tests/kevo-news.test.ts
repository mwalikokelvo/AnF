import { parseNewsRequest, formatNewsReply } from '../src/workspace/jarvis/voice/kevo-news';

describe('kevo-news', () => {
  test('parses news requests', () => {
    expect(parseNewsRequest("what's the news")).toBe(true);
    expect(parseNewsRequest('news headlines')).toBe(true);
    expect(parseNewsRequest('tell me the news')).toBe(true);
    expect(parseNewsRequest('play music')).toBe(false);
  });

  test('formats empty and full replies', () => {
    expect(formatNewsReply([])).toContain('could not find');
    const reply = formatNewsReply([{ title: 'Test headline' }]);
    expect(reply).toContain('1. Test headline');
  });
});
