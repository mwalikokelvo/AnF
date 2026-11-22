import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEVO_ACTIONS } from '../src/workspace/jarvis/voice/kevo-actions';

describe('Kevo roll_dice', () => {
  it('is registered as an action', () => {
    const action = KEVO_ACTIONS.find(a => a.name === 'roll_dice');
    assert.ok(action, 'roll_dice action exists');
    assert.equal(action.description.includes('dice'), true);
  });

  it('rolls a single die by default', async () => {
    const action = KEVO_ACTIONS.find(a => a.name === 'roll_dice')!;
    const result = await action.execute({}, {} as any);
    assert.equal(result.handled, true);
    assert.equal(result.status, 'success');
    assert.match(result.speechReply, /You rolled a \d+, sir\./);
    assert.ok(result.data?.rolls?.length === 1);
    assert.ok(result.data.rolls[0] >= 1 && result.data.rolls[0] <= 6);
  });

  it('rolls multiple dice with custom sides', async () => {
    const action = KEVO_ACTIONS.find(a => a.name === 'roll_dice')!;
    const result = await action.execute({ count: 3, sides: 20 }, {} as any);
    assert.equal(result.handled, true);
    assert.match(result.speechReply, /total of \d+/);
    assert.equal(result.data?.rolls?.length, 3);
    assert.ok(result.data.rolls.every((r: number) => r >= 1 && r <= 20));
  });
});
