/**
 * Kevo Speech-to-Text Listener
 * Continuous & push-to-talk microphone listener with wake word support ("Hey Kevo" / "Kevo").
 * Uses webkitSpeechRecognition / SpeechRecognition API with automatic restart on pause.
 */

import type { KevoIgnoredReason } from '../kevo-log';

/** A phrase without the wake word this soon after the follow-up window closed was probably meant for Kevo. */
const WINDOW_CLOSED_MS = 10_000;

export interface VoiceListenerOptions {
  wakeWords?: string[];
  continuous?: boolean;
  onListeningStateChange?: (listening: boolean) => void;
  onInterimSpeech?: (transcript: string) => void;
  onFinalSpeech?: (transcript: string) => void;
  /** Fired when a wake word is detected (even if no follow-up command). */
  onWakeWord?: (wakeWord: string) => void;
  /** `code` is the recogniser's own error code ("network", "not-allowed", …) when it gave one. */
  onError?: (err: string, code?: string) => void;
  /** A finished phrase that was heard but not acted on, and why (Kevo's log). */
  onIgnored?: (text: string, reason: KevoIgnoredReason) => void;
  /** Act only on speech that follows a wake word (or comes inside the follow-up window). Default true. */
  requireWakeWord?: boolean;
  /** How long after a wake word, a reply or a mic tap Kevo accepts a command without the wake word. */
  followUpMs?: number;
  /** How long a pause must last before what was heard is treated as one finished request. 0 = at once. */
  settleMs?: number;
  /** Told when Kevo starts or stops accepting a command without its name (drives the orb). */
  onAwakeChange?: (awake: boolean) => void;
}

export class JarvisVoiceListener {
  private recognition: any = null;
  private isListening = false;
  private isRunning = false;
  private wakeWords: string[];
  private continuous: boolean;
  private onListeningStateChange?: (listening: boolean) => void;
  private stateListeners: ((listening: boolean) => void)[] = [];
  private onInterimSpeech?: (transcript: string) => void;
  private onFinalSpeech?: (transcript: string) => void;
  private onWakeWord?: (wakeWord: string) => void;
  private onError?: (err: string, code?: string) => void;
  private onIgnored?: (text: string, reason: KevoIgnoredReason) => void;
  private requireWakeWord: boolean;
  private followUpMs: number;
  private awakeUntil = 0;
  private muted = false;
  private tapPending = false;
  private settleMs: number;
  /** Pieces of one request: the recogniser ends a phrase at every short pause ("Kevo" ... "set a timer" ... "for one minute"). */
  private heard: string[] = [];
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private reported = false;
  private onAwakeChange?: (awake: boolean) => void;
  private awakeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Words heard but not yet confirmed. The recogniser sometimes never confirms them ("any other voice", session 3). */
  private interim = '';
  private interimTimer: ReturnType<typeof setTimeout> | undefined;
  /** An unconfirmed phrase already acted on: its late confirmation must not run it twice. */
  private promoted = '';
  private networkRetryAt = 0;

  constructor(options?: VoiceListenerOptions) {
    // Recognisers often hear "Kevo" as one of these.
    this.wakeWords = options?.wakeWords ?? ['kevo', 'keevo', 'kivo', 'kayvo', 'kebo', 'cavo', 'caval', 'cavil', 'kevel', 'kevil', 'cabo'];
    this.requireWakeWord = options?.requireWakeWord ?? true;
    this.followUpMs = options?.followUpMs ?? 8000;
    this.settleMs = options?.settleMs ?? 1100;
    this.onAwakeChange = options?.onAwakeChange;
    this.continuous = options?.continuous ?? true;
    this.onListeningStateChange = options?.onListeningStateChange;
    this.onInterimSpeech = options?.onInterimSpeech;
    this.onFinalSpeech = options?.onFinalSpeech;
    this.onWakeWord = options?.onWakeWord;
    this.onError = options?.onError;
    this.onIgnored = options?.onIgnored;
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }

  start(): boolean {
    if (this.isRunning) return true;
    if (!this.isSupported()) {
      this.onError?.('Speech recognition is not supported in this environment.');
      return false;
    }

    try {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRec();
      this.recognition.continuous = this.continuous;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        // The mic tap counts from when listening really begins (after any permission prompt), not on restarts.
        if (this.tapPending) { this.tapPending = false; this.keepAwake(); }
        this.isListening = true;
        this.reportRunning(true);
      };

      this.recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0].transcript;
          if (item.isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }
        // While Kevo speaks, the microphone hears Kevo: ignore it.
        if (this.muted) {
          if (final.trim()) this.onIgnored?.(final.trim(), 'muted');
          return;
        }

        if (final.trim()) {
          const late = this.promoted && squashWords(final) === this.promoted;
          this.promoted = '';
          if (!interim) { this.interim = ''; clearTimeout(this.interimTimer); }
          if (!late) { // a late confirmation of words already acted on is not run twice
            this.heard.push(final.trim());
            this.settle();
          }
        }

        if (interim) {
          this.onInterimSpeech?.(interim);
          // Talking inside the follow-up window: the window must not close mid-sentence.
          if (this.isAwake()) this.keepAwake();
          if (this.heard.length) this.settle(); // still talking: keep waiting for the rest
          // Words after a confirmed part ("Hey Kevo" + "change your voice") are kept until they are confirmed too.
          this.interim = interim.trim();
          clearTimeout(this.interimTimer);
          this.interimTimer = setTimeout(() => this.promoteInterim(), this.settleMs + 1400);
        }
      };

      this.recognition.onerror = (e: any) => {
        // 'aborted' is Kevo resting the microphone on purpose while it talks.
        // One dropped connection gets one quiet retry (the recogniser restarts on its own when it ends).
        if (e.error === 'network' && Date.now() - this.networkRetryAt > 30_000) {
          this.networkRetryAt = Date.now();
          return;
        }
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          this.onError?.(e.error === 'network'
            ? 'Speech recognition could not reach the internet, so Kevo cannot hear you. Check the connection, then turn the microphone on again.'
            : e.error === 'not-allowed' || e.error === 'service-not-allowed'
              ? 'Windows is not letting AnF use the microphone. Allow it in Windows privacy settings.'
              : `Speech recognition error: ${e.error}`, e.error);
          // Kevo cannot hear until this is fixed: show the microphone as off instead of "Say Kevo".
          if (['network', 'not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) this.stop();
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.promoteInterim(); // the session ended without confirming the last words
        // The recogniser ends by itself every few seconds; restart it quietly unless the owner turned the
        // microphone off or Kevo is talking (it is restarted when Kevo finishes).
        if (this.isRunning && !this.muted) setTimeout(() => this.resume(), 300);
        else if (!this.isRunning) this.reportRunning(false);
      };

      this.isRunning = true;
      // Tapping the mic counts as calling Kevo, so the first command needs no wake word.
      this.tapPending = true;
      this.recognition.start();
      return true;
    } catch (err) {
      this.onError?.(`Failed to initialize microphone listener: ${String(err)}`);
      return false;
    }
  }

  stop(): void {
    this.isRunning = false;
    this.isListening = false;
    clearTimeout(this.settleTimer);
    clearTimeout(this.interimTimer);
    this.interim = '';
    this.promoted = '';
    this.heard = [];
    this.muted = false; // a later start() is a fresh session; whoever muted will mute again when Kevo talks
    this.setAwakeUntil(0);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.reportRunning(false);
  }

  /** Accept commands without the wake word for the follow-up window (after a reply, a wake word or a mic tap). */
  keepAwake(): void {
    this.setAwakeUntil(Date.now() + this.followUpMs);
  }

  /** True while a command needs no wake word. */
  isAwake(): boolean {
    return Date.now() < this.awakeUntil;
  }

  private setAwakeUntil(until: number): void {
    this.awakeUntil = until;
    clearTimeout(this.awakeTimer);
    const left = until - Date.now();
    this.onAwakeChange?.(left > 0);
    if (left > 0 && this.onAwakeChange) this.awakeTimer = setTimeout(() => this.onAwakeChange?.(false), left);
  }

  /** Mute while Kevo is talking so its own voice is never taken as a command. */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    // Ignoring results is not enough: the recogniser hands over what it heard a moment after Kevo stops.
    // So the session is dropped while Kevo talks and a fresh one starts afterwards, with nothing buffered.
    if (muted) { clearTimeout(this.settleTimer); clearTimeout(this.interimTimer); this.interim = ''; this.promoted = ''; this.heard = []; try { this.recognition?.abort(); } catch { /* not started */ } }
    else this.resume();
  }

  private resume(): void {
    if (!this.isRunning || this.muted || this.isListening) return;
    try { this.recognition?.start(); } catch { /* already starting */ }
  }

  /** The microphone state the owner chose. It does not flicker when the recogniser restarts itself. */
  private reportRunning(running: boolean): void {
    if (this.reported === running) return;
    this.reported = running;
    this.onListeningStateChange?.(running);
    this.notifyStateListeners(running);
  }

  /** Treats words the recogniser showed but never confirmed as heard, once the speaker has stopped. */
  private promoteInterim(): void {
    clearTimeout(this.interimTimer);
    const text = this.interim;
    this.interim = '';
    if (!text || this.muted || !this.isRunning) return;
    this.promoted = squashWords(text);
    // The pause has already been waited for: act now, without a second settling delay.
    clearTimeout(this.settleTimer);
    const all = [...this.heard, text].join(' ');
    this.heard = [];
    this.handleFinalTranscript(all);
  }

  /** Acts on what was heard once the speaker has paused for long enough. */
  private settle(): void {
    clearTimeout(this.settleTimer);
    const flush = () => {
      const text = this.heard.join(' ');
      this.heard = [];
      if (text && !this.muted) this.handleFinalTranscript(text);
    };
    if (this.settleMs <= 0) flush();
    else this.settleTimer = setTimeout(flush, this.settleMs);
  }

  private handleFinalTranscript(rawText: string): void {
    const command = parseWakeCommand(rawText, this.wakeWords);
    if (command.wake) {
      this.keepAwake();
      this.onWakeWord?.(command.wake);
    } else if (this.requireWakeWord && Date.now() >= this.awakeUntil) {
      // Room talk, a TV or another assistant ("Hey Google") — not for Kevo.
      const closedFor = Date.now() - this.awakeUntil;
      this.onIgnored?.(rawText.trim(), this.awakeUntil && closedFor < WINDOW_CLOSED_MS ? 'window_closed' : 'no_wake_word');
      return;
    }
    if (command.text) {
      this.setAwakeUntil(0); // The reply re-opens the window once it has been spoken.
      this.onFinalSpeech?.(command.text);
    }
  }

  private notifyStateListeners(state: boolean): void {
    for (const listener of this.stateListeners) {
      try { listener(state); } catch {}
    }
  }

  addStateListener(fn: (listening: boolean) => void): () => void {
    this.stateListeners.push(fn);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== fn);
    };
  }

  /** True while the owner has the microphone turned on. */
  getListeningState(): boolean {
    return this.isRunning;
  }
}

function squashWords(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Finds a wake word anywhere in a phrase ("okay Kevo, what time is it") and returns what follows it. */
export function parseWakeCommand(rawText: string, wakeWords: string[]): { wake: string | null; text: string } {
  const text = rawText.trim();
  const words = [...wakeWords].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const match = new RegExp(`\\b(?:(hey|ok|okay|hi|hello)[\\s,]+)?(${words.join('|')})\\b[,.:;!?\\s]*`, 'i').exec(text);
  if (!match) return { wake: null, text };
  let after = text.slice(match.index + match[0].length).trim();
  if (/^(please|thanks|thank you|now|sir)?[.!?]*$/i.test(after)) after = ''; // "What time is it, Kevo, please?"
  // "What time is it, Kevo?" puts the command before the name.
  const before = text.slice(0, match.index).replace(/[,.:;!?\s]+$/, '').trim();
  return { wake: [match[1], match[2]].filter(Boolean).join(' ').toLowerCase(), text: after || before };
}
