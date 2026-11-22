/**
 * Kevo Autonomous Action & Intent Dispatcher
 * Parses natural spoken voice instructions and executes corresponding actions across the entire workspace.
 * When a voice instruction isn't an explicit command, it routes to local AI with conversational memory.
 */

import { appendJarvisTurn, clearJarvisHistory, getJarvisHistory, rememberFact, listFacts, deleteFact, clearFacts, type JarvisTurn } from './jarvis-memory';
import type { KevoActionStatus } from './kevo-actions';
import { onlineGet, parseOnlineLookupsSwitch, type LookupFetch } from './kevo-online';
import { fetchJoke, isJokeRequest } from './kevo-joke';
import {
  createReminder,
  listReminders,
  cancelReminder,
  clearReminders,
  scheduleDailyBriefing,
  getDailyBriefingSchedule,
  cancelDailyBriefingSchedule,
} from './jarvis-schedule';

export type JarvisAskAiResult =
  | string
  | {
      text: string;
      actionName?: string;
      status?: 'success' | 'failure' | 'unverified';
      verified?: boolean;
      reason?: string;
      error?: string;
    };

export interface JarvisActionContext {
  switchView: (view: string) => void;
  playMusic?: () => void;
  pauseMusic?: () => void;
  nextTrack?: () => void;
  /** Skips to the previous music track. */
  previousTrack?: () => void;
  /** Changes the Music Hub volume and returns the new level, 0 to 100. */
  setMusicVolume?: (change: VolumeRequest) => number;
  searchMusic?: (query: string) => Promise<boolean>;
  searchVault?: (query: string) => Promise<string>;
  /** Optional access to workspace notes for vault telemetry. */
  notes?: any[];
  getVaultNoteCount?: () => Promise<number> | number;
  /** Opens an installed app by name; resolves to the name of the app it opened. */
  openApp?: (name: string) => Promise<string>;
  openQuickCapture?: () => void;
  saveQuickNote?: (text: string) => Promise<void>;
  /** Remembers a persistent fact in Kevo memory. */
  rememberFact?: (fact: string, category?: string) => Promise<unknown>;
  /** Lists remembered facts from Kevo memory. */
  listFacts?: (query?: string) => Promise<unknown[]>;
  /** Deletes a remembered fact by ID. */
  deleteFact?: (id: string) => Promise<boolean>;
  /** Clears all remembered facts. */
  clearFacts?: () => Promise<boolean>;
  /** Schedules a reminder in persistent schedule store. */
  createReminder?: (message: string, trigger_at: number, recurring?: string) => Promise<unknown>;
  /** Lists reminders from persistent schedule store. */
  listReminders?: (include_fired?: boolean) => Promise<unknown[]>;
  /** Cancels a scheduled reminder by ID or query keyword. */
  cancelReminder?: (idOrQuery: string) => Promise<boolean>;
  /** Clears all reminders. */
  clearReminders?: () => Promise<boolean>;
  /** Schedules the recurring daily briefing. */
  scheduleDailyBriefing?: (timeStr: string) => Promise<any>;
  /** Gets active daily briefing schedule. */
  getDailyBriefingSchedule?: () => Promise<any | null>;
  /** Cancels the active daily briefing schedule. */
  cancelDailyBriefing?: () => Promise<boolean>;
  /** Asks the AI. `onPart` receives each sentence as soon as it is written. */
  askAI?: (query: string, options?: { history: JarvisTurn[]; onPart?: (text: string) => void }) => Promise<JarvisAskAiResult>;
  /** Stops the answer the AI is writing. */
  cancelAI?: () => void;
  /** Opens a web search for the words in the owner's browser. */
  searchWeb?: (query: string) => Promise<void>;
  /** Opens a web page (https only) in the owner's browser. */
  openUrl?: (url: string) => Promise<void>;
  /** Changes Kevo's voice to the named one, or to the next one when no name is given. Null when the name is not a voice. */
  changeVoice?: (name?: string) => string | null;
  /** The names of Kevo's voices. */
  voiceNames?: () => string[];
  /** Active local AI model label/id (e.g. "fast", "balanced", "Qwen 1.7B Q8"). */
  getActiveModel?: () => string;
  /** Sets the float HUD badge. */
  setFloatBadge?: (badge: string) => void;
  /** Says something later, on Kevo's own initiative (a timer going off). */
  announce?: (text: string) => void;
  triageSupport?: () => number;
  getBriefing?: () => Promise<string>;
  /** Today's weather, spoken. No place: the last place asked about; null when there is none yet (Kevo asks which city). */
  getWeather?: (place?: string, day?: 0 | 1) => Promise<string | null>;
  /** Whether the owner turned weather on by saying "turn on weather". Off until then: weather sends the city to Open-Meteo. */
  weatherEnabled?: () => boolean;
  /** Turns weather on or off, remembered on this computer. */
  setWeatherEnabled?: (on: boolean) => void;
  /** Whether the owner turned on online lookups (Wikipedia, dictionary, currency rates) by saying "turn on online lookups". */
  onlineLookupsEnabled?: () => boolean;
  /** Turns online lookups on or off, remembered on this computer. */
  setOnlineLookupsEnabled?: (on: boolean) => void;
  notify?: (msg: string) => void;
  /** Currently pending approval request (H.4b). */
  pendingApproval?: () => PendingApproval | null;
  answerApproval?: (id: number | string, approved: boolean) => Promise<unknown> | void;
  /** When true, actions are simulated without performing real side effects (Phase 0 step 0.4b). */
  dryRun?: boolean;
  /** Injectable clock for tests; returns timestamp in milliseconds. Defaults to Date.now. */
  now?: () => number;
  /** Expiration time for follow-up questions/subjects in milliseconds. Defaults to 30,000 (30 s). */
  followUpExpiryMs?: number;
}

export interface PendingApproval {
  id: number | string;
  action: string;
  summary: string;
  answer?: (approved: boolean) => Promise<unknown> | void;
}

export interface ActionResult {
  handled: boolean;
  actionName: string;
  speechReply: string;
  status?: KevoActionStatus;
  verified?: boolean;
  error?: string;
  reason?: string;
  verificationDetails?: string;
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

/** Websites Kevo opens by name ("play YouTube", "open Gmail") in the owner's browser. */
const SITES: Record<string, { url: string; name: string }> = {
  youtube: { url: 'https://www.youtube.com', name: 'YouTube' },
  google: { url: 'https://www.google.com', name: 'Google' },
  gmail: { url: 'https://mail.google.com', name: 'Gmail' },
};

/** "open Brave", "open browser, Brave browser", "launch the Chrome browser": every word names a browser. */
const BROWSER_WORDS = new Set(['the', 'my', 'a', 'an', 'web', 'browser', 'brave', 'chrome', 'google', 'firefox', 'edge', 'microsoft', 'opera', 'vivaldi']);
function opensOnlyABrowser(request: string): boolean {
  const m = /^(?:open|launch|start)\s+(.+?)[.!?]*$/i.exec(request.trim());
  const words = m ? m[1].toLowerCase().split(/[\s,]+/).filter(Boolean) : [];
  return words.length > 0 && words.some((w) => w !== 'google' && w !== 'microsoft' && BROWSER_WORDS.has(w) && !['the', 'my', 'a', 'an', 'web'].includes(w)) && words.every((w) => BROWSER_WORDS.has(w));
}
/** Requests that open a page in the browser: a site by name, a YouTube search or a web search. */
const WEB_REQUEST = /^(?:(?:open|play|go to|launch|start|show)\s+(?:the\s+)?(?:youtube|google|gmail)(?:\.com)?(?:\s+(?:website|site|page))?|(?:play|search|find|look up|watch|put on|show(?: me)?)\s+.+?\s+(?:on|in|from)\s+youtube|(?:search|look up)\s+youtube\s+for\s+.+|(?:search (?:the )?(?:web|internet|online) for|google|look up|search online for)\s+.+)[.!?]*$/i;

/** The start of something Kevo can do, as opposed to a question for the AI. */
// What may come before a command in its clause: filler, "please", or a polite "can you".
const REQUEST_LEAD = /^(?:(?:please|now|just|so|and|then|ok|okay|i want to|i'd like to|i (?:want|need) you to|go ahead and|let'?s)\s+)*(?:(?:can|could|would|will) you\s+(?:(?:please|just)\s+)*)?/;

// Inside a sentence: a fresh start that cancels a hanging "don't", a hypothetical quotation lead, a question word.
const CORRECTION = /^(?:on second thought|actually|now|instead|no wait|wait)\b/;
// "what if I say, ..." and "did you say, ..." quote a command; "I said, ..." and "as I was saying, ..." restate one.
const QUOTE_LEAD = /^(?:what|why|how|if|when|whenever|suppose|imagine|did|do|does|would|could|should|can|will|are|is|was|were|am)\b.*\b(?:say|says|said|saying|ask|asks|asked|asking)$/;
const QUESTION_WORD = /^(?:why|what|how|when|where|who|which)\b(?!\s+about\b|\s+you(?:'re| are) ready\b)/;
// All that may follow the command in its sentence: anything else ("skip this song if I later say go") is a condition.
const POLITE_TAIL = /^(?:[\s,]*(?:please|now|for me|if you (?:can|could)|thanks|thank you|kevo|sir))*[\s,]*$/;

/**
 * True when the last clause that decides about `phrase` is a request to Kevo: after the lead it matches `verb`
 * and nothing but politeness follows in its sentence ("skip this song if I later say go" is a condition).
 * A clause decides when it requests or refuses the action; one that only mentions it ("is the next song good?"),
 * a question ("do I need to skip this song?") or a quotation ("what if I say, tell me the time?") does not.
 * Within its sentence, a negation left hanging before a comma ("please don't, under any circumstances, skip it")
 * reaches it unless a correction comes between ("don't skip it, actually, skip it").
 */
function asksFor(lower: string, phrase: RegExp, verb: RegExp): boolean {
  let asked = false;
  for (const sentence of lower.match(/[^.;!?]+[.;!?]*/g) ?? []) {
    const parts = sentence.replace(/[.;!?]+$/, '').split(',').map((p) => p.trim());
    parts.forEach((part, at) => {
      const found = phrase.exec(part);
      if (!found) return;
      const before = parts.slice(0, at);
      if (before.some((p) => QUOTE_LEAD.test(p)) || (sentence.trim().endsWith('?') && before.some((p) => QUESTION_WORD.test(p)))) return;
      const clause = part.replace(REQUEST_LEAD, '');
      const command = verb.exec(clause);
      if (!command) {
        const slice = part.slice(0, found.index);
        if (/\b(?:not|don'?t|never)\b/.test(slice) && !/\b(?:know|sure|matter|care|mind|wonder|think|believe)\b/i.test(slice)) asked = false;
        return;
      }
      asked = POLITE_TAIL.test([clause.slice(command[0].length), ...parts.slice(at + 1)].join(','));
      for (let i = at - 1; asked && i >= 0 && !CORRECTION.test(parts[i]); i--) if (/\b(?:not|don'?t|never)$/.test(parts[i])) asked = false;
    });
  }
  return asked;
}

const COMMAND_START = /^(?:open|launch|start|play|stream|pause|resume|skip|set|cancel|search|google|look up|go to|show|take a note|note that|write this down|remember|keep in mind|forget|remind me)\b/i;

/** "In the meantime, can you open Brave browser?" is the command "open Brave browser". A question stays as it is. */
export function stripLeadIn(text: string): string {
  const whole = text.trim();
  const rest = whole
    .replace(/^(?:(?:in the meantime|meanwhile|also|now|and|ok(?:ay)?|so|then)[\s,]+)*(?:(?:can|could|would|will) you|please|i (?:need|want) you to|go ahead and)(?:\s+(?:please|just))*[\s,]+/i, '')
    .replace(/[\s,]+please(?=[.!?]*$)/i, '')
    .replace(/\?+$/, '');
  return rest !== whole && COMMAND_START.test(rest) ? rest : whole;
}

/** "open Brave and play YouTube" is two requests. Only split where a new command starts ("rock and roll" stays one). */
export function splitRequests(text: string): string[] {
  return text
    .split(/,?\s+(?:and(?: then)?|then)\s+(?=(?:open|launch|start|play|stream|pause|set|search|google|look up|go to|show|take a note|skip|turn (?:it|the|up|down)|mute|unmute|louder|quieter|softer|volume|(?:what'?s|what is|how'?s|how is|check|tell me) (?:the )?(?:weather|time|clock)|weather (?:in|for|today|tomorrow|now)|(?:the )?time|(?:the )?clock)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
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
  /** What the previous request did, for follow-ups such as "open it" or naming the app after a miss. */
  private lastAction = '';
  private lastActionTime = 0;
  /** The app or thing last talked about, which "open it" refers to. */
  private lastSubject = '';
  private lastSubjectTime = 0;

  private now(): number {
    return this.context.now ? this.context.now() : Date.now();
  }

  private pruneFollowUpState(): void {
    const limit = this.context.followUpExpiryMs ?? 30_000;
    const current = this.now();
    if (this.lastAction && current - this.lastActionTime > limit) {
      this.lastAction = '';
    }
    if (this.lastSubject && current - this.lastSubjectTime > limit) {
      this.lastSubject = '';
    }
  }

  /** Things Kevo can answer or do without the AI. Null when the request is not one of them. */
  private quickAnswer(text: string): ActionResult | null {
    const lower = text.toLowerCase().replace(/[.!?]+$/, '').trim();
    const done = (
      actionName: string,
      speechReply: string,
      details?: { status?: KevoActionStatus; verified?: boolean; error?: string; reason?: string; verificationDetails?: string }
    ): ActionResult => {
      const res: ActionResult = { handled: true, actionName, speechReply };
      if (details?.status !== undefined) res.status = details.status;
      if (details?.verified !== undefined) res.verified = details.verified;
      if (details?.error !== undefined) res.error = details.error;
      if (details?.reason !== undefined) res.reason = details.reason;
      if (details?.verificationDetails !== undefined) res.verificationDetails = details.verificationDetails;
      return res;
    };

    if (/^(stop|cancel|never mind|nevermind|be quiet|quiet|that's all|thats all|thank you|thanks)$/.test(lower)) return { handled: true, actionName: 'dismiss', speechReply: '' };
    // Just a greeting or its name, however the recogniser spelled it: Kevo answers that it is there.
    // "Calvo" is the name misheard too (see processVoiceInput).
    if (/^(hey|hi|hello|ok|okay|yo)?[\s,]*(there|[kc][aeiy]{1,2}[vb][aeo]\w{0,2}|[kc]alvo)?$/.test(lower)) return done('greeting', 'Yes?');
    // "Hey Kevo" heard as "not Kevo" or "now Kevo": still just the name, not a statement for the AI.
    if (/^(now|not|so|um|uh|oh|and)[\s,]+(?:[kc][aeiy]{1,2}[vb][aeo]\w{0,2}|[kc]alvo)$/.test(lower)) return done('greeting', 'Yes?');
    if (/\b(what'?s|what is) your name\b|^who are you$/.test(lower)) return done('name', 'My name is Kevo.');
    if (/^(repeat( that)?|say that again|what did you say|come again)$/.test(lower)) return done('repeat', this.lastSpoken || getJarvisHistory().filter(t => t.role === 'assistant').pop()?.text || 'I have not said anything yet.');
    // Up to two stray words first ("maybe? what else can you do"), nothing after: "what can I do to fix this" is a question.
    if (/^(help|(\S+ ){0,2}what (else )?can (you|i) (do|say|ask)|what do you do)$/.test(lower)
      // "Which task can you do?", "what kind of things can you help me with", "what are you able to do"
      || /^(\S+ ){0,2}(what|which)( \S+){0,3} (can|could) you (do|handle|help( me)?( with)?)( for me)?$|^what are you (able to do|capable of|good at)$/.test(lower)) {
      return done('help', 'I can open apps and places in AnF, play or pause music, change the volume, search your notes or the web, take a note, set a timer, do sums, tell the time and date, check the weather, tell a joke, and answer questions.');
    }

    // Questions about hearing it: the answer is how the microphone works, which the AI does not know.
    // Only failures: "why can't you respond to my voice", "why did you go silent", "how come you stopped listening".
    // "Why did you answer that?" or "why do you listen to jazz?" are questions for the AI.
    const why = /^(why|how come)\b/.test(lower);
    if (/\b(keep|leave)\b.*\b(mic|microphone)\b.*\bon\b/.test(lower)
      || (why && /\b(?:(?:can'?t|cannot|don'?t|didn'?t|won'?t|aren'?t)\s+you|you\s+(?:stopped|never|don'?t|can'?t|didn'?t|won'?t))\s+(?:(?:even|just|really)\s+)?(?:respond|answer|hear|listen|reply)/.test(lower))
      || (why && /\byou\s+(?:\w+\s+)?(?:go|went|gone|going|stay|stayed|fall|fell|stop|stopped)\s+(?:silent|quiet|listening|responding|answering)\b/.test(lower))) {
      return done('mic_help', 'The microphone stays on until you turn it off. Say Kevo before each request. Right after I answer, you have a few seconds to go on without my name.');
    }

    // Remember fact fast path ("Remember: I prefer TypeScript", "Remember that I like jazz", "Keep in mind that my dog is Milo")
    const remMatch = /^(?:please\s+)?(?:remember(?:\s+that|:)?|keep in mind(?:\s+that)?)\s+(.+)$/i.exec(text.trim());
    if (remMatch && remMatch[1]) {
      const fact = remMatch[1].trim().replace(/[.!?]+$/, '');
      if (fact && !/^(?:what|who|where|when|why|how)\b/i.test(fact)) {
        if (this.context.rememberFact) {
          this.context.rememberFact(fact).catch(() => {});
        } else {
          rememberFact(fact).catch(() => {});
        }
        return done('remember_fact', `I will remember that: ${fact}`);
      }
    }

    if (this.context.voiceNames && /^(what|which) voices\b|\bwhat voices (do|can) you\b/.test(lower)) {
      return done('voice_list', `My voices are ${this.context.voiceNames().join(', ')}. Say change your voice, or change your voice to one of them.`);
    }
    // "Can you change your voice to another one?", "any other voice", and "just pick any" right after.
    const voiceAsk = /\b(change|switch|swap)\s+(?:your|kevo'?s)\s+voice\b/.test(lower) && !/^(how|why|what|when|where)\b/.test(lower);
    const anotherVoice = /^(?:\S+ ){0,2}(?:any|an)?\s*(?:other|another|different|new) voice$/.test(lower);
    const pickAny = this.lastAction.startsWith('voice') && lower.split(/\s+/).length <= 7 && /\b(any|anyone|any one|whatever|you choose|you pick|surprise me|pick one|another one|next one)\b/.test(lower);
    if (this.context.changeVoice && (voiceAsk || anotherVoice || pickAny)) {
      const named = voiceAsk ? /\bvoice to (?:the |a )?(.+)$/.exec(lower)?.[1].replace(/\s+(voice|one)$/, '').trim() : undefined;
      const name = named && !/^(another|any|any other|a different|different|something else|someone else|other)( one)?$/.test(named) ? named : undefined;
      const chosen = this.context.changeVoice(name);
      if (!chosen) return done('voice_unknown', `I do not have a voice called ${name}. Say change your voice and I will pick one.`);
      return done('voice_changed', `Voice changed to ${chosen}. This is how I sound now.`);
    }

    if (/\b(cancel|stop|clear)\b.*\btimers?\b/.test(lower)) {
      const count = this.timers.size;
      this.timers.forEach(clearTimeout);
      this.timers.clear();
      return done('timer_cancel', count ? `Cancelled ${count === 1 ? 'the timer' : `${count} timers`}.` : 'There is no timer running.');
    }
    // Only a request to start one: "how does a timer work?" is a question for the AI.
    // "five minutes" right after "For how long?" is the timer's length.
    // "Not five minutes" is not an answer, and "play five minutes" is another command: only a length, with filler words.
    const timerLength = this.lastAction === 'timer_unclear' && lower.split(/\s+/).length <= 4 && parseDuration(lower) !== null && !/\b(?:not|don'?t|do not|never)\b/.test(lower)
      && /^(?:(?:um|uh|oh|ok|okay|so|just|maybe|about|around|for|in|make it|like)\b[\s,]*)*(?:(?:is fine|is good|will do|works|from now)\b[\s,]*)?$/.test(lower.replace(DURATION, ' ').replace(/[,.!?]|\b(?:please|thanks)\b/g, ' ').replace(/\s+/g, ' ').trim());
    if (timerLength || /\b(set|start|create|begin|make|put on)\b.*\btimer\b|\btimer for\b|\bremind me in\b/.test(lower)) {
      const duration = parseDuration(lower);
      if (!duration) return done('timer_unclear', 'For how long? Say, for example, set a timer for five minutes.');
      if (!this.context.announce) return done('timer_unavailable', 'Timers are not available here.');
      const about = /remind me in .*? to (.+)$/.exec(lower)?.[1];
      if (about) {
        const triggerAt = this.now() + duration.ms;
        if (this.context.createReminder) this.context.createReminder(about, triggerAt).catch(() => {});
        else createReminder(about, triggerAt).catch(() => {});
      }
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.context.announce?.(about ? `Reminder: ${about}.` : `Your ${duration.label} timer is done.`);
      }, duration.ms);
      this.timers.add(timer);
      return done('timer_set', about ? `I will remind you in ${duration.label}.` : `Timer set for ${duration.label}.`);
    }


    // Music volume, only as a whole request: "turn it up", "volume down a bit", "mute", "set the volume to 40".
    // Whole-request matching keeps "mute" out of "commute" and "louder" out of a question about loudness.
    const volume = parseVolumeRequest(lower);
    if (volume && this.context.setMusicVolume) {
      const level = this.context.setMusicVolume(volume);
      if (volume.kind === 'mute') return done('volume_mute', 'Music muted.');
      if (volume.kind === 'unmute') return done('volume_unmute', `Music unmuted, at ${level} percent.`);
      return done(volume.kind === 'set' ? 'volume_set' : volume.kind === 'up' ? 'volume_up' : 'volume_down', `Music volume ${level} percent.`);
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

  private currentApproval: PendingApproval | null = null;

  setPendingApproval(approval: PendingApproval | null): void {
    this.currentApproval = approval;
  }

  getPendingApproval(): PendingApproval | null {
    return this.currentApproval ?? this.context.pendingApproval?.() ?? null;
  }

  /** Carries out a request and remembers what was said, so "say that again" repeats any kind of answer. */
  async processVoiceInput(spokenText: string, onPart?: (text: string) => void): Promise<ActionResult> {
    // A typed "Hey Kevo, why…" is the question after the name.
    // Only with a greeting, the exact name, or a comma after it: "Cave diving is fun" keeps its first word.
    // "Calvo," is Kevo misheard; only that spelling, so "Calves, cows are livestock" keeps its first word.
    const unnamed = spokenText.trim().replace(/^(?:(?:hey|hi|hello|ok|okay|yo)[\s,]+(?:[kc][aeiy]{1,2}[vb][aeo]\w{0,2}|[kc]alvo\b)|kevo\b|(?:[kc][aeiy]{1,2}[vb][aeo]\w{0,2}|[kc]alvo)(?=[,:]))[\s,.:!]+(?=\S)/i, '');
    let requests = splitRequests(stripLeadIn(unnamed));
    // "Open Brave and play YouTube": opening the site already opens the browser. Starting the browser as well
    // races it, and the late browser window lands a blank New Tab over YouTube (session 3).
    if (requests.length > 1 && requests.slice(1).some((r) => WEB_REQUEST.test(r))) {
      requests = requests.filter((r, i) => i > 0 || !opensOnlyABrowser(r));
    }
    let result: ActionResult;
    if (requests.length > 1) {
      // One after another, each with its own short reply. Not streamed: the replies are joined.
      const results: ActionResult[] = [];
      const asked = this.generation;
      for (const request of requests) {
        results.push(await this.handleOne(request));
        // Stop pressed during one part: do not go on to open, play or write the next.
        if (asked !== this.generation) return { handled: true, actionName: 'abandoned', speechReply: '' };
      }
      result = {
        handled: results.some((r) => r.handled),
        actionName: results.map((r) => r.actionName).join('+'),
        speechReply: results.map((r) => r.speechReply).filter(Boolean).join(' '),
      };
    } else {
      result = await this.handleOne(requests[0] ?? '', onPart);
    }
    if (result.speechReply && result.actionName !== 'repeat') this.lastSpoken = result.speechReply;
    return result;
  }

  private async handleOne(text: string, onPart?: (text: string) => void): Promise<ActionResult> {
    this.pruneFollowUpState();
    const result = await this.handle(text, onPart);
    const short = text.replace(/[.!?]+$/, '').trim();
    // A short name that was not a command ("Brave browser") is what a following "open it" means.
    if (short.split(/\s+/).length <= 3 && !COMMAND_START.test(short) && result.actionName !== 'greeting') {
      this.lastSubject = short;
      this.lastSubjectTime = this.now();
    }
    // "Say that again" repeats the last answer, so a pending "For how long?" still stands. Nothing else carries over.
    if (result.actionName !== 'repeat' || this.lastAction !== 'timer_unclear') {
      this.lastAction = result.actionName;
      this.lastActionTime = this.now();
    }
    return result;
  }

  /** Forget the answer being worked out: it was stopped, so it must not be saved or repeated. */
  abandon(): void {
    this.generation++;
  }

  /** A new conversation: "open it" and follow-ups must not reach back into the old one. */
  resetConversation(): void {
    this.lastSubject = '';
    this.lastSubjectTime = 0;
    this.lastAction = '';
    this.lastActionTime = 0;
  }

  private async handle(spokenText: string, onPart?: (text: string) => void): Promise<ActionResult> {
    let text = spokenText.trim();
    if (!text) {
      return { handled: false, actionName: 'none', speechReply: 'I am listening, sir.' };
    }

    // "Open it" opens what was just talked about.
    if (/^(?:open|launch|start)\s+(?:it|that|this|that one|this one|it up)[.!?]*$/i.test(text)) {
      if (!this.lastSubject) return { handled: true, actionName: 'open_unclear', speechReply: 'Open what? Say the name of the app.' };
      text = `open ${this.lastSubject}`;
    }

    let lower = text.toLowerCase();

    // Spoken approval check when an approval card is open (H.4b)
    const approval = this.getPendingApproval();
    if (approval) {
      const norm = lower.replace(/[.!?]+$/, '').trim();
      if (['yes', 'sure', 'approve', 'ok', 'okay', 'go ahead', 'confirm', 'allow'].includes(norm)) {
        if (approval.answer) {
          await approval.answer(true);
        } else if (this.context.answerApproval) {
          await this.context.answerApproval(approval.id, true);
        }
        this.setPendingApproval(null);
        return { handled: true, actionName: 'approval_approved', speechReply: 'Approved, sir.' };
      }
      if (['no', 'cancel', 'deny', 'stop', "don't", 'reject'].includes(norm)) {
        if (approval.answer) {
          await approval.answer(false);
        } else if (this.context.answerApproval) {
          await this.context.answerApproval(approval.id, false);
        }
        this.setPendingApproval(null);
        return { handled: true, actionName: 'approval_denied', speechReply: 'Cancelled, sir.' };
      }
    }

    // Clock / calendar (Phase 2B)
    if (
      lower.includes('what time') ||
      lower === 'time' ||
      lower.includes('current time') ||
      // Only the clock: "tell me the time complexity of quicksort" and "why did you tell me the time?" are for the AI.
      (/\btell me the (?:current )?time(?:,? (?:please|now))?[\s.!?]*$/.test(lower) && asksFor(lower, /\btell me the (?:current )?time\b/, /^tell me the (?:current )?time\b/)) ||
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

    // "Tell me a joke": a fresh one from icanhazdadjoke.com, always on (the owner's choice, 22 Nov 2026), whatever the
    // online lookups switch says. When the service does not answer, the AI below tells one offline.
    if (isJokeRequest(lower)) {
      const asked = this.generation;
      const joke = await fetchJoke().catch(() => null);
      // Stop pressed while the joke was on its way: say nothing and do not go on to the AI.
      if (asked !== this.generation) return { handled: true, actionName: 'abandoned', speechReply: '' };
      if (joke) return { handled: true, actionName: 'tell_joke', speechReply: joke, status: 'success', verified: true };
    }

    // Fast path for memory recall (Phase 3 Step 3.3)
    if (/^(what do you (remember|know)( about (me|myself))?|list (your |my )?memories)$/i.test(lower.replace(/[.!?]+$/, '').trim())) {
      const allFacts = this.context.listFacts ? await this.context.listFacts() : await listFacts();
      if (!allFacts || allFacts.length === 0) {
        return { handled: true, actionName: 'recall_facts', speechReply: 'I have not remembered any facts yet, sir.', status: 'success', verified: true };
      }
      const summary = allFacts.slice(-5).map((f: any) => f.fact).join('. ');
      return { handled: true, actionName: 'recall_facts', speechReply: `Here is what I remember: ${summary}.`, status: 'success', verified: true };
    }

    // Fast path for memory forget (Phase 3 Step 3.4)
    if (/^(?:forget (?:all|everything)(?: (?:you know|memories|facts))?|clear (?:all )?(?:memories|facts))$/i.test(lower.replace(/[.!?]+$/, '').trim())) {
      if (this.context.clearFacts) await this.context.clearFacts();
      else await clearFacts();
      return { handled: true, actionName: 'forget_fact', speechReply: 'I have forgotten all remembered facts, sir.', status: 'success', verified: true };
    }

    const forgetMatch = /^(?:please\s+)?(?:forget(?:\s+that|\s+what i said about|\s+my preference (?:for|about)|\s+everything (?:you know )?about|:)?)\s+(.+)$/i.exec(text.trim());
    if (forgetMatch && forgetMatch[1]) {
      const target = forgetMatch[1].trim().replace(/[.!?]+$/, '');
      if (target && !/^(?:what|who|where|when|why|how)\b/i.test(target)) {
        const matching = this.context.listFacts ? await this.context.listFacts(target) : await listFacts(target);
        if (matching && matching.length > 0) {
          for (const f of matching) {
            if (this.context.deleteFact) await this.context.deleteFact((f as any).id);
            else await deleteFact((f as any).id);
          }
          return { handled: true, actionName: 'forget_fact', speechReply: `I have forgotten that: ${(matching[0] as any).fact}`, status: 'success', verified: true };
        }
        return { handled: true, actionName: 'forget_fact', speechReply: `I do not remember anything about ${target}, sir.`, status: 'failure', verified: false, reason: 'NOT_FOUND' };
      }
    }

    // Fast path for reminder listing (Phase 4 Step 4.2)
    if (/^(what (are my reminders|reminders do i have)|list (my |all )?reminders|show (my |all )?reminders)$/i.test(lower.replace(/[.!?]+$/, '').trim())) {
      const reminders = this.context.listReminders ? await this.context.listReminders() : await listReminders();
      if (!reminders || reminders.length === 0) {
        return { handled: true, actionName: 'list_reminders', speechReply: 'You have no upcoming reminders, sir.', status: 'success', verified: true };
      }
      const summary = reminders.map((r: any) => r.message).join(', ');
      return { handled: true, actionName: 'list_reminders', speechReply: `You have ${reminders.length === 1 ? 'one upcoming reminder' : `${reminders.length} upcoming reminders`}: ${summary}.`, status: 'success', verified: true };
    }

    // Fast path for reminder cancelling (Phase 4 Step 4.2)
    const cancelRemMatch = /^(?:please\s+)?(?:cancel|clear|delete|remove)\s+(?:the\s+|my\s+)?reminder(?:\s+for|\s+to|\s+about)?\s*(.+)?$/i.exec(text.trim());
    if (cancelRemMatch && !/\btimers?\b/i.test(lower)) {
      const q = cancelRemMatch[1]?.trim().replace(/[.!?]+$/, '');
      if (!q || q.toLowerCase() === 'all' || q.toLowerCase() === 'everything') {
        if (this.context.clearReminders) await this.context.clearReminders();
        else await clearReminders();
        return { handled: true, actionName: 'cancel_reminder', speechReply: 'All reminders cleared, sir.', status: 'success', verified: true };
      }
      const ok = this.context.cancelReminder ? await this.context.cancelReminder(q) : await cancelReminder(q);
      return {
        handled: true,
        actionName: 'cancel_reminder',
        speechReply: ok ? `Cancelled reminder for ${q}, sir.` : `Could not find a reminder matching ${q}, sir.`,
        status: ok ? 'success' : 'failure',
        verified: ok,
        reason: ok ? undefined : 'NOT_FOUND',
      };
    }

    // Fast path for reminder setting ("remind me to call Mom", "set a reminder to buy milk")
    const setRemMatch = /^(?:please\s+)?(?:set a reminder|create a reminder|remind me)(?:\s+to|\s+for|\s+about)?\s+(.+)$/i.exec(text.trim());
    if (setRemMatch && !/\btimer\b/i.test(lower) && !/\bremind me in\b/i.test(lower)) {
      const remText = setRemMatch[1].trim().replace(/[.!?]+$/, '');
      if (remText && !/^(?:what|who|where|when|why|how)\b/i.test(remText)) {
        const duration = parseDuration(lower);
        const delayMs = duration ? duration.ms : 60000;
        const triggerAt = this.now() + delayMs;
        const cleanMsg = remText.replace(/\s+(?:in|after|for)\s+\d+\s*(?:seconds?|minutes?|hours?)$/i, '').trim();
        if (this.context.createReminder) {
          await this.context.createReminder(cleanMsg || remText, triggerAt);
        } else {
          await createReminder(cleanMsg || remText, triggerAt);
        }
        return {
          handled: true,
          actionName: 'create_reminder',
          speechReply: `Reminder set for ${cleanMsg || remText}, sir.`,
          status: 'success',
          verified: true,
        };
      }
    }

    // Right after an app was not found, a short name on its own ("Brave browser") is the app to open.
    if (this.lastAction === 'open_app_failed' && text.split(/\s+/).length <= 3 && !COMMAND_START.test(text)) {
      text = `open ${text}`;
      lower = text.toLowerCase();
    }

    // "play any song in YouTube", "search YouTube for lofi", "play Adele on YouTube": YouTube's search, in the browser.
    const tube = /^(?:play|search|find|look up|watch|put on|show(?: me)?)\s+(.+?)\s+(?:on|in|from)\s+youtube[.!?]*$/.exec(lower)
      ?? /^(?:search|look up)\s+youtube\s+for\s+(.+?)[.!?]*$/.exec(lower);
    if (tube && (this.context.openUrl || this.context.dryRun)) {
      const what = /^(?:any|a|some)\s+(?:song|music|track|video)s?$|^(?:something|anything|music|songs?)$/.test(tube[1]) ? 'popular songs' : tube[1];
      if (this.context.dryRun) {
        return { handled: true, actionName: 'youtube_search', speechReply: `Searching YouTube for ${what}.`, status: 'success', verified: true };
      }
      try {
        await this.context.openUrl!(`https://www.youtube.com/results?search_query=${encodeURIComponent(what)}`);
        return { handled: true, actionName: 'youtube_search', speechReply: `Searching YouTube for ${what}.`, status: 'success', verified: true };
      } catch (err) {
        const errorMsg = String(err).replace(/^Error:\s*/, '');
        return { handled: true, actionName: 'open_site_failed', speechReply: `I could not open the browser: ${errorMsg}`, status: 'failure', verified: false, error: errorMsg, reason: 'EXECUTION_FAILED' };
      }
    }

    const site = /^(?:open|play|go to|launch|start|show)\s+(?:the\s+)?(youtube|google|gmail)(?:\.com)?(?:\s+(?:website|site|page))?[.!?]*$/.exec(lower);
    if (site && (this.context.openUrl || this.context.dryRun)) {
      const { url, name } = SITES[site[1]];
      if (this.context.dryRun) {
        return { handled: true, actionName: 'open_site', speechReply: `Opening ${name}.`, status: 'success', verified: true };
      }
      try {
        await this.context.openUrl!(url);
        return { handled: true, actionName: 'open_site', speechReply: `Opening ${name}.`, status: 'success', verified: true };
      } catch (err) {
        const errorMsg = String(err).replace(/^Error:\s*/, '');
        return { handled: true, actionName: 'open_site_failed', speechReply: `I could not open the browser: ${errorMsg}`, status: 'failure', verified: false, error: errorMsg, reason: 'EXECUTION_FAILED' };
      }
    }

    const web = /^(?:search (?:the )?(?:web|internet|online) for|google|look up|search online for)\s+(.+?)[.!?]*$/.exec(lower);
    if (web && (this.context.searchWeb || this.context.dryRun)) {
      if (this.context.dryRun) {
        return { handled: true, actionName: 'web_search', speechReply: `Searching the web for ${web[1]}.`, status: 'success', verified: true };
      }
      try {
        await this.context.searchWeb!(web[1]);
        return { handled: true, actionName: 'web_search', speechReply: `Searching the web for ${web[1]}.`, status: 'success', verified: true };
      } catch (err) {
        const errorMsg = String(err).replace(/^Error:\s*/, '');
        return { handled: true, actionName: 'web_search_failed', speechReply: `I could not open the browser: ${errorMsg}`, status: 'failure', verified: false, error: errorMsg, reason: 'EXECUTION_FAILED' };
      }
    }

    // Weather (free Open-Meteo, no key): "what's the weather", "weather in Nairobi", "how's the weather in Haubstadt today".
    // Right after "Which city?", a short place name on its own is the answer.
    const onlineSwitch = parseOnlineLookupsSwitch(lower);
    if (onlineSwitch !== null && this.context.setOnlineLookupsEnabled) {
      this.context.setOnlineLookupsEnabled(onlineSwitch);
      return onlineSwitch
        ? { handled: true, actionName: 'online_lookups_on', speechReply: 'Online lookups are on. Ask, for example, what does serendipity mean, or convert 100 dollars to shillings.' }
        : { handled: true, actionName: 'online_lookups_off', speechReply: 'Online lookups are off.' };
    }
    const weatherSwitch = parseWeatherSwitch(lower);
    if (weatherSwitch !== null && this.context.setWeatherEnabled) {
      this.context.setWeatherEnabled(weatherSwitch);
      return weatherSwitch
        ? { handled: true, actionName: 'weather_on', speechReply: 'Weather is on. Ask, for example, what is the weather in Nairobi.' }
        : { handled: true, actionName: 'weather_off', speechReply: 'Weather is off.' };
    }
    const answeredPlace = this.lastAction === 'weather_needs_place' ? placeReply(text) : undefined;
    if (answeredPlace || isWeatherRequest(lower)) {
      if (!this.context.getWeather) return { handled: true, actionName: 'weather_unavailable', speechReply: 'Weather is not available right now.' };
      if (!this.context.weatherEnabled?.()) {
        return { handled: true, actionName: 'weather_off', speechReply: 'Weather is off. It asks the free Open-Meteo service, which gets the city you name. Say turn on weather to allow it.' };
      }
      const place = answeredPlace ?? weatherPlace(text);
      try {
        const summary = await this.context.getWeather(place, /\btomorrow\b/.test(lower) ? 1 : 0);
        if (!summary) return { handled: true, actionName: 'weather_needs_place', speechReply: 'Which city? Say, for example, weather in Nairobi.' };
        return { handled: true, actionName: 'weather', speechReply: summary };
      } catch (err) {
        return { handled: true, actionName: 'weather_failed', speechReply: `I could not get the weather: ${String(err).replace(/^Error:\s*/, '')}` };
      }
    }

    // Daily Briefing Scheduler (Phase 4 Step 4.3)
    // 1. "schedule daily briefing at 8 AM", "set morning briefing for 8:30"
    const scheduleBriefingMatch = /^(?:please\s+)?(?:schedule|set(?: up)?|turn on|enable)\s+(?:a\s+|the\s+)?(?:daily\s+|morning\s+)?briefing(?:\s+(?:at|for)\s+(.+))?$/i.exec(text.trim());
    if (scheduleBriefingMatch) {
      const timeStr = scheduleBriefingMatch[1]?.trim().replace(/[.!?]+$/, '') || '8:00 AM';
      try {
        const rem = this.context.scheduleDailyBriefing
          ? await this.context.scheduleDailyBriefing(timeStr)
          : await scheduleDailyBriefing(timeStr);
        const matchTime = /\((.+?)\)/.exec(rem.message)?.[1] || timeStr;
        return {
          handled: true,
          actionName: 'schedule_briefing',
          speechReply: `Daily briefing scheduled for ${matchTime} every day, sir.`,
        };
      } catch (err: any) {
        return {
          handled: true,
          actionName: 'schedule_briefing',
          speechReply: `Could not schedule daily briefing: ${err?.message || 'invalid time'}.`,
        };
      }
    }

    // 2. "turn off daily briefing", "disable daily briefing", "cancel daily briefing"
    const cancelBriefingMatch = /^(?:please\s+)?(?:turn off|disable|cancel|stop|remove)\s+(?:the\s+)?(?:daily\s+|morning\s+)?briefing(?:\s+schedule)?$/i.exec(text.trim());
    if (cancelBriefingMatch) {
      const cancelled = this.context.cancelDailyBriefing
        ? await this.context.cancelDailyBriefing()
        : await cancelDailyBriefingSchedule();
      return {
        handled: true,
        actionName: 'schedule_briefing',
        speechReply: cancelled ? 'Daily briefing disabled, sir.' : 'No daily briefing schedule was active, sir.',
      };
    }

    // 3. "when is my daily briefing?", "check daily briefing"
    const checkBriefingMatch = /^(?:when is|what is|check|status of)\s+(?:the\s+|my\s+)?(?:daily\s+|morning\s+)?briefing(?:\s+scheduled)?$/i.exec(text.trim().replace(/[.!?]+$/, ''));
    if (checkBriefingMatch) {
      const active = this.context.getDailyBriefingSchedule
        ? await this.context.getDailyBriefingSchedule()
        : await getDailyBriefingSchedule();
      if (active) {
        const timeLabel = /\((.+?)\)/.exec(active.message)?.[1] || new Date(active.trigger_at).toLocaleTimeString();
        return {
          handled: true,
          actionName: 'schedule_briefing',
          speechReply: `Daily briefing is scheduled for ${timeLabel} every day, sir.`,
        };
      }
      return {
        handled: true,
        actionName: 'schedule_briefing',
        speechReply: 'No daily briefing is currently scheduled, sir.',
      };
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
      return {
        handled: true,
        actionName: 'briefing',
        speechReply: 'Good morning, sir. All systems nominal. Ready for your command.',
      };
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

    // "Can you skip this song?" is a request; "should I skip this song?" and "please don't skip it" are not.
    if (asksFor(lower, /\b(?:next|skip(?: (?:this|the|that))?) (?:song|track)/, /^(?:(?:skip|go|jump|move|switch|play|put on|give me|advance)(?: on| ahead| forward)?(?: to)? )?(?:the )?(?:next|skip(?: (?:this|the|that))?) (?:song|track)\b/)) {
      this.context.nextTrack?.();
      return { handled: true, actionName: 'next_track', speechReply: 'Skipping to next track, sir.' };
    }

    // "Previous song", "go back a track", "skip back a track"; "what was the last song?" is a question, not a request.
    if (asksFor(lower, /\b(?:previous|prev|last|back(?: a| one)?) (?:song|track)/, /^(?:(?:go|jump|move|switch|play|put on|give me|skip)(?: back)?(?: to)? )?(?:the )?(?:previous|prev|last|a|one) (?:song|track)\b/)) {
      this.context.previousTrack?.();
      return { handled: true, actionName: 'previous_track', speechReply: 'Going back to the previous track, sir.' };
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
    const app = /^(?:open|launch|start)\s+(?:the\s+|my\s+|an?\s+)?(.+?)(?:\s+(?:app|application|program))?[.!?]*$/i.exec(text);
    if (app && (this.context.openApp || this.context.dryRun)) {
      this.lastSubject = app[1];
      this.lastSubjectTime = this.now();
      if (this.context.dryRun) {
        return { handled: true, actionName: 'open_app', speechReply: `Opening ${app[1]}.`, status: 'success', verified: true };
      }
      try {
        const opened = await this.context.openApp!(app[1]);
        if (!opened) {
          return { handled: true, actionName: 'open_app_failed', speechReply: `I could not find or launch ${app[1]}, sir.`, status: 'failure', verified: false, reason: 'NOT_FOUND' };
        }
        return { handled: true, actionName: 'open_app', speechReply: `Opening ${opened}.`, status: 'success', verified: true, verificationDetails: `Opened ${opened}` };
      } catch (err) {
        const errorMsg = String(err).replace(/^Error:\s*/, '');
        return { handled: true, actionName: 'open_app_failed', speechReply: errorMsg, status: 'failure', verified: false, error: errorMsg, reason: 'NOT_FOUND' };
      }
    }

    // 4. Note taking & Quick Capture Commands
    if (
      lower.startsWith('take a note') ||
      lower.startsWith('note that') ||
      lower.startsWith('write this down')
    ) {
      const noteContent = text
        .replace(/^(take a note(:|\s+that)?|note that|write this down(:|\s+that)?)\s*/i, '')
        .trim();
      if (noteContent && (this.context.saveQuickNote || this.context.dryRun)) {
        try {
          if (!this.context.dryRun) {
            await this.context.saveQuickNote!(noteContent);
          }
          return {
            handled: true,
            actionName: 'take_note',
            speechReply: `Note captured: ${noteContent.slice(0, 40)}...`,
            status: 'success',
            verified: true,
            verificationDetails: `Saved note (${noteContent.length} chars)`,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'take_note',
            speechReply: `Could not save note: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
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
    // A lone unknown word is a cough, a fragment or the room, not a question for the AI. "Joke" is the exception: when the
    // joke service did not answer above, the AI tells one.
    if (!/\s/.test(lower.trim()) && !isJokeRequest(lower)) return { handled: true, actionName: 'ignored', speechReply: '' };
    if (this.context.askAI) {
      try {
        // A short history keeps the local model quick and stops old exchanges steering new answers.
        const asked = this.generation;
        const squash = (t: string) => t.replace(/\s+/g, '');
        const previous = squash(getJarvisHistory().filter((t) => t.role === 'assistant').pop()?.text ?? '');
        // Sentences are held back while they only repeat the previous answer, so a stuck answer is never spoken twice.
        const holding = () => {
          let held: string[] | null = previous ? [] : null;
          return onPart && ((part: string) => {
            if (!held) return onPart(part);
            held.push(part);
            if (previous.startsWith(squash(held.join('')))) return;
            const release = held;
            held = null;
            release.forEach(onPart);
          });
        };
        let aiResult = await this.context.askAI(text, { history: getJarvisHistory(8), onPart: holding() });
        let aiAnswer = typeof aiResult === 'string' ? aiResult : (aiResult?.text ?? '');
        let aiAction = (typeof aiResult === 'object' && aiResult?.actionName) ? aiResult.actionName : 'ai_conversation';
        if (asked !== this.generation) return { handled: true, actionName: 'abandoned', speechReply: '' };
        // The same answer as last time means the model is stuck on the history, not answering: ask once more afresh.
        if (previous && squash(aiAnswer) === previous) {
          clearJarvisHistory();
          aiResult = await this.context.askAI(text, { history: [], onPart: holding() });
          aiAnswer = typeof aiResult === 'string' ? aiResult : (aiResult?.text ?? '');
          aiAction = (typeof aiResult === 'object' && aiResult?.actionName) ? aiResult.actionName : 'ai_conversation';
          if (asked !== this.generation) return { handled: true, actionName: 'abandoned', speechReply: '' };
          if (squash(aiAnswer) === previous) {
            return { handled: true, actionName: 'ai_stuck', speechReply: 'I am not sure how to answer that. Try asking it another way.' };
          }
        }
        // Saved only once answered, so a question that was stopped never steers later answers.
        appendJarvisTurn('user', text);
        appendJarvisTurn('assistant', aiAnswer);
        const objResult = typeof aiResult === 'object' && aiResult ? aiResult : null;
        return {
          handled: objResult?.status ? objResult.status !== 'failure' : true,
          actionName: aiAction,
          speechReply: aiAnswer,
          status: objResult?.status,
          verified: objResult?.verified,
          reason: objResult?.reason,
          error: objResult?.error,
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

export type VolumeRequest = { kind: 'up' | 'down' | 'mute' | 'unmute' } | { kind: 'set'; level: number };

const VOLUME_THING = '(?:the )?(?:music|sound|volume|audio|song)';
const A_BIT = '(?: (?:a (?:little )?bit|a little|some|more|a notch))?';
const VOLUME_UP = new RegExp(`^(?:turn (?:it|${VOLUME_THING}) up|turn up ${VOLUME_THING}|(?:volume|music|sound) up|(?:make it |play it )?louder|(?:increase|raise) ${VOLUME_THING}|pump it up)${A_BIT}$`);
const VOLUME_DOWN = new RegExp(`^(?:turn (?:it|${VOLUME_THING}) down|turn down ${VOLUME_THING}|(?:volume|music|sound) down|(?:make it |play it )?(?:quieter|softer)|(?:decrease|lower|reduce) ${VOLUME_THING})${A_BIT}$`);
const VOLUME_MUTE = new RegExp(`^(?:mute|silence)(?: it| ${VOLUME_THING})?$`);
const VOLUME_UNMUTE = new RegExp(`^unmute(?: it| ${VOLUME_THING})?$`);
const VOLUME_SET = new RegExp(`^(?:(?:set|put|turn|make|change) )?${VOLUME_THING.replace('volume|', '')}? ?volume (?:(?:up|down) )?(?:to |at )?(\\d{1,3})(?: ?(?:percent|%))?$`);

/** "Can you please turn it up, please" is "turn it up": the polite words around a short request. */
function withoutPoliteWords(said: string): string {
  return said
    .replace(/^(?:(?:hey |ok(?:ay)? )?kevo[\s,]+)?(?:(?:can|could|would|will) you(?: please)?|please|i want you to|go ahead and)[\s,]+/, '')
    .replace(/[\s,]+(?:please|for me|thanks|thank you)$/, '')
    .trim();
}

/** A whole request about the music volume, or null. "I have a long commute" and "how loud is a jet" are not. */
export function parseVolumeRequest(lower: string): VolumeRequest | null {
  const said = withoutPoliteWords(lower.replace(/[.!?]+$/, '').trim());
  if (VOLUME_UP.test(said)) return { kind: 'up' };
  if (VOLUME_DOWN.test(said)) return { kind: 'down' };
  if (VOLUME_MUTE.test(said)) return { kind: 'mute' };
  if (VOLUME_UNMUTE.test(said)) return { kind: 'unmute' };
  const set = VOLUME_SET.exec(said);
  if (set) return { kind: 'set', level: Math.min(100, Number(set[1])) };
  return null;
}

const WEATHER_WHEN = '(?: (?:today|now|right now|outside|tomorrow|this (?:morning|afternoon|evening)|tonight))?';
const WEATHER_PLACE = '(?: (?:in|for|at|near) [a-z][a-z .,\'-]*?)?';
/** The weather itself asked about, as the whole request. A question that only mentions weather goes to the AI. */
const WEATHER_REQUEST = new RegExp(`^(?:(?:what'?s|what is|how'?s|how is|check|tell me|give me|get(?: me)?)(?: the)? )?weather(?: (?:like|forecast|looking|report))?${WEATHER_WHEN}${WEATHER_PLACE}${WEATHER_WHEN}( (?:going to be )?like)?$`);
const MONTHS = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|next week|this week|weekend)\b/;

/** "what's the weather", "how's the weather in Nairobi", "weather for Haubstadt today". Not "open Weather" (the app), a song, or "what is the difference between weather and climate". */
export function isWeatherRequest(lower: string): boolean {
  const said = withoutPoliteWords(lower.replace(/[\u2018\u2019]/g, "'").replace(/[.!?]+$/, '').trim());
  return WEATHER_REQUEST.test(said) && !MONTHS.test(said);
}

/** "turn on weather" is true, "turn off weather" false, anything else null. */
export function parseWeatherSwitch(lower: string): boolean | null {
  const said = withoutPoliteWords(lower.replace(/[.!?]+$/, '').trim());
  const m = /^(?:(?:turn|switch) (on|off) (?:the )?weather|(?:turn|switch) (?:the )?weather (on|off)|(enable|allow|disable) (?:the )?weather)$/.exec(said);
  if (!m) return null;
  const word = m[1] ?? m[2] ?? m[3];
  return word === 'on' || word === 'enable' || word === 'allow';
}

/** The place in a weather request, as said ("in New York today" gives "New York"), or undefined. */
export function weatherPlace(text: string): string | undefined {
  const said = text.replace(/[.!?]+$/, '').trim();
  const m = /\bweather\b(?:\s+(?:like|forecast|looking|report))?(?:\s+(?:today|now|right now|outside|tomorrow|tonight))?\s+(?:in|for|at|near)\s+(.+)$/i.exec(said);
  if (!m) return undefined;
  const place = m[1].replace(/\s+(?:today|now|right now|please|tomorrow|outside|tonight|this (?:morning|afternoon|evening)|(?:going to be )?like)$/i, '').trim();
  return place || undefined;
}

/** The answer to "Which city?": a short place name ("Nairobi", "in New York"), else undefined so the request is handled as usual. */
export function placeReply(text: string): string | undefined {
  const said = text.replace(/[.!?]+$/, '').trim().replace(/^(?:in|for|at)\s+/i, '');
  if (!/^[a-z][a-z .,'-]*$/i.test(said) || said.split(/\s+/).length > 4) return undefined;
  if (/^(?:no|nope|never ?mind|cancel|stop|nothing|forget it|yes|yeah|ok|okay|thanks|thank you|who|what|where|when|why|how|which|tell|can|could|would|will|is|are|do|does|open|play|search|set|show|take|pause|skip|turn|mute)\b/i.test(said)) return undefined;
  return said;
}


/**
 * Today's weather for a place, as one spoken line, from Open-Meteo (https://open-meteo.com: free, no key).
 * Fahrenheit and mph when `fahrenheit` is set (US English), else Celsius and km/h.
 */
export async function fetchWeather(place: string, options: { fahrenheit?: boolean; day?: 0 | 1; fetchFn?: LookupFetch } = {}): Promise<string> {
  const get = (url: string) => onlineGet(url, 'the weather service', options.fetchFn);
  const asked = place.trim();
  if (!asked) throw new Error('say which city.');
  const geo = await get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(asked)}&count=1&language=en&format=json`);
  if (!geo.ok) throw new Error(`the weather service answered ${geo.status}.`);
  const found = ((await geo.json()) as { results?: { latitude: number; longitude: number; name: string; country?: string }[] }).results?.[0];
  if (!found) throw new Error(`I could not find a place called ${asked}.`);
  const units = options.fahrenheit ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const res = await get(`https://api.open-meteo.com/v1/forecast?latitude=${found.latitude}&longitude=${found.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2${units}`);
  if (!res.ok) throw new Error(`the weather service answered ${res.status}.`);
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
    daily?: { weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[] };
  };
  if (options.day === 1) {
    const hiT = data.daily?.temperature_2m_max?.[1];
    const loT = data.daily?.temperature_2m_min?.[1];
    if (typeof hiT !== 'number' || typeof loT !== 'number') throw new Error('the weather service sent no forecast for tomorrow.');
    return `Tomorrow in ${found.name}: ${weatherCodeToText(data.daily?.weather_code?.[1] ?? -1)}, high ${Math.round(hiT)}, low ${Math.round(loT)}.`;
  }
  const temp = data.current?.temperature_2m;
  if (typeof temp !== 'number') throw new Error('the weather service sent no temperature.');
  const hi = data.daily?.temperature_2m_max?.[0];
  const lo = data.daily?.temperature_2m_min?.[0];
  const wind = data.current?.wind_speed_10m;
  const parts = [`In ${found.name} it is ${Math.round(temp)} degrees and ${weatherCodeToText(data.current?.weather_code ?? -1)}.`];
  if (typeof hi === 'number' && typeof lo === 'number') parts.push(`Today's high is ${Math.round(hi)}, low ${Math.round(lo)}.`);
  if (typeof wind === 'number') parts.push(`Wind ${Math.round(wind)} ${options.fahrenheit ? 'miles' : 'kilometres'} per hour.`);
  return parts.join(' ');
}

/** WMO weather code (Open-Meteo's `weather_code`) in a few words. */
export function weatherCodeToText(code: number): string {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 57) return 'drizzling';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'raining';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snowing';
  if (code >= 95 && code <= 99) return 'stormy';
  return 'unsettled';
}

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
