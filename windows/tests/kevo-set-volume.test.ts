import { describe, it, expect } from 'vitest';
import { KEVO_ACTIONS } from '../src/workspace/jarvis/voice/kevo-actions';

describe('Kevo set_volume', () => {
  it('sets volume when supported', async () => {
    const action = KEVO_ACTIONS.find(a => a.name === 'set_volume');
    expect(action).toBeDefined();
    const ctx = {
      dryRun: false,
      setVolume: async (level: number) => { expect(level).toBe(70); },
    };
    const result = await action!.execute({ level: 70 }, ctx as any);
    expect(result.handled).toBe(true);
    expect(result.speechReply).toContain('70');
  });

  it('reports not supported when no setter', async () => {
    const action = KEVO_ACTIONS.find(a => a.name === 'set_volume');
    const result = await action!.execute({ level: 50 }, {} as any);
    expect(result.handled).toBe(false);
    expect(result.speechReply).toContain('not available');
  });
});
