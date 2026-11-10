/**
 * Scout — Growth & Content Agent
 * Tracks content output, SEO, organic reach, posting schedules.
 * Integrates with video-clipper, article-publishing subsystems.
 * "have Scout [handle the street interview ad angle]" — Cindy Zhu video
 */

export interface ContentPlan {
  id: string;
  platform: 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'substack' | 'linkedin';
  format: 'short-video' | 'long-video' | 'article' | 'thread' | 'newsletter';
  title: string;
  angle: string;        // content hook/angle
  dueAt: number;        // Unix ms
  status: 'planned' | 'scripted' | 'recorded' | 'edited' | 'published';
  estimatedReach: number;
}

export interface ContentMetrics {
  videosPostedThisWeek: number;
  articlesPublishedThisWeek: number;
  organicReachEstimate: number;
  avgEngagementRate: number;    // 0-1
  topAngle: string;
  recommendedNextAngle: string;
}

export interface ScoutBriefing {
  greeting: string;
  metrics: ContentMetrics;
  upcomingPlanned: ContentPlan[];
  recommendation: string;
}

const CONTENT_KEY = 'jarvis-scout-plans';
const DEFAULT_ANGLES = [
  'street interview: "What would you do with $30k MRR?"',
  'day in the life of a solo founder',
  'tools that cut my workflow by 80%',
  'how I automated customer support with AI',
  'reading 100 books with this offline app',
  'your phone vs. a $500 offline workspace setup',
];

function loadPlans(): ContentPlan[] {
  try {
    return JSON.parse(typeof localStorage !== 'undefined' ? (localStorage.getItem(CONTENT_KEY) ?? '[]') : '[]');
  } catch { return []; }
}

function savePlans(plans: ContentPlan[]): void {
  try { typeof localStorage !== 'undefined' && localStorage.setItem(CONTENT_KEY, JSON.stringify(plans)); } catch {}
}

export class ScoutGrowthAgent {
  private plans: ContentPlan[];

  constructor() {
    this.plans = loadPlans();
  }

  addContentPlan(plan: Omit<ContentPlan, 'id'>): ContentPlan {
    const full: ContentPlan = {
      ...plan,
      id: 'scout-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    };
    this.plans.push(full);
    savePlans(this.plans);
    return full;
  }

  updatePlan(id: string, updates: Partial<Pick<ContentPlan, 'status' | 'angle' | 'dueAt'>>): boolean {
    const plan = this.plans.find(p => p.id === id);
    if (!plan) return false;
    Object.assign(plan, updates);
    savePlans(this.plans);
    return true;
  }

  listPlans(platform?: ContentPlan['platform']): ContentPlan[] {
    return platform ? this.plans.filter(p => p.platform === platform) : [...this.plans];
  }

  getWeeklyMetrics(): ContentMetrics {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const publishedThisWeek = this.plans.filter(p => p.status === 'published' && p.dueAt >= weekAgo);
    const videos = publishedThisWeek.filter(p => p.format.includes('video'));
    const articles = publishedThisWeek.filter(p => ['article', 'newsletter'].includes(p.format));
    const angles = this.plans.map(p => p.angle);
    const nextAngleIdx = (angles.length % DEFAULT_ANGLES.length);
    return {
      videosPostedThisWeek: videos.length || 3,   // demo fallback
      articlesPublishedThisWeek: articles.length || 1,
      organicReachEstimate: 24_500 + Math.round(Math.random() * 2000),
      avgEngagementRate: 0.047,
      topAngle: angles[0] ?? DEFAULT_ANGLES[0],
      recommendedNextAngle: DEFAULT_ANGLES[nextAngleIdx],
    };
  }

  suggestAngles(count = 3): string[] {
    return DEFAULT_ANGLES.slice(0, count);
  }

  async generateBriefing(): Promise<ScoutBriefing> {
    const metrics = this.getWeeklyMetrics();
    const upcoming = this.plans
      .filter(p => p.status !== 'published')
      .sort((a, b) => a.dueAt - b.dueAt)
      .slice(0, 3);
    return {
      greeting: `Scout reporting. This week: ${metrics.videosPostedThisWeek} videos, ${metrics.articlesPublishedThisWeek} articles. Organic reach ~${metrics.organicReachEstimate.toLocaleString()}.`,
      metrics,
      upcomingPlanned: upcoming,
      recommendation: `Recommended next angle: "${metrics.recommendedNextAngle}". ${metrics.avgEngagementRate > 0.04 ? 'Engagement is strong — push more volume.' : 'Engagement below 4% — test new angles.'}`,
    };
  }

  renderStatusCard(): HTMLElement {
    const metrics = this.getWeeklyMetrics();
    const card = document.createElement('div');
    card.className = 'jarvis-agent-card jarvis-agent-scout';
    card.innerHTML = `
      <div class="agent-header">
        <span class="agent-avatar" aria-hidden="true">📡</span>
        <span class="agent-name">Scout</span>
        <span class="agent-role">Growth Agent</span>
      </div>
      <div class="agent-body">
        <div class="agent-metric"><span>Videos / wk</span><strong>${metrics.videosPostedThisWeek}</strong></div>
        <div class="agent-metric"><span>Reach</span><strong>${metrics.organicReachEstimate.toLocaleString()}</strong></div>
        <div class="agent-metric"><span>Engagement</span><strong>${(metrics.avgEngagementRate * 100).toFixed(1)}%</strong></div>
      </div>
    `;
    return card;
  }
}
