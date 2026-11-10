import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TomDeveloperAgent } from '../src/workspace/jarvis/agents/tom-developer';
import { ScoutGrowthAgent } from '../src/workspace/jarvis/agents/scout-growth';
import { SupportOperationsAgent } from '../src/workspace/jarvis/agents/support-agent';

describe('TomDeveloperAgent', () => {
  let tom: TomDeveloperAgent;
  beforeEach(() => { tom = new TomDeveloperAgent(); });

  it('addTask creates a task with correct fields', () => {
    const t = tom.addTask('bug-fix', 'Fix login crash', 'high');
    assert.strictEqual(t.type, 'bug-fix');
    assert.strictEqual(t.title, 'Fix login crash');
    assert.strictEqual(t.priority, 'high');
    assert.strictEqual(t.status, 'pending');
    assert.ok(t.id.startsWith('tom-'));
  });

  it('updateTask changes status', () => {
    const t = tom.addTask('feature', 'Add dark mode');
    const ok = tom.updateTask(t.id, { status: 'in-progress' });
    assert.ok(ok);
    assert.strictEqual(tom.listTasks('in-progress')[0]?.id, t.id);
  });

  it('removeTask removes it', () => {
    const t = tom.addTask('test', 'Write test');
    assert.ok(tom.removeTask(t.id));
    assert.strictEqual(tom.listTasks().find(x => x.id === t.id), undefined);
  });

  it('checkCodeHealth returns clean build', async () => {
    const h = await tom.checkCodeHealth();
    assert.strictEqual(h.buildStatus, 'clean');
    assert.strictEqual(h.typeErrorCount, 0);
    assert.strictEqual(h.testsPassing, h.testsTotal);
  });

  it('generateBriefing includes greeting and recommendation', async () => {
    const b = await tom.generateBriefing();
    assert.ok(b.greeting.length > 0);
    assert.ok(b.recommendation.length > 0);
  });
});

describe('ScoutGrowthAgent', () => {
  let scout: ScoutGrowthAgent;
  beforeEach(() => { scout = new ScoutGrowthAgent(); });

  it('addContentPlan creates plan', () => {
    const p = scout.addContentPlan({
      platform: 'youtube',
      format: 'short-video',
      title: 'AI tools 2026',
      angle: 'tools that cut my workflow by 80%',
      dueAt: Date.now() + 86400000,
      status: 'planned',
      estimatedReach: 5000,
    });
    assert.ok(p.id.startsWith('scout-'));
    assert.strictEqual(p.platform, 'youtube');
  });

  it('getWeeklyMetrics returns positive numbers', () => {
    const m = scout.getWeeklyMetrics();
    assert.ok(m.videosPostedThisWeek >= 0);
    assert.ok(m.organicReachEstimate > 0);
    assert.ok(m.avgEngagementRate >= 0 && m.avgEngagementRate <= 1);
  });

  it('suggestAngles returns N angles', () => {
    const angles = scout.suggestAngles(2);
    assert.strictEqual(angles.length, 2);
  });

  it('generateBriefing returns structured data', async () => {
    const b = await scout.generateBriefing();
    assert.ok(b.greeting.length > 0);
    assert.ok(b.metrics.recommendedNextAngle.length > 0);
  });
});

describe('SupportOperationsAgent', () => {
  let support: SupportOperationsAgent;
  beforeEach(() => { support = new SupportOperationsAgent(); });

  it('getSummary totals conversations correctly', () => {
    const s = support.getSummary();
    assert.strictEqual(s.total, s.open + s.pending + s.resolved);
  });

  it('autoTriage resolves pattern-matched conversations', () => {
    const support2 = new SupportOperationsAgent([
      {
        id: 'test-1',
        contactName: 'Test User',
        channel: 'support',
        status: 'open',
        subject: 'Password help',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        messages: [{
          id: 'msg-1',
          sender: 'contact',
          senderName: 'Test User',
          text: 'I forgot my password how do I reset it?',
          timestamp: new Date().toISOString(),
        }],
      }
    ]);
    const resolved = support2.autoTriage();
    assert.ok(resolved >= 1, 'at least 1 resolved');
    const reply = support2.getAutoReply('test-1');
    assert.ok(typeof reply === 'string' && reply.length > 0);
  });

  it('getTopIssues returns array', () => {
    const issues = support.getTopIssues();
    assert.ok(Array.isArray(issues));
  });

  it('generateBriefing returns valid briefing', async () => {
    const b = await support.generateBriefing();
    assert.ok(b.greeting.length > 0);
    assert.ok(b.summary.total > 0);
  });
});
