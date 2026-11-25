// Basic smoke tests for the three new discovery actions (offline-friendly mocks would go here).
// Run with the project's test runner when available.

import { getActionByName } from './kevo-actions';

describe('Kevo discovery actions', () => {
  it('registers search_open_library', () => {
    const action = getActionByName('search_open_library');
    expect(action).toBeDefined();
    expect(action?.name).toBe('search_open_library');
  });

  it('registers search_itunes_music', () => {
    const action = getActionByName('search_itunes_music');
    expect(action).toBeDefined();
  });

  it('registers search_radio_stations', () => {
    const action = getActionByName('search_radio_stations');
    expect(action).toBeDefined();
  });
});
