import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisExecutive, isRealWorkspaceDataOnly, setRealWorkspaceDataOnly } from '../src/workspace/jarvis/jarvis-executive';
import { createWorkspaceTeamCard } from '../src/workspace/jarvis/jarvis-command-desk';
import { DEFAULT_SETTINGS } from '../src/core/state';
import { JARVIS_VOICE_PACK } from '../src/workspace/jarvis/voice/jarvis-voice-pack';

describe('Kevo Phase 7.1: Real Workspace Data & Elimination of Fabricated Metrics', () => {
  it('default briefing contains zero hardcoded mock metrics', async () => {
    const exec = new JarvisExecutive();
    const briefing = await exec.generateBriefing();

    // Must never contain the old hardcoded demo figures
    assert.strictEqual(briefing.fullText.includes('30,000'), false, 'no fake $30k MRR');
    assert.strictEqual(briefing.fullText.includes('2459'), false, 'no fake 2459 customers');
    assert.strictEqual(briefing.fullText.includes('18,740'), false, 'no fake 18,740 total subscribers');
    assert.strictEqual(briefing.fullText.includes('475'), false, 'no fake $475 ad spend');
    assert.strictEqual(briefing.fullText.includes('513'), false, 'no fake 513 tests passing');
    assert.strictEqual(briefing.fullText.includes('24,500'), false, 'no fake 24,500 organic reach');
    assert.strictEqual(briefing.summary.includes('30k'), false, 'summary has no fake $30k');

    // Must include verified local workspace chunks
    const names = briefing.chunks.map(c => c.agentName);
    assert.ok(names.includes('Knowledge (Vault)'));
    assert.ok(names.includes('Reading Queue'));
    assert.ok(names.includes('Schedule'));
    assert.ok(names.includes('System & Audio'));

    // Chunks must be flagged as verified local data
    for (const chunk of briefing.chunks) {
      assert.strictEqual(chunk.verified, true, `chunk ${chunk.agentName} has verified flag`);
    }
  });

  it('omits external business and marketing cards when not configured or marked demo', async () => {
    const exec = new JarvisExecutive();
    const briefing = await exec.generateBriefing({}, {
      revenue: { mrr: 3_000_000, newCustomers7d: 2459, activeSubscribers: 18740, isDemo: true },
      ads: { totalSpend: 47500, roas: 1.5, activeCampaigns: 3, isDemo: true },
      support: { greeting: 'Support ops', summary: { open: 4, autoResolved: 13, satisfactionScore: 4.3 }, recommendation: 'Good', isDemo: true },
      developer: { greeting: 'Tom', health: { buildStatus: 'clean', testsPassing: 513, testsTotal: 513 }, recommendation: 'Clean', isDemo: true },
      content: { greeting: 'Scout', metrics: { videosPostedThisWeek: 3, organicReachEstimate: 24500 }, recommendation: 'Scale', isDemo: true },
    });

    const names = briefing.chunks.map(c => c.agentName);
    assert.ok(!names.includes('Revenue'), 'demo revenue omitted');
    assert.ok(!names.includes('Ads'), 'demo ads omitted');
    assert.ok(!names.includes('Support'), 'demo support omitted');
    assert.ok(!names.includes('Developer'), 'demo developer omitted');
    assert.ok(!names.includes('Growth & Content'), 'demo content omitted');
  });

  it('accurately integrates real local vault and reading telemetry', async () => {
    const exec = new JarvisExecutive();
    const briefing = await exec.generateBriefing({}, {
      vault: { totalNotes: 42, recentNotes7d: 5, status: 'encrypted' },
      reading: { pendingItems: 7, inProgress: 2, estimatedMinutesRemaining: 35 },
    });

    const vaultChunk = briefing.chunks.find(c => c.agentName === 'Knowledge (Vault)');
    assert.ok(vaultChunk);
    assert.ok(vaultChunk.greeting.includes('42 notes indexed'));
    assert.ok(vaultChunk.details.some(d => d.includes('5 notes modified')));
    assert.ok(vaultChunk.details.some(d => d.includes('encrypted')));

    const readingChunk = briefing.chunks.find(c => c.agentName === 'Reading Queue');
    assert.ok(readingChunk);
    assert.ok(readingChunk.greeting.includes('7 items waiting'));
    assert.ok(readingChunk.details.some(d => d.includes('2 items currently in progress')));
    assert.ok(readingChunk.details.some(d => d.includes('35 minutes')));

    assert.ok(briefing.summary.includes('Vault: 42'));
    assert.ok(briefing.summary.includes('Reading: 7'));
  });

  it('accurately integrates real schedule and system telemetry', async () => {
    const exec = new JarvisExecutive();
    const briefing = await exec.generateBriefing({}, {
      schedule: { remindersToday: 3, nextReminderTime: '2:30 PM', dailyBriefingScheduled: true, dailyBriefingTime: '8:00 AM' },
      system: { audioEngineStatus: 'playing', activeTrack: 'Miles Davis - So What', volume: 0.8, memoryUsedMb: 128 },
    });

    const schedChunk = briefing.chunks.find(c => c.agentName === 'Schedule');
    assert.ok(schedChunk);
    assert.ok(schedChunk.greeting.includes('3 reminders scheduled'));
    assert.ok(schedChunk.details.some(d => d.includes('Next reminder at 2:30 PM')));
    assert.ok(schedChunk.details.some(d => d.includes('Daily briefing active for 8:00 AM')));

    const sysChunk = briefing.chunks.find(c => c.agentName === 'System & Audio');
    assert.ok(sysChunk);
    assert.ok(sysChunk.greeting.includes('Miles Davis - So What'));
    assert.ok(sysChunk.details.some(d => d.includes('80%')));
    assert.ok(sysChunk.details.some(d => d.includes('128 MB')));

    assert.ok(briefing.summary.includes('Reminders: 3'));
  });

  it('renders verified badges on summary cards in UI', async () => {
    const exec = new JarvisExecutive();
    const briefing = await exec.generateBriefing({}, {
      vault: { totalNotes: 10 },
      reading: { pendingItems: 2 },
    });

    const card = exec.renderSummaryCard(briefing);
    assert.ok(card.innerHTML.includes('Verified Local Data'));
    assert.ok(card.innerHTML.includes('Knowledge (Vault)'));
    assert.ok(card.innerHTML.includes('Reading Queue'));
  });

  it('includes external revenue only when explicitly verified as non-demo', async () => {
    const exec = new JarvisExecutive();
    const briefing = await exec.generateBriefing({}, {
      revenue: { mrr: 1_200_000, newCustomers7d: 15, activeSubscribers: 120, isDemo: false },
    });

    const revChunk = briefing.chunks.find(c => c.agentName === 'Revenue');
    assert.ok(revChunk, 'real revenue chunk included');
    assert.ok(revChunk.greeting.includes('$12,000'));
    assert.ok(revChunk.details.some(d => d.includes('15 new customers')));
  });

  it('Phase 7.2: createWorkspaceTeamCard renders truthful cards with verified local data badges', () => {
    if (typeof document === 'undefined') {
      const g = globalThis as any;
      g.document = {
        createElement: (tag: string) => ({
          className: '',
          innerHTML: '',
          style: {},
          setAttribute: () => {},
        }),
      };
    }
    const card = createWorkspaceTeamCard({
      title: 'Knowledge',
      role: 'Vault & Notes',
      badge: '✓ Verified Local Data',
      metrics: [
        { label: 'Notes', value: '42' },
        { label: 'Index', value: 'BM25' },
      ],
    });
    assert.ok(card);
    assert.ok(card.innerHTML.includes('Knowledge'));
    assert.ok(card.innerHTML.includes('42'));
    assert.ok(card.innerHTML.includes('Verified Local Data'));
  });

  describe('Phase 7.4: Settings & Owner Voice Selection Controls', () => {
    it('isRealWorkspaceDataOnly toggles cleanly and persists via setter', () => {
      const initial = isRealWorkspaceDataOnly();
      setRealWorkspaceDataOnly(true);
      assert.strictEqual(isRealWorkspaceDataOnly(), true);
      setRealWorkspaceDataOnly(false);
      assert.strictEqual(isRealWorkspaceDataOnly(), false);
      setRealWorkspaceDataOnly(initial); // restore
    });

    it('briefing with realDataOnly: true excludes external business telemetry even if non-demo', async () => {
      const exec = new JarvisExecutive();
      const briefing = await exec.generateBriefing({ realDataOnly: true }, {
        vault: { totalNotes: 10 },
        revenue: { mrr: 5_000_000, newCustomers7d: 500, activeSubscribers: 10000, isDemo: false },
        ads: { totalSpend: 50000, roas: 2.0, activeCampaigns: 2, isDemo: false },
      });

      const names = briefing.chunks.map(c => c.agentName);
      assert.ok(names.includes('Knowledge (Vault)'));
      assert.ok(!names.includes('Revenue'), 'revenue chunk suppressed in real-data-only mode');
      assert.ok(!names.includes('Ads'), 'ads chunk suppressed in real-data-only mode');
    });

    it('DEFAULT_SETTINGS contains owner voice preferences and real-data-only defaults', () => {
      assert.strictEqual(DEFAULT_SETTINGS.kevoVoiceId, 'kelvin-mwamburi');
      assert.strictEqual(DEFAULT_SETTINGS.kevoRealWorkspaceDataOnly, true);
      assert.strictEqual(DEFAULT_SETTINGS.kevoOnlineVoices, true);
      assert.ok(JARVIS_VOICE_PACK.some(v => v.id === DEFAULT_SETTINGS.kevoVoiceId));
    });
  });

  describe('Phase 7.5: Automated Verification & Integrity Test Suite', () => {
    it('omits missing data sources cleanly without throwing errors', async () => {
      const exec = new JarvisExecutive();
      // Pass empty agent data
      const b1 = await exec.generateBriefing({}, {});
      assert.ok(b1);
      assert.strictEqual(typeof b1.fullText, 'string');
      assert.ok(!b1.fullText.includes('undefined'));
      assert.ok(!b1.fullText.includes('NaN'));

      // Pass completely undefined
      const b2 = await exec.generateBriefing();
      assert.ok(b2);
      assert.ok(!b2.fullText.includes('undefined'));
      assert.ok(!b2.fullText.includes('NaN'));
    });

    it('enforces zero mock numbers across all option combinations', async () => {
      const exec = new JarvisExecutive();
      const optionPermutations = [
        { includeVault: false },
        { includeReading: false },
        { includeSchedule: false },
        { includeSystem: false },
        { includeVault: true, includeReading: true, includeSchedule: true, includeSystem: true },
        { realDataOnly: true },
        { realDataOnly: false },
      ];

      for (const opts of optionPermutations) {
        const b = await exec.generateBriefing(opts);
        assert.strictEqual(b.fullText.includes('$30,000'), false, 'no fake MRR');
        assert.strictEqual(b.fullText.includes('2459'), false, 'no fake subscriber delta');
        assert.strictEqual(b.fullText.includes('18,740'), false, 'no fake total subscribers');
        assert.strictEqual(b.fullText.includes('$475'), false, 'no fake ad spend');
        assert.strictEqual(b.fullText.includes('513 tests'), false, 'no fake tests passing');
        assert.strictEqual(b.fullText.includes('24,500'), false, 'no fake reach');
      }
    });

    it('summary line concisely aggregates active chunks only', async () => {
      const exec = new JarvisExecutive();
      const b = await exec.generateBriefing({ includeSchedule: false, includeSystem: false }, {
        vault: { totalNotes: 15 },
        reading: { pendingItems: 3 },
      });
      assert.ok(b.summary.includes('Vault: 15'));
      assert.ok(b.summary.includes('Reading: 3'));
      assert.ok(!b.summary.includes('Reminders:'));
    });
  });
});
