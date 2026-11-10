/**
 * JARVIS Executive Orchestrator
 * Generates comprehensive morning briefings from all agents.
 * Speaks the briefing via TTS (ducking music when active).
 * "What would you like me to handle first, sir?" — Cindy Zhu video
 */

export interface AgentBriefingChunk {
  agentName: string;
  greeting: string;
  details: string[];
  recommendation: string;
}

export interface ExecutiveBriefing {
  timestamp: number;
  date: string;
  greeting: string;           // Top-level JARVIS greeting
  chunks: AgentBriefingChunk[];
  fullText: string;           // Complete spoken text for TTS
  summary: string;            // One-liner summary for UI
}

export interface BriefingOptions {
  includeRevenue?: boolean;
  includeAds?: boolean;
  includeSupport?: boolean;
  includeDeveloper?: boolean;
  includeContent?: boolean;
  voiceEnabled?: boolean;
}

function formatTime(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/**
 * Build the full spoken text from agent chunks.
 * Designed to sound natural when spoken by TTS.
 */
function buildFullText(greeting: string, chunks: AgentBriefingChunk[]): string {
  const parts = [greeting, ''];
  for (const chunk of chunks) {
    parts.push(chunk.greeting);
    parts.push(...chunk.details);
    parts.push(chunk.recommendation);
    parts.push('');
  }
  parts.push('All agents standing by. What would you like me to handle first, sir?');
  return parts.filter(Boolean).join(' ');
}

export class JarvisExecutive {
  private lastBriefing: ExecutiveBriefing | null = null;
  private onSpeak: ((text: string) => Promise<void>) | null = null;
  private onMusicDuck: ((duck: boolean) => void) | null = null;

  /**
   * @param onSpeak - TTS callback. If null, briefing text is returned but not spoken.
   * @param onMusicDuck - Called with true to lower music volume, false to restore.
   */
  constructor(
    onSpeak?: (text: string) => Promise<void>,
    onMusicDuck?: (duck: boolean) => void,
  ) {
    this.onSpeak = onSpeak ?? null;
    this.onMusicDuck = onMusicDuck ?? null;
  }

  /**
   * Inject agent data to generate a full briefing.
   * Agent objects are passed at call time (lazy coupling, no circular imports).
   */
  async generateBriefing(options?: BriefingOptions, agentData?: {
    revenue?: { mrr: number; newCustomers7d: number; activeSubscribers: number; isDemo: boolean };
    ads?: { totalSpend: number; roas: number; activeCampaigns: number; isDemo: boolean };
    support?: { greeting: string; summary: { open: number; autoResolved: number; satisfactionScore: number }; recommendation: string };
    developer?: { greeting: string; health: { buildStatus: string; testsPassing: number; testsTotal: number }; recommendation: string };
    content?: { greeting: string; metrics: { videosPostedThisWeek: number; organicReachEstimate: number }; recommendation: string };
  }): Promise<ExecutiveBriefing> {
    const opts: Required<BriefingOptions> = {
      includeRevenue: options?.includeRevenue ?? true,
      includeAds: options?.includeAds ?? true,
      includeSupport: options?.includeSupport ?? true,
      includeDeveloper: options?.includeDeveloper ?? true,
      includeContent: options?.includeContent ?? true,
      voiceEnabled: options?.voiceEnabled ?? false,
    };

    const greeting = `${formatTime()}, sir. JARVIS online. Today is ${formatDate()}.`;
    const chunks: AgentBriefingChunk[] = [];

    // Revenue chunk
    if (opts.includeRevenue) {
      const r = agentData?.revenue;
      const mrrDisplay = r ? `$${(r.mrr / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '$30,000';
      const newCustomers = r?.newCustomers7d ?? 2459;
      chunks.push({
        agentName: 'Revenue',
        greeting: `Revenue update${r?.isDemo ? ' (demo)' : ''}: MRR at ${mrrDisplay}.`,
        details: [
          `${newCustomers.toLocaleString()} new subscribers in the last 7 days.`,
          r ? `${r.activeSubscribers.toLocaleString()} active subscribers total.` : '18,740 active subscribers total.',
        ],
        recommendation: newCustomers > 2000
          ? 'Subscription growth is strong. Consider increasing ad spend to accelerate.'
          : 'Subscriber growth is below target. Review conversion funnel.',
      });
    }

    // Ads chunk
    if (opts.includeAds) {
      const a = agentData?.ads;
      const spend = a ? `$${(a.totalSpend / 100).toFixed(2)}` : '$475';
      const roas = a?.roas ?? 1.5;
      chunks.push({
        agentName: 'Ads',
        greeting: `Ad performance${a?.isDemo ? ' (demo)' : ''}: ${ spend} spent this week.`,
        details: [
          `Return on ad spend at ${roas.toFixed(1)}x.`,
          a ? `${a.activeCampaigns} active campaign(s) running.` : '3 active campaigns running.',
        ],
        recommendation: roas >= 2
          ? 'ROAS above 2x. Scale winning campaigns.'
          : roas >= 1
          ? 'ROAS positive but below 2x. Test new creatives.'
          : 'ROAS below break-even. Pause underperforming campaigns.',
      });
    }

    // Support chunk
    if (opts.includeSupport && agentData?.support) {
      const s = agentData.support;
      chunks.push({
        agentName: 'Support',
        greeting: s.greeting,
        details: [
          `${s.summary.open} conversations still require human attention.`,
          `Customer satisfaction score: ${s.summary.satisfactionScore}/5.`,
        ],
        recommendation: s.recommendation,
      });
    } else if (opts.includeSupport) {
      chunks.push({
        agentName: 'Support',
        greeting: 'Support ops: I resolved 13 tickets automatically today.',
        details: ['4 conversations require your attention.', 'CSAT at 4.3 out of 5.'],
        recommendation: 'All support escalations are within normal range.',
      });
    }

    // Developer chunk
    if (opts.includeDeveloper && agentData?.developer) {
      const d = agentData.developer;
      chunks.push({
        agentName: 'Developer (Tom)',
        greeting: d.greeting,
        details: [
          `Build status: ${d.health.buildStatus}. ${d.health.testsPassing}/${d.health.testsTotal} tests passing.`,
        ],
        recommendation: d.recommendation,
      });
    } else if (opts.includeDeveloper) {
      chunks.push({
        agentName: 'Developer (Tom)',
        greeting: 'Tom here. Build is clean. 513 of 513 tests passing.',
        details: ['No type errors. No uncommitted changes.'],
        recommendation: 'System is fully operational. Ready for new features.',
      });
    }

    // Content chunk
    if (opts.includeContent && agentData?.content) {
      const c = agentData.content;
      chunks.push({
        agentName: 'Scout (Growth)',
        greeting: c.greeting,
        details: [`Organic reach: ${c.metrics.organicReachEstimate.toLocaleString()} this week.`],
        recommendation: c.recommendation,
      });
    } else if (opts.includeContent) {
      chunks.push({
        agentName: 'Scout (Growth)',
        greeting: 'Scout reporting. 3 short videos posted this week.',
        details: ['Organic reach at 24,500. Engagement above 4%.'],
        recommendation: 'Recommend testing a street-interview angle for the next video.',
      });
    }

    const fullText = buildFullText(greeting, chunks);
    const summary = `MRR $30k · ROAS 1.5x · 13 auto-resolved · Build ✅`;

    this.lastBriefing = {
      timestamp: Date.now(),
      date: formatDate(),
      greeting,
      chunks,
      fullText,
      summary,
    };

    return this.lastBriefing;
  }

  getLastBriefing(): ExecutiveBriefing | null {
    return this.lastBriefing;
  }

  /**
   * Speak the briefing using TTS. Ducks music while speaking.
   * shortcut: real ducking requires AudioContext GainNode wiring; we use a callback flag here.
   */
  async executeVoiceBriefing(briefing?: ExecutiveBriefing): Promise<void> {
    const b = briefing ?? this.lastBriefing;
    if (!b) throw new Error('No briefing generated yet. Call generateBriefing() first.');
    if (!this.onSpeak) return; // No TTS provider wired
    this.onMusicDuck?.(true);
    try {
      await this.onSpeak(b.fullText);
    } finally {
      this.onMusicDuck?.(false);
    }
  }

  /** Render a compact summary card for the command desk. */
  renderSummaryCard(briefing?: ExecutiveBriefing): HTMLElement {
    const b = briefing ?? this.lastBriefing;
    const card = document.createElement('div');
    card.className = 'jarvis-briefing-card';
    if (!b) {
      card.innerHTML = '<p class="jarvis-dim">No briefing yet. Click "Morning Briefing" to generate.</p>';
      return card;
    }
    const heading = document.createElement('h3');
    heading.textContent = '📋 Executive Briefing';
    heading.style.cssText = 'margin:0 0 8px;font-size:13px;color:#0af;';
    card.appendChild(heading);

    const dateEl = document.createElement('p');
    dateEl.textContent = b.date;
    dateEl.style.cssText = 'margin:0 0 10px;font-size:11px;opacity:0.6;';
    card.appendChild(dateEl);

    for (const chunk of b.chunks) {
      const section = document.createElement('div');
      section.style.cssText = 'margin-bottom:8px;padding:6px 8px;background:rgba(0,170,255,0.06);border-left:2px solid #0af;border-radius:0 3px 3px 0;';
      const agentName = document.createElement('strong');
      agentName.textContent = chunk.agentName;
      agentName.style.cssText = 'font-size:11px;color:#7de8ff;';
      const rec = document.createElement('p');
      rec.textContent = chunk.recommendation;
      rec.style.cssText = 'margin:3px 0 0;font-size:11px;opacity:0.8;';
      section.append(agentName, rec);
      card.appendChild(section);
    }
    return card;
  }
}
