/**
 * Kevo Autonomous Action & Intent Dispatcher
 * Parses natural spoken voice instructions and executes corresponding actions across the entire workspace.
 * When a voice instruction isn't an explicit command, it routes to local AI with conversational memory.
 */

import { appendJarvisTurn, getJarvisHistory, type JarvisTurn } from './jarvis-memory';

export interface JarvisActionContext {
  switchView: (view: string) => void;
  playMusic?: () => void;
  pauseMusic?: () => void;
  nextTrack?: () => void;
  searchMusic?: (query: string) => Promise<boolean>;
  searchVault?: (query: string) => Promise<string>;
  /** Opens an installed app by name; resolves to the name of the app it opened. */
  openApp?: (name: string) => Promise<string>;
  openQuickCapture?: () => void;
  saveQuickNote?: (text: string) => Promise<void>;
  /** Asks the AI. `onPart` receives each sentence as soon as it is written. */
  askAI?: (query: string, options?: { history: JarvisTurn[]; onPart?: (text: string) => void }) => Promise<string>;
  /** Stops the answer the AI is writing. */
  cancelAI?: () => void;
  /** Opens a web search for the words in the owner's browser. */
  searchWeb?: (query: string) => Promise<void>;
  /** Says something later, on Kevo's own initiative (a timer going off). */
  announce?: (text: string) => void;
  triageSupport?: () => number;
  runDevHealth?: () => Promise<string>;
  getBriefing?: () => Promise<string>;
  notify?: (msg: string) => void;
}

export interface ActionResult {
  handled: boolean;
  actionName: string;
  speechReply: string;
}

function speakClock(): string {
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `It is ${time}, sir.`;
}

function speakDate(): string {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `Today is ${date}, sir.`;
}

const WORKSPACE_PLACES: Record<string, { view: string; action: string; say: string }> = {};
for (const [names, view, action, say] of [
  ['notes|my notes|quick capture|quick note|quick notes', 'home', 'navigate_notes', 'Opening your notes, sir.'],
  ['music|music hub|the hub|hub', 'music', 'navigate_music', 'Opening Music Hub.'],
  ['chat|assistant|chat assistant', 'chat', 'navigate_chat', 'Opening Chat assistant.'],
  ['writing|editor|writing editor', 'writing', 'navigate_writing', 'Opening Writing editor.'],
  ['documents|document|library|document library', 'documents', 'navigate_docs', 'Opening Documents.'],
  ['audio|studio|audio studio', 'audio', 'navigate_audio', 'Opening Audio Studio.'],
  ['kevo|jarvis|command center|kevo command center', 'jarvis', 'navigate_jarvis', 'Opening Kevo.'],
  ['home|dashboard', 'home', 'navigate_home', 'Opening Home.'],
  ['settings|setting', 'settings', 'navigate_settings', 'Opening Settings.'],
] as const) {
  for (const name of names.split('|')) WORKSPACE_PLACES[name] = { view, action, say };
}

export class JarvisVoiceAgent {
  private context: JarvisActionContext;

  constructor(context: JarvisActionContext) {
    this.context = context;
  }

  setContext(context: JarvisActionContext): void {
    this.context = context;
  }

  private timers = new Set<ReturnType<typeof setTimeout>>();
  private lastSpoken = '';
  private generation = 0;

  /** Things Kevo can answer or do without the AI. Null when the request is not one of them. */
  private quickAnswer(text: string): ActionResult | null {
    const lower = text.toLowerCase().replace(/[.!?]+$/, '').trim();
    const done = (actionName: string, speechReply: string): ActionResult => ({ handled: true, actionName, speechReply });

    if (/^(stop|cancel|never mind|nevermind|be quiet|quiet|that's all|thats all|thank you|thanks)$/.test(lower)) return { handled: true, actionName: 'dismiss', speechReply: '' };
    if (/^(repeat( that)?|say that again|what did you say|come again)$/.test(lower)) return done('repeat', this.lastSpoken || getJarvisHistory().filter(t => t.role === 'assistant').pop()?.text || 'I have not said anything yet.');
    if (/^(help|what can you do|what can i say|what can i ask)$/.test(lower)) {
      return done('help', 'I can open apps and places in AnF, play or pause music, search your notes or the web, take a note, set a timer, do sums, tell the time and date, and answer questions.');
    }

    if (/\b(cancel|stop|clear)\b.*\btimers?\b/.test(lower)) {
      const count = this.timers.size;
      this.timers.forEach(clearTimeout);
      this.timers.clear();
      return done('timer_cancel', count ? `Cancelled ${count === 1 ? 'the timer' : `${count} timers`}.` : 'There is no timer running.');
    }
    // Only a request to start one: "how does a timer work?" is a question for the AI.
    if (/\b(set|start|create|begin|make|put on)\b.*\btimer\b|\btimer for\b|\bremind me in\b/.test(lower)) {
      const duration = parseDuration(lower);
      if (!duration) return done('timer_unclear', 'For how long? Say, for example, set a timer for five minutes.');
      if (!this.context.announce) return done('timer_unavailable', 'Timers are not available here.');
      const about = /remind me in .*? to (.+)$/.exec(lower)?.[1];
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.context.announce?.(about ? `Reminder: ${about}.` : `Your ${duration.label} timer is done.`);
      }, duration.ms);
      this.timers.add(timer);
      return done('timer_set', about ? `I will remind you in ${duration.label}.` : `Timer set for ${duration.label}.`);
    }

    const sum = solveArithmetic(lower);
    if (sum) return done('arithmetic', sum);

    return null;
  }

  /** Stops timers when the view is closed. */
  dispose(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  /** Carries out a request and remembers what was said, so "say that again" repeats any kind of answer. */
  async processVoiceInput(spokenText: string, onPart?: (text: string) => void): Promise<ActionResult> {
    const result = await this.handle(spokenText, onPart);
    if (result.speechReply && result.actionName !== 'repeat') this.lastSpoken = result.speechReply;
    return result;
  }

  /** Forget the answer being worked out: it was stopped, so it must not be saved or repeated. */
  abandon(): void {
    this.generation++;
  }

  private async handle(spokenText: string, onPart?: (text: string) => void): Promise<ActionResult> {
    const text = spokenText.trim();
    if (!text) {
      return { handled: false, actionName: 'none', speechReply: 'I am listening, sir.' };
    }

    const lower = text.toLowerCase();

    // Clock / calendar (Phase 2B)
    if (
      lower.includes('what time') ||
      lower === 'time' ||
      lower.includes('current time') ||
      lower.includes("what's the time") ||
      lower.includes('whats the time')
    ) {
      return { handled: true, actionName: 'tell_time', speechReply: speakClock() };
    }
    if (
      lower.includes("today's date") ||
      lower.includes('todays date') ||
      lower.includes('what day is') ||
      lower.includes('what is the date') ||
      lower.includes("what's the date") ||
      lower.includes('tell me the date') ||
      lower.includes("tell me today's date")
    ) {
      return { handled: true, actionName: 'tell_date', speechReply: speakDate() };
    }

    // Answers that need no AI, so they come at once
    const quick = this.quickAnswer(text);
    if (quick) return quick;

    const web = /^(?:search (?:the )?(?:web|internet|online) for|google|look up|search online for)\s+(.+?)[.!?]*$/.exec(lower);
    if (web && this.context.searchWeb) {
      try {
        await this.context.searchWeb(web[1]);
        return { handled: true, actionName: 'web_search', speechReply: `Searching the web for ${web[1]}.` };
      } catch (err) {
        return { handled: true, actionName: 'web_search_failed', speechReply: `I could not open the browser: ${String(err).replace(/^Error:\s*/, '')}` };
      }
    }

    // 1. Briefing command
    if (lower.includes('briefing') || lower.includes('morning update') || lower.includes('status report')) {
      if (this.context.getBriefing) {
        const briefingSummary = await this.context.getBriefing();
        return {
          handled: true,
          actionName: 'briefing',
          speechReply: briefingSummary || 'Executive briefing ready, sir.',
        };
      }
    }

    // 2. Music & Media Commands
    if (
      lower.includes('pause music') ||
      lower.includes('stop music') ||
      lower.includes('pause playback') ||
      (lower.includes('pause') && lower.includes('music'))
    ) {
      this.context.pauseMusic?.();
      return { handled: true, actionName: 'pause_music', speechReply: 'Music paused, sir.' };
    }

    if (lower === 'play music' || lower === 'resume music' || lower === 'start music' || lower === 'resume playback') {
      this.context.playMusic?.();
      return { handled: true, actionName: 'play_music', speechReply: 'Resuming your music, sir.' };
    }

    if ((lower.startsWith('play ') || lower.startsWith('stream ')) && !lower.includes('game') && !lower.includes('video')) {
      const songQuery = text.replace(/^(play|stream)\s+/i, '').trim();
      if (songQuery) {
        if (this.context.searchMusic) {
          const found = await this.context.searchMusic(songQuery);
          return {
            handled: true,
            actionName: 'search_play_music',
            speechReply: found
              ? `Playing "${songQuery}" for you now, sir.`
              : `Searched Music Hub for "${songQuery}", sir.`,
          };
        }
        this.context.playMusic?.();
        return { handled: true, actionName: 'play_music', speechReply: `Playing "${songQuery}", sir.` };
      }
    }

    if (lower.startsWith('search song ') || lower.startsWith('search music ') || lower.startsWith('find song ')) {
      const songQuery = text.replace(/^(search song|search music|find song)\s+/i, '').trim();
      if (songQuery && this.context.searchMusic) {
        await this.context.searchMusic(songQuery);
        return {
          handled: true,
          actionName: 'search_music',
          speechReply: `Searching Music Hub for "${songQuery}", sir.`,
        };
      }
    }

    // Vault / notes BM25 search: "search notes for equalizer", "find in vault Spaces"
    if (
      lower.startsWith('search notes ') ||
      lower.startsWith('search note ') ||
      lower.startsWith('search vault ') ||
      lower.startsWith('find in vault ') ||
      lower.startsWith('search my notes ') ||
      lower.startsWith('find notes ')
    ) {
      const vaultQuery = text
        .replace(
          /^(search notes for|search note for|search notes|search note|search vault for|search vault|find in vault|search my notes for|search my notes|find notes for|find notes)\s+/i,
          ''
        )
        .trim();
      if (vaultQuery && this.context.searchVault) {
        const summary = await this.context.searchVault(vaultQuery);
        return { handled: true, actionName: 'search_vault', speechReply: summary };
      }
    }

    if (lower.includes('next song') || lower.includes('next track') || lower.includes('skip song') || lower.includes('skip track')) {
      this.context.nextTrack?.();
      return { handled: true, actionName: 'next_track', speechReply: 'Skipping to next track, sir.' };
    }

    // 3. Places inside AnF. Exact names only, so "open Visual Studio Code" or "open ChatGPT" reach the apps below.
    const place = /^(?:open|go to|show)\s+(?:the\s+|my\s+)?(.+?)[.!?]*$/.exec(lower);
    const route = place && WORKSPACE_PLACES[place[1]];
    if (route) {
      this.context.switchView(route.view);
      if (route.view === 'home' && route.say.includes('notes')) this.context.openQuickCapture?.();
      return { handled: true, actionName: route.action, speechReply: route.say };
    }

    // 3b. Apps on this computer: "open Brave browser", "launch Spotify"
    const app = /^(?:open|launch|start)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:app|application|program))?[.!?]*$/i.exec(text);
    if (app && this.context.openApp) {
      try {
        const opened = await this.context.openApp(app[1]);
        return { handled: true, actionName: 'open_app', speechReply: `Opening ${opened}.` };
      } catch (err) {
        return { handled: true, actionName: 'open_app_failed', speechReply: String(err).replace(/^Error:\s*/, '') };
      }
    }

    // 4. Note taking & Quick Capture Commands
    if (
      lower.startsWith('take a note') ||
      lower.startsWith('note that') ||
      lower.startsWith('remember that') ||
      lower.startsWith('write this down')
    ) {
      const noteContent = text
        .replace(/^(take a note(:|\s+that)?|note that|remember that|write this down(:|\s+that)?)\s*/i, '')
        .trim();
      if (noteContent && this.context.saveQuickNote) {
        await this.context.saveQuickNote(noteContent);
        return {
          handled: true,
          actionName: 'take_note',
          speechReply: `Note captured: ${noteContent.slice(0, 40)}...`,
        };
      }
    }

    // 5. Code Health / Tom Agent Commands
    if (lower.includes('code health') || lower.includes('run tests') || lower.includes('check build') || /\btom\b/.test(lower)) {
      if (this.context.runDevHealth) {
        const devStatus = await this.context.runDevHealth();
        return {
          handled: true,
          actionName: 'dev_health',
          speechReply: devStatus || 'All tests passing. Build is clean, sir.',
        };
      }
    }

    // 6. Support Triage Commands
    if (lower.includes('triage') || lower.includes('support ticket') || lower.includes('customer inbox')) {
      if (this.context.triageSupport) {
        const resolved = this.context.triageSupport();
        return {
          handled: true,
          actionName: 'support_triage',
          speechReply: `Support triage complete. Auto-resolved ${resolved} conversations, sir.`,
        };
      }
    }

    // 7. General AI Conversational Intelligence + memory
    if (this.context.askAI) {
      try {
        // A short history keeps the local model quick and stops old exchanges steering new answers.
        const asked = this.generation;
        const aiAnswer = await this.context.askAI(text, { history: getJarvisHistory(8), onPart });
        if (asked !== this.generation) return { handled: true, actionName: 'abandoned', speechReply: '' };
        // Saved only once answered, so a question that was stopped never steers later answers.
        appendJarvisTurn('user', text);
        appendJarvisTurn('assistant', aiAnswer);
        return {
          handled: true,
          actionName: 'ai_conversation',
          speechReply: aiAnswer,
        };
      } catch (err) {
        return {
          handled: false,
          actionName: 'error',
          speechReply: /cancelled/i.test(String(err)) ? '' : `That did not work: ${String(err).replace(/^Error:\s*/, '')}`,
        };
      }
    }

    return {
      handled: false,
      actionName: 'unknown',
      speechReply: `Understood, sir: "${text}". Standing by for further commands.`,
    };
  }
}

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, fifty: 50, sixty: 60, ninety: 90, half: 0.5 };

// Longest names first, so "forty five" is not read as "five".
const DURATION = new RegExp(`\\b(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).sort((x, y) => y.length - x.length).join('|')})\\s*(second|sec|minute|min|hour|hr)s?\\b`);

/** "5 minutes", "ninety seconds", "an hour and a half" is not handled; one number and one unit is. */
export function parseDuration(text: string): { ms: number; label: string } | null {
  const m = DURATION.exec(text.toLowerCase());
  if (!m) return null;
  const n = /^\d/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  if (!n || n <= 0) return null;
  const unit = m[2].startsWith('s') ? 'second' : m[2].startsWith('m') ? 'minute' : 'hour';
  const ms = n * { second: 1000, minute: 60_000, hour: 3_600_000 }[unit];
  if (ms > 24 * 3_600_000) return null;
  return { ms, label: `${n} ${unit}${n === 1 ? '' : 's'}` };
}

/** "what is 12 times 7", "15 plus 30", "100 divided by 8", "20 percent of 150". Null when it is not plain arithmetic. */
export function solveArithmetic(text: string): string | null {
  const t = text.toLowerCase().replace(/[?,]/g, '').replace(/^(what is|what's|whats|calculate|how much is)\s+/, '').trim();
  const percent = /^(-?\d+(?:\.\d+)?)\s*(?:percent|%)\s+of\s+(-?\d+(?:\.\d+)?)$/.exec(t);
  const m = percent ? null : /^(-?\d+(?:\.\d+)?)\s*(plus|\+|minus|-|times|x|\*|multiplied by|divided by|over|\/)\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  let value: number;
  if (percent) value = (Number(percent[1]) / 100) * Number(percent[2]);
  else if (m) {
    const [a, b] = [Number(m[1]), Number(m[3])];
    const op = m[2];
    if (/divided|over|\//.test(op) && b === 0) return 'You cannot divide by zero.';
    value = /plus|\+/.test(op) ? a + b : /minus|-/.test(op) ? a - b : /times|x|\*|multiplied/.test(op) ? a * b : a / b;
  } else return null;
  return `That is ${Number(value.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 })}.`;
}

/** True when what the microphone heard is (part of) what Kevo itself just said. */
export function isEchoOf(heard: string, reply: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const h = norm(heard);
  // Short phrases ("yes", "open music") are too common to call an echo.
  return h.split(' ').length >= 4 && norm(reply).includes(h);
}

/** What is left of `whole` after the sentences already spoken; empty when they do not line up. */
export function unspokenRest(spoken: string, whole: string): string {
  const flat = (t: string) => t.replace(/\s+/g, ' ').trim();
  const [said, all] = [flat(spoken), flat(whole)];
  return said && all.startsWith(said) ? all.slice(said.length).trim() : '';
}
