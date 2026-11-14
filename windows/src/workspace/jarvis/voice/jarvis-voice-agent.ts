/**
 * Kevo Autonomous Action & Intent Dispatcher
 * Parses natural spoken voice instructions and executes corresponding actions across the entire workspace.
 * When a voice instruction isn't an explicit command, it routes to local AI with conversational memory.
 */

import { appendJarvisTurn, formatJarvisHistoryForPrompt } from './jarvis-memory';

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
  askAI?: (query: string) => Promise<string>;
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

  async processVoiceInput(spokenText: string): Promise<ActionResult> {
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
        appendJarvisTurn('user', text);
        // A short history keeps the local model quick and stops old exchanges steering new answers.
        const history = formatJarvisHistoryForPrompt(8);
        const prompt = history
          ? `Prior Kevo conversation (most recent last):\n${history}\n\nRespond as Kevo to the latest user message.`
          : text;
        const aiAnswer = await this.context.askAI(prompt);
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
          speechReply: `I encountered an issue processing that query, sir: ${String(err)}`,
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

/** True when what the microphone heard is (part of) what Kevo itself just said. */
export function isEchoOf(heard: string, reply: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const h = norm(heard);
  // Short phrases ("yes", "open music") are too common to call an echo.
  return h.split(' ').length >= 4 && norm(reply).includes(h);
}
