/**
 * Security & Architecture Cards Engine
 * Inspired by ChiefGyk3D/Clouds-Against-Humanity.
 * Provides interactive offline evaluation of software architecture,
 * privacy, offline-first design, cryptography, and open protocols.
 */

export type SecurityCardCategory =
  | 'Privacy & Offline-First'
  | 'Cryptography & Keys'
  | 'Audio & DSP'
  | 'Open Standards';

export interface CardOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface SecurityCard {
  id: string;
  category: SecurityCardCategory;
  title: string;
  scenario: string;
  options: CardOption[];
  seniorDevRationale: string;
}

export const SECURITY_CARDS_DECK: readonly SecurityCard[] = [
  {
    id: 'telemetry-leakage',
    category: 'Privacy & Offline-First',
    title: 'Zero-Telemetry Isolation',
    scenario: 'A user opens sensitive personal journal entries in an offline desktop application. Which architectural choice strictly ensures zero telemetry or inadvertent leakage?',
    options: [
      {
        id: 'opt-a',
        text: 'Silent background error logging to a remote aggregator with IP anonymization',
        isCorrect: false,
        explanation: 'Any remote outbound network transmission, even with claimed anonymization, breaches the offline trust boundary and risks payload leakage in stack traces.',
      },
      {
        id: 'opt-b',
        text: 'Client-side sandboxed local execution with all network calls guarded by an explicit user permission gate',
        isCorrect: true,
        explanation: 'True offline-first security treats network access as an explicit, user-authorized capability rather than an ambient default.',
      },
      {
        id: 'opt-c',
        text: 'Third-party cloud crash analytics enabled only on desktop builds',
        isCorrect: false,
        explanation: 'Third-party SDKs introduce unverified telemetry and remote dependency surface into local user environments.',
      },
    ],
    seniorDevRationale: 'The best privacy is code that never calls home. Guard the boundary explicitly, keep logs strictly local, and eliminate ambient cloud pings.',
  },
  {
    id: 'crypto-vault-storage',
    category: 'Cryptography & Keys',
    title: 'Local Vault Database Encryption',
    scenario: 'When packaging and encrypting personal notes and database snapshots for cross-device transport, which cryptographic scheme is required for authenticated security?',
    options: [
      {
        id: 'opt-a',
        text: 'Base64 obfuscation with a reversible XOR cipher',
        isCorrect: false,
        explanation: 'Obfuscation provides zero cryptographic security and is trivially reversible.',
      },
      {
        id: 'opt-b',
        text: 'AES-128 in ECB mode without an initialization vector',
        isCorrect: false,
        explanation: 'ECB mode leaks plaintext data patterns because identical plaintext blocks encrypt to identical ciphertext blocks.',
      },
      {
        id: 'opt-c',
        text: 'PBKDF2 key derivation (minimum 100,000 iterations + salt) with AES-256-GCM authenticated encryption',
        isCorrect: true,
        explanation: 'PBKDF2 with sufficient iterations protects against brute force, while AES-GCM provides both strong confidentiality and cryptographic integrity verification.',
      },
    ],
    seniorDevRationale: 'Never invent custom crypto. Use industry-standard authenticated encryption (AES-GCM) with proper salt and key derivation to prevent tampering and eavesdropping.',
  },
  {
    id: 'audio-dsp-transitions',
    category: 'Audio & DSP',
    title: 'Spotify-Grade Click-Free Audio Transitions',
    scenario: 'When crossfading between musical tracks or applying volume normalization, what prevents audible zipper noise and audio clicks?',
    options: [
      {
        id: 'opt-a',
        text: 'Web Audio sample-accurate automation (linearRampToValueAtTime) on GainNode with DynamicsCompressor',
        isCorrect: true,
        explanation: 'Web Audio automation schedules gain changes per-sample at 44.1 kHz, eliminating discrete volume jumps that cause zipper clicks.',
      },
      {
        id: 'opt-b',
        text: 'A JavaScript setInterval timer stepping audio.volume every 50ms',
        isCorrect: false,
        explanation: 'JavaScript timer intervals jitter on the main thread and produce stepped amplitude steps known as zipper distortion.',
      },
      {
        id: 'opt-c',
        text: 'Hard-muting the audio element for 100ms between songs',
        isCorrect: false,
        explanation: 'Hard muting causes abrupt silence and unpleasant discontinuities rather than a smooth transition.',
      },
    ],
    seniorDevRationale: 'Rely on hardware and browser DSP pipelines. Web Audio parameter automation operates within the audio render thread for glitch-free transitions.',
  },
  {
    id: 'podcasting-standards',
    category: 'Open Standards',
    title: 'Podcasting 2.0 Namespace Interoperability',
    scenario: 'Which set of XML tags complies with the official open Podcasting 2.0 namespace for structured chapters, transcripts, and soundbites in RSS feeds?',
    options: [
      {
        id: 'opt-a',
        text: '<podcast:chapters>, <podcast:transcript>, and <podcast:soundbite>',
        isCorrect: true,
        explanation: 'These are the standardized Podcasting 2.0 specification elements recognized by modern open podcast apps like AntennaPod and AnF.',
      },
      {
        id: 'opt-b',
        text: '<itunes:markers>, <media:subtitles>, and <rss:highlight>',
        isCorrect: false,
        explanation: 'These elements are non-standard or proprietary extensions not supported by the Podcasting 2.0 index.',
      },
      {
        id: 'opt-c',
        text: 'Embedding plain text timestamps only in the episode description',
        isCorrect: false,
        explanation: 'Plain text description timestamps cannot be parsed reliably or machine-seeked by podcast players without standard XML tags.',
      },
    ],
    seniorDevRationale: 'Adopt open namespace standards. Podcasting 2.0 provides durable, vendor-neutral episode semantics across the ecosystem.',
  },
  {
    id: 'calendar-interop',
    category: 'Open Standards',
    title: 'Universal Task Calendar Syndication',
    scenario: 'Which open format enables task lists to sync seamlessly across Cal.com, Apple Calendar, Outlook, and Google Calendar without proprietary APIs?',
    options: [
      {
        id: 'opt-a',
        text: 'RFC 5545 iCalendar (.ics) with VTODO components and UTC timestamps',
        isCorrect: true,
        explanation: 'RFC 5545 is the universal standard for calendar and to-do streams, supported natively by every major calendar platform.',
      },
      {
        id: 'opt-b',
        text: 'A proprietary cloud JSON webhook payload',
        isCorrect: false,
        explanation: 'Proprietary payloads require custom server adapters and lack offline file-drop compatibility.',
      },
      {
        id: 'opt-c',
        text: 'CSV spreadsheet files with arbitrary headers',
        isCorrect: false,
        explanation: 'CSV lacks standardized date-time serialization, recurring rules, and status markers.',
      },
    ],
    seniorDevRationale: 'Standards win. RFC 5545 has survived 25 years and will survive another 25. Never invent a custom JSON schema when an RFC already exists.',
  },
];

export interface AnswerResult {
  cardId: string;
  isCorrect: boolean;
  selectedOption: string;
  correctOption: string;
  explanation: string;
  seniorDevRationale: string;
  scoreDelta: number;
}

/**
 * Evaluate an answer for a specific security card.
 */
export function evaluateCardAnswer(cardId: string, optionId: string): AnswerResult {
  const card = SECURITY_CARDS_DECK.find(c => c.id === cardId);
  if (!card) {
    throw Error(`Unknown card id: ${cardId}`);
  }
  const chosen = card.options.find(o => o.id === optionId);
  if (!chosen) {
    throw Error(`Unknown option id: ${optionId} for card ${cardId}`);
  }
  const correct = card.options.find(o => o.isCorrect)!;

  return {
    cardId: card.id,
    isCorrect: chosen.isCorrect,
    selectedOption: chosen.text,
    correctOption: correct.text,
    explanation: chosen.explanation,
    seniorDevRationale: card.seniorDevRationale,
    scoreDelta: chosen.isCorrect ? 10 : 0,
  };
}

/**
 * Interactive session manager for Clouds Against Humanity security challenges.
 */
export class SecurityDeckSession {
  private history: AnswerResult[] = [];
  private readonly deck: readonly SecurityCard[];

  constructor(deck: readonly SecurityCard[] = SECURITY_CARDS_DECK) {
    this.deck = deck;
  }

  getCards(): readonly SecurityCard[] {
    return this.deck;
  }

  submitAnswer(cardId: string, optionId: string): AnswerResult {
    const result = evaluateCardAnswer(cardId, optionId);
    this.history.push(result);
    return result;
  }

  getScore(): number {
    return this.history.reduce((sum, r) => sum + r.scoreDelta, 0);
  }

  getStats(): { answered: number; correct: number; totalCards: number; percentage: number } {
    const correct = this.history.filter(h => h.isCorrect).length;
    const answered = this.history.length;
    const totalCards = this.deck.length;
    const percentage = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    return { answered, correct, totalCards, percentage };
  }

  exportMarkdownScorecard(): string {
    const stats = this.getStats();
    return `# Security & Architecture Challenge Scorecard

> **Score:** ${this.getScore()} / ${this.deck.length * 10} (${stats.percentage}% Correct)  
> **Evaluated:** ${new Date().toISOString().slice(0, 10)}  
> **Inspired by:** Clouds Against Humanity (ChiefGyk3D)

## Detailed Results
${this.history.map((r, i) => {
  const card = this.deck.find(c => c.id === r.cardId);
  return `### ${i + 1}. ${card?.title || r.cardId} (${r.isCorrect ? '✅ +10 pts' : '❌ 0 pts'})
- **Category:** ${card?.category || 'General'}
- **Selected:** ${r.selectedOption}
- **Feedback:** ${r.explanation}
- **Senior Dev Rationale:** ${r.seniorDevRationale}
`;
}).join('\n')}
`;
  }
}
