import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getActionByName } from '../src/workspace/jarvis/voice/kevo-actions';

describe('Kevo Wikipedia Summary', () => {
  it('has the wikipedia_summary action', () => {
    const action = getActionByName('wikipedia_summary');
    assert.ok(action);
    assert.equal(action.name, 'wikipedia_summary');
  });
});
