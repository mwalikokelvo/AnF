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
    assert.ok(b.fullText.length > 50, 'fullText is substantial');
    assert.ok(b.fullText.includes('sir'), 'fullText contains "sir"');
  });

  it('chunks represent real local workspace capabilities by default with zero made-up numbers', async () => {
    const exec = new JarvisExecutive();
    const b = await exec.generateBriefing();
    const names = b.chunks.map(c => c.agentName);
    assert.ok(names.some(n => n.includes('Vault') || n.includes('Knowledge')));
    assert.ok(names.some(n => n.includes('Reading')));
    assert.ok(names.some(n => n.includes('Schedule')));
    assert.ok(names.some(n => n.includes('System')));
    // Fictional metrics MUST NOT appear anywhere
    assert.ok(!b.fullText.includes('30,000'), 'no fake $30k MRR');
    assert.ok(!b.fullText.includes('2459'), 'no fake subscriber count');
    assert.ok(!b.fullText.includes('18,740'), 'no fake total subscribers');
    assert.ok(!b.fullText.includes('$475'), 'no fake ad spend');
  });

  it('omits external business telemetry when missing or marked demo', async () => {
    const exec = new JarvisExecutive();
    const b = await exec.generateBriefing({}, {
      revenue: { mrr: 3_000_000, newCustomers7d: 2459, activeSubscribers: 18740, isDemo: true },
      ads: { totalSpend: 47500, roas: 1.5, activeCampaigns: 3, isDemo: true },
    });
    const names = b.chunks.map(c => c.agentName);
    assert.ok(!names.some(n => n === 'Revenue'), 'demo revenue omitted');
    assert.ok(!names.some(n => n === 'Ads'), 'demo ads omitted');
  });

  it('includes external business telemetry when verified and non-demo', async () => {
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

  it('summary is a non-empty string and reflects actual chunks', async () => {
    const exec = new JarvisExecutive();
    const b = await exec.generateBriefing({}, {
      vault: { totalNotes: 15, status: 'operational' },
      reading: { pendingItems: 4 },
      schedule: { remindersToday: 2 },
    });
    assert.ok(b.summary.includes('Vault: 15'));
    assert.ok(b.summary.includes('Reading: 4'));
    assert.ok(b.summary.includes('Reminders: 2'));
  });

  it('renderSummaryCard produces elements with verified local badges', async () => {
    const exec = new JarvisExecutive();
    const b = await exec.generateBriefing({}, {
      vault: { totalNotes: 5 },
    });
    const card = exec.renderSummaryCard(b);
    assert.ok(card.innerHTML.includes('Verified Local Data'));
  });
});
