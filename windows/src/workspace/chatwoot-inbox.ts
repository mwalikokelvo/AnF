/**
 * Chatwoot Community & Support Inbox Integration
 * Inspired by chatwoot/chatwoot.
 * Provides offline-first support thread triage, feedback capture,
 * conversation archiving, and 1-click Markdown export.
 */

export type ConversationStatus = 'open' | 'pending' | 'resolved';
export type ChannelType = 'community' | 'feedback' | 'support' | 'reader-note';

export interface ChatMessage {
  id: string;
  sender: 'contact' | 'agent' | 'system';
  senderName: string;
  text: string;
  timestamp: string;
}

export interface ChatwootConversation {
  id: string;
  contactName: string;
  contactEmail?: string;
  channel: ChannelType;
  status: ConversationStatus;
  subject: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  messages: ChatMessage[];
}

const STORAGE_KEY = 'anf-chatwoot-inbox-data';

export const INITIAL_CONVERSATIONS: readonly ChatwootConversation[] = [
  {
    id: 'cw-101',
    contactName: 'Elena Rostova',
    contactEmail: 'elena@example.org',
    channel: 'community',
    status: 'open',
    subject: 'Request: Offline podcast chapter support',
    createdAt: '2026-11-08T07:15:00Z',
    updatedAt: '2026-11-08T07:15:00Z',
    tags: ['podcasting', 'feature-request'],
    messages: [
      {
        id: 'msg-1',
        sender: 'contact',
        senderName: 'Elena Rostova',
        text: 'Does AnF parse the new Podcasting 2.0 chapter markers in RSS enclosures?',
        timestamp: '2026-11-08T07:15:00Z',
      },
    ],
  },
  {
    id: 'cw-102',
    contactName: 'Marcus Vance',
    contactEmail: 'marcus@example.org',
    channel: 'feedback',
    status: 'resolved',
    subject: 'Feedback: Click-free crossfade audio playback',
    createdAt: '2026-11-07T18:30:00Z',
    updatedAt: '2026-11-07T19:00:00Z',
    tags: ['audio', 'appreciation'],
    messages: [
      {
        id: 'msg-2',
        sender: 'contact',
        senderName: 'Marcus Vance',
        text: 'The Web Audio GainNode crossfade transitions between songs sound fantastic!',
        timestamp: '2026-11-07T18:30:00Z',
      },
      {
        id: 'msg-3',
        sender: 'agent',
        senderName: 'AnF Team',
        text: 'Thank you Marcus! We implemented sample-accurate gain automation to ensure zero pops.',
        timestamp: '2026-11-07T19:00:00Z',
      },
    ],
  },
];

export class ChatwootInboxManager {
  private conversations: ChatwootConversation[] = [];

  constructor() {
    this.hydrate();
  }

  private hydrate(): void {
    try {
      if (typeof localStorage === 'undefined') {
        this.conversations = [...INITIAL_CONVERSATIONS];
        return;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.conversations = JSON.parse(raw);
      } else {
        this.conversations = [...INITIAL_CONVERSATIONS];
      }
    } catch {
      this.conversations = [...INITIAL_CONVERSATIONS];
    }
  }

  private persist(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.conversations));
    } catch {
      // Storage quota or unavailable
    }
  }

  listConversations(filterStatus?: ConversationStatus): ChatwootConversation[] {
    if (!filterStatus) return [...this.conversations];
    return this.conversations.filter(c => c.status === filterStatus);
  }

  getConversation(id: string): ChatwootConversation | undefined {
    return this.conversations.find(c => c.id === id);
  }

  createConversation(data: {
    contactName: string;
    contactEmail?: string;
    channel?: ChannelType;
    subject: string;
    initialMessage: string;
    tags?: string[];
  }): ChatwootConversation {
    const now = new Date().toISOString();
    const convo: ChatwootConversation = {
      id: 'cw-' + crypto.randomUUID().slice(0, 8),
      contactName: data.contactName.trim() || 'Anonymous Reader',
      contactEmail: data.contactEmail?.trim(),
      channel: data.channel || 'community',
      status: 'open',
      subject: data.subject.trim() || 'Community Discussion',
      createdAt: now,
      updatedAt: now,
      tags: data.tags || [],
      messages: [
        {
          id: 'msg-' + crypto.randomUUID().slice(0, 8),
          sender: 'contact',
          senderName: data.contactName.trim() || 'Anonymous Reader',
          text: data.initialMessage.trim(),
          timestamp: now,
        },
      ],
    };
    this.conversations.unshift(convo);
    this.persist();
    return convo;
  }

  replyToConversation(convoId: string, text: string, agentName = 'AnF Maintainer'): ChatMessage {
    const convo = this.getConversation(convoId);
    if (!convo) throw Error(`Conversation ${convoId} not found.`);
    const now = new Date().toISOString();
    const msg: ChatMessage = {
      id: 'msg-' + crypto.randomUUID().slice(0, 8),
      sender: 'agent',
      senderName: agentName,
      text: text.trim(),
      timestamp: now,
    };
    convo.messages.push(msg);
    convo.updatedAt = now;
    if (convo.status === 'open') {
      convo.status = 'pending';
    }
    this.persist();
    return msg;
  }

  updateStatus(convoId: string, status: ConversationStatus): void {
    const convo = this.getConversation(convoId);
    if (!convo) throw Error(`Conversation ${convoId} not found.`);
    convo.status = status;
    convo.updatedAt = new Date().toISOString();
    this.persist();
  }

  exportToMarkdown(convoId: string): string {
    const convo = this.getConversation(convoId);
    if (!convo) throw Error(`Conversation ${convoId} not found.`);

    return `---
title: "Chatwoot Thread · ${convo.subject}"
type: support-thread
id: "${convo.id}"
channel: "${convo.channel}"
status: "${convo.status}"
contact: "${convo.contactName}"
tags:
  - chatwoot
  - support
  - community
---

# ${convo.subject}

> **Contact:** ${convo.contactName}${convo.contactEmail ? ` <${convo.contactEmail}>` : ''}  
> **Channel:** \`${convo.channel}\` · **Status:** \`${convo.status.toUpperCase()}\`  
> **Updated:** ${convo.updatedAt}

## Transcript

${convo.messages.map(m => `### ${m.senderName} (${m.sender}) · *${m.timestamp}*
${m.text}
`).join('\n')}
`;
  }
}
