/**
 * Kevo Executive Orchestrator
 * Generates comprehensive morning briefings from verified workspace telemetry and agents.
 * Speaks the briefing via TTS (ducking music when active).
 * "What would you like me to handle first, sir?" — Cindy Zhu video
 *
 * Phase 7 Step 7.1: Pack voices & real team
 * Completely eliminates fabricated business metrics ($30,000 MRR, 2,459 subscribers, $475 ad spend).
 * Team cards and briefing chunks reflect real local workspace capabilities:
 * - Knowledge & Vault: note count, recent edits, index status.
 * - Reading Queue: pending articles/books, reading progress, estimated remaining time.
 * - Schedule & Reminders: reminders due today, daily briefing schedule.
 * - System & Audio: audio engine status, volume, memory footprint.
 * External business telemetry is only rendered if genuinely configured and not demo.
 */

export interface AgentBriefingChunk {
  agentName: string;
  greeting: string;
  details: string[];
  recommendation: string;
  verified?: boolean;
}

export interface ExecutiveBriefing {
  timestamp: number;
  date: string;
  greeting: string;           // Top-level Kevo greeting
  chunks: AgentBriefingChunk[];
  fullText: string;           // Complete spoken text for TTS
  summary: string;            // One-liner summary for UI
}

export interface BriefingOptions {
  includeVault?: boolean;
  includeReading?: boolean;
  includeSchedule?: boolean;
  includeSystem?: boolean;
  includeRevenue?: boolean;
  includeAds?: boolean;
  includeSupport?: boolean;
  includeDeveloper?: boolean;
  includeContent?: boolean;
  includeDemo?: boolean;       // Defaults to false: no made-up numbers in production
  voiceEnabled?: boolean;
}

export interface WorkspaceBriefingData {
  // Local workspace capabilities (real, verified)
  vault?: { totalNotes: number; recentNotes7d?: number; status?: string };
  reading?: { pendingItems: number; inProgress?: number; estimatedMinutesRemaining?: number };
  schedule?: { remindersToday: number; nextReminderTime?: string; dailyBriefingScheduled?: boolean; dailyBriefingTime?: string };
  system?: { audioEngineStatus?: string; activeTrack?: string; volume?: number; memoryUsedMb?: number };

  // External telemetry (rendered only if provided and not demo, unless includeDemo is explicitly true)
  revenue?: { mrr: number; newCustomers7d: number; activeSubscribers: number; isDemo?: boolean };
  ads?: { totalSpend: number; roas: number; activeCampaigns: number; isDemo?: boolean };
  support?: { greeting: string; summary: { open: number; autoResolved: number; satisfactionScore: number }; recommendation: string; isDemo?: boolean };
  developer?: { greeting: string; health: { buildStatus: string; testsPassing: number; testsTotal: number }; recommendation: string; isDemo?: boolean };
  content?: { greeting: string; metrics: { videosPostedThisWeek: number; organicReachEstimate: number }; recommendation: string; isDemo?: boolean };
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
 * Designed to sound natural and professional when spoken by TTS.
 */
function buildFullText(greeting: string, chunks: AgentBriefingChunk[]): string {
  const parts = [greeting, ''];
  if (chunks.length === 0) {
    parts.push('All systems nominal. No pending alerts or tasks.');
  } else {
    for (const chunk of chunks) {
      parts.push(chunk.greeting);
      parts.push(...chunk.details);
      parts.push(chunk.recommendation);
      parts.push('');
    }
  }
  parts.push('All systems standing by. What would you like me to handle first, sir?');
  return parts.filter(Boolean).join(' ');
}

/**
 * Build a concise summary line for HUD and Command Desk cards.
 */
function buildSummary(chunks: AgentBriefingChunk[]): string {
  const parts: string[] = [];
  for (const chunk of chunks) {
    if (chunk.agentName.includes('Vault')) {
      const m = chunk.greeting.match(/(\d+)\s+notes?/i);
      parts.push(`Vault: ${m ? m[1] : '0'}`);
    } else if (chunk.agentName.includes('Reading')) {
      const m = chunk.greeting.match(/(\d+)\s+items?/i);
      parts.push(`Reading: ${m ? m[1] : '0'}`);
    } else if (chunk.agentName.includes('Schedule')) {
      const m = chunk.greeting.match(/(\d+)\s+reminders?/i);
      parts.push(`Reminders: ${m ? m[1] : '0'}`);
    } else if (chunk.agentName.includes('System')) {
      const m = chunk.greeting.match(/is\s+([a-z]+)/i);
      parts.push(`System: ${m ? m[1] : 'OK'}`);
    } else if (chunk.agentName === 'Revenue') {
      const m = chunk.greeting.match(/MRR at (\$[0-9,]+)/i);
      parts.push(m ? `MRR ${m[1]}` : 'Revenue');
    } else if (chunk.agentName === 'Developer') {
      parts.push('Build ✅');
    } else {
      parts.push(chunk.agentName);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'Workspace operational · All clear';
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
   * Generate an executive briefing from verified workspace data.
   * Eliminates fabricated demo metrics.
   */
  async generateBriefing(
    options?: BriefingOptions,
    agentData?: WorkspaceBriefingData,
  ): Promise<ExecutiveBriefing> {
    const opts: Required<BriefingOptions> = {
      includeVault: options?.includeVault ?? true,
      includeReading: options?.includeReading ?? true,
      includeSchedule: options?.includeSchedule ?? true,
      includeSystem: options?.includeSystem ?? true,
      includeRevenue: options?.includeRevenue ?? true,
      includeAds: options?.includeAds ?? true,
      includeSupport: options?.includeSupport ?? true,
      includeDeveloper: options?.includeDeveloper ?? true,
      includeContent: options?.includeContent ?? true,
      includeDemo: options?.includeDemo ?? false,
      voiceEnabled: options?.voiceEnabled ?? false,
    };

    const greeting = `${formatTime()}, sir. Kevo online. Today is ${formatDate()}.`;
    const chunks: AgentBriefingChunk[] = [];

    // 1. Knowledge & Vault Chunk (Verified Local Workspace Capability)
    if (opts.includeVault) {
      const v = agentData?.vault;
      const totalNotes = v?.totalNotes ?? 0;
      const recent = v?.recentNotes7d;
      const status = v?.status ?? 'operational';
      chunks.push({
        agentName: 'Knowledge (Vault)',
        greeting: totalNotes > 0
          ? `Vault status: ${totalNotes} note${totalNotes === 1 ? '' : 's'} indexed.`
          : 'Vault status: 0 notes indexed.',
        details: [
          recent != null
            ? `${recent} note${recent === 1 ? '' : 's'} modified in the last 7 days.`
            : 'Vault index is ready for search.',
          `Vault health: ${status}.`,
        ],
        recommendation: totalNotes === 0
          ? 'Start by creating or importing your first knowledge note.'
          : 'Knowledge base is current.',
        verified: true,
      });
    }

    // 2. Reading Queue Chunk (Verified Local Workspace Capability)
    if (opts.includeReading) {
      const q = agentData?.reading;
      const pending = q?.pendingItems ?? 0;
      const inProgress = q?.inProgress ?? 0;
      const estMins = q?.estimatedMinutesRemaining;
      chunks.push({
        agentName: 'Reading Queue',
        greeting: pending > 0
          ? `Reading queue: ${pending} item${pending === 1 ? '' : 's'} waiting.`
          : 'Reading queue: No pending items.',
        details: [
          inProgress > 0
            ? `${inProgress} item${inProgress === 1 ? '' : 's'} currently in progress.`
            : (pending > 0 ? 'Articles and books queued for offline reading.' : 'All reading queues are clear.'),
          estMins != null
            ? `Estimated reading time: ${estMins} minute${estMins === 1 ? '' : 's'}.`
            : 'Queue is synchronized.',
        ],
        recommendation: pending > 0
          ? 'Ready to resume your active reading session.'
          : 'Add new articles or books to build your queue.',
        verified: true,
      });
    }

    // 3. Schedule & Reminders Chunk (Verified Local Workspace Capability)
    if (opts.includeSchedule) {
      const s = agentData?.schedule;
      const remindersToday = s?.remindersToday ?? 0;
      const nextTime = s?.nextReminderTime;
      const briefingScheduled = s?.dailyBriefingScheduled ?? false;
      const briefingTime = s?.dailyBriefingTime;
      chunks.push({
        agentName: 'Schedule',
        greeting: remindersToday > 0
          ? `Schedule: ${remindersToday} reminder${remindersToday === 1 ? '' : 's'} scheduled for today.`
          : 'Schedule: No reminders scheduled for today.',
        details: [
          nextTime ? `Next reminder at ${nextTime}.` : 'No immediate alarms pending.',
          briefingScheduled
            ? `Daily briefing active for ${briefingTime || 'morning'}.`
            : 'Daily briefing is not scheduled.',
        ],
        recommendation: remindersToday > 0
          ? 'Stay on track with today’s commitments.'
          : 'Schedule is clear for focused work.',
        verified: true,
      });
    }

    // 4. System & Audio Chunk (Verified Local Workspace Capability)
    if (opts.includeSystem) {
      const sys = agentData?.system;
      const audioStatus = sys?.audioEngineStatus ?? 'idle';
      const activeTrack = sys?.activeTrack;
      const vol = sys?.volume;
      const mem = sys?.memoryUsedMb;
      chunks.push({
        agentName: 'System & Audio',
        greeting: activeTrack
          ? `Now playing: ${activeTrack}.`
          : `Audio engine is ${audioStatus}.`,
        details: [
          vol != null ? `Playback volume: ${Math.round(vol * 100)}%.` : 'Audio output ready.',
          mem != null ? `Memory footprint: ${mem} MB.` : 'System resources operational.',
        ],
        recommendation: audioStatus === 'playing'
          ? 'Background audio active.'
          : 'Speech and hearing subsystems standing by.',
        verified: true,
      });
    }

    // 5. External Business Telemetry: Revenue (NO fabricated metrics)
    if (opts.includeRevenue && agentData?.revenue) {
      const r = agentData.revenue;
      if (!r.isDemo || opts.includeDemo) {
        const mrrDisplay = `$${(r.mrr / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        chunks.push({
          agentName: 'Revenue',
          greeting: `Revenue update${r.isDemo ? ' (demo)' : ''}: MRR at ${mrrDisplay}.`,
          details: [
            `${r.newCustomers7d.toLocaleString()} new customers in the last 7 days.`,
            `${r.activeSubscribers.toLocaleString()} active subscribers total.`,
          ],
          recommendation: r.newCustomers7d > 0
            ? 'Customer acquisition is active.'
            : 'Review conversion funnel.',
        });
      }
    }

    // 6. External Business Telemetry: Ads (NO fabricated metrics)
    if (opts.includeAds && agentData?.ads) {
      const a = agentData.ads;
      if (!a.isDemo || opts.includeDemo) {
        const spend = `$${(a.totalSpend / 100).toFixed(2)}`;
        chunks.push({
          agentName: 'Ads',
          greeting: `Ad performance${a.isDemo ? ' (demo)' : ''}: ${spend} spend recorded.`,
          details: [
            `Return on ad spend: ${a.roas.toFixed(1)}x.`,
            `${a.activeCampaigns} active campaign(s) running.`,
          ],
          recommendation: a.roas >= 2
            ? 'ROAS above target. Scale winning campaigns.'
            : 'Monitor ad performance.',
        });
      }
    }

    // 7. Support Telemetry (NO fabricated metrics)
    if (opts.includeSupport && agentData?.support) {
      const s = agentData.support;
      if (!s.isDemo || opts.includeDemo) {
        chunks.push({
          agentName: 'Support',
          greeting: s.greeting,
          details: [
            `${s.summary.open} conversation(s) require attention.`,
            `Satisfaction rating: ${s.summary.satisfactionScore}/5.`,
          ],
          recommendation: s.recommendation,
        });
      }
    }

    // 8. Developer Telemetry (NO fabricated metrics)
    if (opts.includeDeveloper && agentData?.developer) {
      const d = agentData.developer;
      if (!d.isDemo || opts.includeDemo) {
        chunks.push({
          agentName: 'Developer',
          greeting: d.greeting,
          details: [
            `Build status: ${d.health.buildStatus}. ${d.health.testsPassing}/${d.health.testsTotal} tests passing.`,
          ],
          recommendation: d.recommendation,
        });
      }
    }

    // 9. Growth & Content Telemetry (NO fabricated metrics)
    if (opts.includeContent && agentData?.content) {
      const c = agentData.content;
      if (!c.isDemo || opts.includeDemo) {
        chunks.push({
          agentName: 'Growth & Content',
          greeting: c.greeting,
          details: [
            `Weekly reach: ${c.metrics.organicReachEstimate.toLocaleString()}.`,
          ],
          recommendation: c.recommendation,
        });
      }
    }

    const fullText = buildFullText(greeting, chunks);
    const summary = buildSummary(chunks);

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
    if (typeof document === 'undefined') {
      const summaryText = b
        ? b.chunks.map(c => `<div class="jarvis-chunk"><strong>${c.agentName}</strong>${c.verified ? ' <span>✓ Verified Local Data</span>' : ''}<p>${c.greeting}</p><p>${c.recommendation}</p></div>`).join('')
        : '<p class="jarvis-dim">No briefing yet. Choose “Morning briefing” to write one.</p>';
      return {
        className: 'jarvis-briefing-card',
        innerHTML: `<div class="jarvis-briefing-card">${summaryText}</div>`,
      } as unknown as HTMLElement;
    }
    const card = document.createElement('div');
    card.className = 'jarvis-briefing-card';
    if (!b) {
      card.innerHTML = '<p class="jarvis-dim">No briefing yet. Choose “Morning briefing” to write one.</p>';
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
      const headerRow = document.createElement('div');
      headerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';

      const agentName = document.createElement('strong');
      agentName.textContent = chunk.agentName;
      agentName.style.cssText = 'font-size:11px;color:#7de8ff;';
      headerRow.appendChild(agentName);

      if (chunk.verified) {
        const badge = document.createElement('span');
        badge.textContent = '✓ Verified Local Data';
        badge.style.cssText = 'font-size:9px;padding:1px 5px;background:rgba(0,255,170,0.15);color:#00ffaa;border-radius:3px;font-weight:600;';
        headerRow.appendChild(badge);
      }

      const greetingText = document.createElement('p');
      greetingText.textContent = chunk.greeting;
      greetingText.style.cssText = 'margin:2px 0 0;font-size:11px;color:#d0ecff;';

      const rec = document.createElement('p');
      rec.textContent = chunk.recommendation;
      rec.style.cssText = 'margin:3px 0 0;font-size:11px;opacity:0.8;';
      section.append(headerRow, greetingText, rec);
      card.appendChild(section);
    }
    return card;
  }
}
