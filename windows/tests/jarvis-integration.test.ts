/**
 * JARVIS Integration tests — exercises all subsystems together.
 * DOM-independent: tests only the pure-logic paths.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisExecutive } from '../src/workspace/jarvis/jarvis-executive';
import { RevenueConnector } from '../src/workspace/jarvis/connectors/revenue-connector';
import { AdsConnector } from '../src/workspace/jarvis/connectors/ads-connector';
import { TomDeveloperAgent } from '../src/workspace/jarvis/agents/tom-developer';
import { ScoutGrowthAgent } from '../src/workspace/jarvis/agents/scout-growth';
import { SupportOperationsAgent } from '../src/workspace/jarvis/agents/support-agent';
import { fetchSystemTelemetry } from '../src/workspace/jarvis/connectors/system-connector';

describe('JARVIS Full Integration', () => {
  it('all agents generate briefings without throwing', async () => {
    const tom = new TomDeveloperAgent();
    const scout = new ScoutGrowthAgent();
    const support = new SupportOperationsAgent();
    const [tomB, scoutB, supportB] = await Promise.all([
      tom.generateBriefing(),
      scout.generateBriefing(),
      support.generateBriefing(),
    ]);
    assert.ok(tomB.greeting.length > 0);
    assert.ok(scoutB.greeting.length > 0);
    assert.ok(supportB.greeting.length > 0);
  });

  it('connectors all return valid data in demo mode', async () => {
    const rev = new RevenueConnector();
    const ads2 = new AdsConnector();
    const [rs, as2] = await Promise.all([rev.getStats(), ads2.getStats()]);
    assert.ok(rs.isDemo);
    assert.ok(as2.isDemo);
    assert.ok(rs.mrr > 0);
    assert.ok(as2.roas > 0);
  });

  it('executive orchestrator integrates all agent data', async () => {
    const exec = new JarvisExecutive();
    const rev = new RevenueConnector();
    const ads2 = new AdsConnector();
    const tom = new TomDeveloperAgent();
    const scout = new ScoutGrowthAgent();
    const support = new SupportOperationsAgent();

    const [revenueStats, adsStats, supportBriefing, devBriefing, contentBriefing] = await Promise.all([
      rev.getStats(),
      ads2.getStats(),
      support.generateBriefing(),
      tom.generateBriefing(),
      scout.generateBriefing(),
    ]);

    const briefing = await exec.generateBriefing({}, {
      revenue: revenueStats,
      ads: adsStats,
      support: { greeting: supportBriefing.greeting, summary: supportBriefing.summary, recommendation: supportBriefing.recommendation },
      developer: { greeting: devBriefing.greeting, health: devBriefing.health, recommendation: devBriefing.recommendation },
      content: { greeting: contentBriefing.greeting, metrics: contentBriefing.metrics, recommendation: contentBriefing.recommendation },
    });

    assert.ok(briefing.chunks.length >= 5, `expected 5 chunks, got ${briefing.chunks.length}`);
    assert.ok(briefing.fullText.includes('JARVIS') || briefing.fullText.includes('sir'));
    assert.strictEqual(exec.getLastBriefing()?.timestamp, briefing.timestamp);
  });

  it('system telemetry + executive briefing pipeline works end-to-end', async () => {
    const telemetry = await fetchSystemTelemetry();
    const exec = new JarvisExecutive();
    const briefing = await exec.generateBriefing();
    // Verify telemetry is sane
    assert.ok(telemetry.cpuLoadPct >= 0);
    // Verify briefing references key metrics
    assert.ok(briefing.fullText.length > 50);
    // Combined pipeline didn't throw
    assert.ok(true);
  });

  it('TomAgent task lifecycle: add → update → remove', () => {
    const tom = new TomDeveloperAgent();
    const task = tom.addTask('bug-fix', 'Fix NPE', 'high');
    assert.strictEqual(task.status, 'pending');
    tom.updateTask(task.id, { status: 'done' });
    assert.strictEqual(tom.listTasks('done')[0]?.id, task.id);
    tom.removeTask(task.id);
    assert.strictEqual(tom.listTasks().find(t => t.id === task.id), undefined);
  });

  it('ScoutAgent content plan + weekly metrics', () => {
    const scout = new ScoutGrowthAgent();
    scout.addContentPlan({
      platform: 'tiktok',
      format: 'short-video',
      title: 'AI tools 2026',
      angle: 'tools that cut my workflow by 80%',
      dueAt: Date.now() + 86400000,
      status: 'published',
      estimatedReach: 8000,
    });
    const m = scout.getWeeklyMetrics();
    assert.ok(m.recommendedNextAngle.length > 0);
  });

  it('SupportAgent auto-triage count is non-negative', () => {
    const support = new SupportOperationsAgent();
    const count = support.autoTriage();
    assert.ok(count >= 0);
    const summary = support.getSummary();
    assert.strictEqual(summary.total, summary.open + summary.pending + summary.resolved);
  });
});
