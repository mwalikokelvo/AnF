import { todayInHistory } from '../src/workspace/jarvis/voice/kevo-history';

// Basic smoke test: function exists and handles bad dates.
describe('todayInHistory', () => {
  it('returns null for invalid date', async () => {
    const result = await todayInHistory(13, 32);
    expect(result).toBeNull();
  });
});
