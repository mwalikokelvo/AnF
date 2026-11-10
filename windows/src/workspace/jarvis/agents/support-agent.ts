/**
 * Support Operations Agent
 * Triages conversations from Chatwoot inbox, auto-resolves common issues,
 * surfaces critical escalations.
 * "I resolved 13 automatically, mostly [billing questions]" — Cindy Zhu video
 */
import {
  type ChatwootConversation,
  type ConversationStatus,
  INITIAL_CONVERSATIONS,
} from '../../chatwoot-inbox';

export interface SupportSummary {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  autoResolved: number;         // Auto-resolved in this session
  avgResponseTimeMinutes: number;
  criticalEscalations: Array<{ id: string; subject: string; reason: string }>;
  satisfactionScore: number;    // 0-5
}

export interface SupportBriefing {
  greeting: string;
  summary: SupportSummary;
  topIssues: string[];
  recommendation: string;
}

/** Patterns that JARVIS can auto-resolve with a canned reply. */
const AUTO_RESOLVE_PATTERNS: Array<{ pattern: RegExp; reply: string }> = [
  {
    pattern: /how.*(cancel|unsubscribe|refund)/i,
    reply: 'You can cancel or request a refund from Settings → Subscription. Reply if you need further help.',
  },
  {
    pattern: /password|forgot|reset|login/i,
    reply: 'Use the "Forgot password?" link on the sign-in screen. Check your spam folder if you don\'t see the email.',
  },
  {
    pattern: /offline|no internet|not connect/i,
    reply: 'AnF works fully offline. Download content when connected; it\'s available offline afterward.',
  },
  {
    pattern: /epub|pdf|import|upload/i,
    reply: 'Go to Documents → Import. We support EPUB, PDF, TXT, and DOCX files up to 50 MB.',
  },
];

function matchAutoResolve(text: string): string | null {
  for (const { pattern, reply } of AUTO_RESOLVE_PATTERNS) {
    if (pattern.test(text)) return reply;
  }
  return null;
}

export class SupportOperationsAgent {
  private conversations: ChatwootConversation[];
  private autoResolvedCount = 0;
  private autoReplies: Map<string, string> = new Map();

  constructor(conversations?: ChatwootConversation[]) {
    this.conversations = conversations ? [...conversations] : [...INITIAL_CONVERSATIONS];
  }

  loadConversations(convs: ChatwootConversation[]): void {
    this.conversations = [...convs];
  }

  /**
   * Run auto-triage: scan open conversations, attempt auto-resolution.
   * Returns the number of conversations auto-resolved.
   */
  autoTriage(): number {
    let resolved = 0;
    for (const conv of this.conversations) {
      if (conv.status !== 'open') continue;
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (!lastMsg || lastMsg.sender !== 'contact') continue;
      const reply = matchAutoResolve(lastMsg.text);
      if (reply) {
        this.autoReplies.set(conv.id, reply);
        (conv as any).status = 'resolved' as ConversationStatus;
        resolved++;
        this.autoResolvedCount++;
      }
    }
    return resolved;
  }

  getAutoReply(convId: string): string | undefined {
    return this.autoReplies.get(convId);
  }

  getSummary(): SupportSummary {
    const open = this.conversations.filter(c => c.status === 'open').length;
    const pending = this.conversations.filter(c => c.status === 'pending').length;
    const resolved = this.conversations.filter(c => c.status === 'resolved').length;
    const criticalEscalations = this.conversations
      .filter(c => c.status === 'open' && c.tags.some(t => ['billing', 'urgent', 'critical', 'escalation'].includes(t)))
      .map(c => ({
        id: c.id,
        subject: c.subject,
        reason: `Tagged: ${c.tags.filter(t => ['billing', 'urgent', 'critical'].includes(t)).join(', ')}`,
      }));
    return {
      total: this.conversations.length,
      open,
      pending,
      resolved,
      autoResolved: this.autoResolvedCount,
      avgResponseTimeMinutes: 12,
      criticalEscalations,
      satisfactionScore: 4.3,
    };
  }

  getTopIssues(): string[] {
    const tagCounts: Record<string, number> = {};
    for (const c of this.conversations) {
      for (const tag of c.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => `${tag} (${count})`);
  }

  async generateBriefing(): Promise<SupportBriefing> {
    const autoResolved = this.autoTriage();
    const summary = this.getSummary();
    const topIssues = this.getTopIssues();
    return {
      greeting: `Support ops here. I resolved ${autoResolved} automatically. ${summary.open} conversations still open.`,
      summary,
      topIssues,
      recommendation: summary.criticalEscalations.length > 0
        ? `⚠️ ${summary.criticalEscalations.length} critical escalation(s) need your attention: "${summary.criticalEscalations[0].subject}"`
        : `All clear. CSAT at ${summary.satisfactionScore}/5. Avg response time ${summary.avgResponseTimeMinutes} min.`,
    };
  }

  renderStatusCard(): HTMLElement {
    const summary = this.getSummary();
    const card = document.createElement('div');
    card.className = 'jarvis-agent-card jarvis-agent-support';
    card.innerHTML = `
      <div class="agent-header">
        <span class="agent-avatar" aria-hidden="true">🎧</span>
        <span class="agent-name">Support Ops</span>
        <span class="agent-role">Support Agent</span>
      </div>
      <div class="agent-body">
        <div class="agent-metric"><span>Open</span><strong>${summary.open}</strong></div>
        <div class="agent-metric"><span>Auto-resolved</span><strong>${summary.autoResolved}</strong></div>
        <div class="agent-metric"><span>CSAT</span><strong>${summary.satisfactionScore}/5</strong></div>
      </div>
    `;
    return card;
  }
}
