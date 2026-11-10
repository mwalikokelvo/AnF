import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisExecutive } from '../src/workspace/jarvis/jarvis-executive';

describe('JarvisExecutive', () => {
  it('generateBriefing returns a valid briefing', async () => {
    const exec = new JarvisExecutive();
    const b = await exec.generateBriefing();
    assert.ok(b.timestamp > 0);
    assert.ok(b.date.length > 0);
    assert.ok(b.greeting.length > 0);
    assert.ok(b.chunks.length > 0, 'has at least one chunk');
    assert.ok(b.fullText.length > 100, 'fullText is substantial');
    assert.ok(b.fullText.includes('sir'), 'fullText contains "sir"');
  });

  it('chunks include all 5 agents by default', async () => {
    const exec = new JarvisExecutive();
    const b = await exec.generateBriefing();
    const names = b.chunks.map(c => c.agentName);
    assert.ok(names.some(n => n.includes('Revenue')));
    assert.ok(names.some(n => n.includes('Ads')));
    assert.ok(names.some(n => n.includes('Support')));
    assert.ok(names.some(n => n.includes('Tom')));
    assert.ok(names.some(n => n.includes('Scout')));
  });

  it('injecting agent data overrides defaults', async () => {
    const exec = new JarvisExecutive();
    const b = await exec.generateBriefing({}, {
      revenue: { mrr: 5_000_000, newCustomers7d: 500, activeSubscribers: 10000, isDemo: false },
    });
    const revChunk = b.chunks.find(c => c.agentName === 'Revenue');
    assert.ok(revChunk?.greeting.includes('50,000') || revChunk?.greeting.includes('50000'), 'MRR $50k shown');
  });

  it('getLastBriefing returns most recent briefing', async () => {
    const exec = new JarvisExecutive();
    assert.strictEqual(exec.getLastBriefing(), null);
    await exec.generateBriefing();
    assert.notStrictEqual(exec.getLastBriefing(), null);
  });

  it('executeVoiceBriefing calls onSpeak with full text', async () => {
    let spoken = '';
    const exec = new JarvisExecutive(async text => { spoken = text; });
    await exec.generateBriefing();
    await exec.executeVoiceBriefing();
    assert.ok(spoken.length > 50, 'TTS received substantive text');
  });

  it('executeVoiceBriefing ducks and restores music', async () => {
    const duckLog: boolean[] = [];
    const exec = new JarvisExecutive(
      async () => {},
      (duck) => { duckLog.push(duck); },
    );
    await exec.generateBriefing();
    await exec.executeVoiceBriefing();
    assert.deepStrictEqual(duckLog, [true, false], 'music ducked then restored');
  });

  it('executeVoiceBriefing no-ops when no TTS provider', async () => {
    const exec = new JarvisExecutive();
    await exec.generateBriefing();
    await assert.doesNotReject(() => exec.executeVoiceBriefing());
  });

  it('summary is a non-empty string', async () => {
    const exec = new JarvisExecutive();
    const b = await exec.generateBriefing();
    assert.ok(b.summary.length > 0);
  });
});
