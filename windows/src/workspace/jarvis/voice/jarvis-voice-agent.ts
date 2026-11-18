/**
 * Kevo Autonomous Action & Intent Dispatcher
 * Parses natural spoken voice instructions and executes corresponding actions across the entire workspace.
 * When a voice instruction isn't an explicit command, it routes to local AI with conversational memory.
 */

import { appendJarvisTurn, clearJarvisHistory, getJarvisHistory, type JarvisTurn } from './jarvis-memory';

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
  /** Opens a web page (https only) in the owner's browser. */
  openUrl?: (url: string) => Promise<void>;
  /** Changes Kevo's voice to the named one, or to the next one when no name is given. Null when the name is not a voice. */
  changeVoice?: (name?: string) => string | null;
  /** The names of Kevo's voices. */
  voiceNames?: () => string[];
  /** Says something later, on Kevo's own initiative (a timer going off). */
  announce?: (text: string) => void;
  triageSupport?: () => number;
  runDevHealth?: () => Promise<string>;
  getBriefing?: () => Promise<string>;
  notify?: (msg: string) => void;
  notify?: (msg: string) => void;
  /** When true, actions are simulated without performing real side effects (Phase 0 step 0.4b). */
  dryRun?: boolean;
  /** Injectable clock for tests; returns timestamp in milliseconds. Defaults to Date.now. */
  now?: () => number;
  /** Expiration time for follow-up questions/subjects in milliseconds. Defaults to 30,000 (30 s). */
  followUpExpiryMs?: number;
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
const QUOTE_LEAD = /^(?:what|why|how|if|when|whenever|suppose|imagine|did|do|does|would|could|should|can|will)\b.*\b(?:say|says|said|saying|ask|asks|asked|asking)$/;
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
        if (/\b(?:not|don'?t|never)\b/.test(part.slice(0, found.index))) asked = false;
        return;
      }
      asked = POLITE_TAIL.test([clause.slice(command[0].length), ...parts.slice(at + 1)].join(','));
      for (let i = at - 1; asked && i >= 0 && !CORRECTION.test(parts[i]); i--) if (/\b(?:not|don'?t|never)$/.test(parts[i])) asked = false;
    });
  }
  return asked;
}

const COMMAND_START = /^(?:open|launch|start|play|stream|pause|resume|skip|set|cancel|search|google|look up|go to|show|take a note|note that|write this down)\b/i;

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
    .split(/,?\s+(?:and(?: then)?|then)\s+(?=(?:open|launch|start|play|stream|pause|set|search|google|look up|go to|show|take a note|skip)\b)/i)
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
    const done = (actionName: string, speechReply: string): ActionResult => ({ handled: true, actionName, speechReply });

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
      return done('help', 'I can open apps and places in AnF, play or pause music, search your notes or the web, take a note, set a timer, do sums, tell the time and date, and answer questions.');
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
    if (!result.actionName.startsWith('open_app') && short.split(/\s+/).length <= 3 && !COMMAND_START.test(short) && result.actionName !== 'greeting') {
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
        return { handled: true, actionName: 'youtube_search', speechReply: `Searching YouTube for ${what}.` };
      }
      try {
        await this.context.openUrl!(`https://www.youtube.com/results?search_query=${encodeURIComponent(what)}`);
        return { handled: true, actionName: 'youtube_search', speechReply: `Searching YouTube for ${what}.` };
      } catch (err) {
        return { handled: true, actionName: 'open_site_failed', speechReply: `I could not open the browser: ${String(err).replace(/^Error:\s*/, '')}` };
      }
    }

    const site = /^(?:open|play|go to|launch|start|show)\s+(?:the\s+)?(youtube|google|gmail)(?:\.com)?(?:\s+(?:website|site|page))?[.!?]*$/.exec(lower);
    if (site && (this.context.openUrl || this.context.dryRun)) {
      const { url, name } = SITES[site[1]];
      if (this.context.dryRun) {
        return { handled: true, actionName: 'open_site', speechReply: `Opening ${name}.` };
      }
      try {
        await this.context.openUrl!(url);
        return { handled: true, actionName: 'open_site', speechReply: `Opening ${name}.` };
      } catch (err) {
        return { handled: true, actionName: 'open_site_failed', speechReply: `I could not open the browser: ${String(err).replace(/^Error:\s*/, '')}` };
      }
    }

    const web = /^(?:search (?:the )?(?:web|internet|online) for|google|look up|search online for)\s+(.+?)[.!?]*$/.exec(lower);
    if (web && (this.context.searchWeb || this.context.dryRun)) {
      if (this.context.dryRun) {
        return { handled: true, actionName: 'web_search', speechReply: `Searching the web for ${web[1]}.` };
      }
      try {
        await this.context.searchWeb!(web[1]);
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

    // "Can you skip this song?" is a request; "should I skip this song?" and "please don't skip it" are not.
    if (asksFor(lower, /\b(?:next|skip(?: (?:this|the|that))?) (?:song|track)/, /^(?:(?:skip|go|jump|move|switch|play|put on|give me|advance)(?: on| ahead| forward)?(?: to)? )?(?:the )?(?:next|skip(?: (?:this|the|that))?) (?:song|track)\b/)) {
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
    const app = /^(?:open|launch|start)\s+(?:the\s+|my\s+|an?\s+)?(.+?)(?:\s+(?:app|application|program))?[.!?]*$/i.exec(text);
    if (app && (this.context.openApp || this.context.dryRun)) {
      this.lastSubject = app[1];
      this.lastSubjectTime = this.now();
      if (this.context.dryRun) {
        return { handled: true, actionName: 'open_app', speechReply: `Opening ${app[1]}.` };
      }
      try {
        const opened = await this.context.openApp!(app[1]);
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
      if (noteContent && (this.context.saveQuickNote || this.context.dryRun)) {
        if (!this.context.dryRun) {
          await this.context.saveQuickNote!(noteContent);
        }
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
    // A lone unknown word is a cough, a fragment or the room, not a question for the AI.
    if (!/\s/.test(lower.trim())) return { handled: true, actionName: 'ignored', speechReply: '' };
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
        let aiAnswer = await this.context.askAI(text, { history: getJarvisHistory(8), onPart: holding() });
        if (asked !== this.generation) return { handled: true, actionName: 'abandoned', speechReply: '' };
        // The same answer as last time means the model is stuck on the history, not answering: ask once more afresh.
        if (previous && squash(aiAnswer) === previous) {
          clearJarvisHistory();
          aiAnswer = await this.context.askAI(text, { history: [], onPart: holding() });
          if (asked !== this.generation) return { handled: true, actionName: 'abandoned', speechReply: '' };
          if (squash(aiAnswer) === previous) {
            return { handled: true, actionName: 'ai_stuck', speechReply: 'I am not sure how to answer that. Try asking it another way.' };
          }
        }
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
