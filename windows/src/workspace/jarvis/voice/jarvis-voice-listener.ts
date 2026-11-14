/**
 * JARVIS Speech-to-Text Listener
 * Continuous & push-to-talk microphone listener with wake word support ("Hey Jarvis" / "Jarvis").
 * Uses webkitSpeechRecognition / SpeechRecognition API with automatic restart on pause.
 */

export interface VoiceListenerOptions {
  wakeWords?: string[];
  continuous?: boolean;
  onListeningStateChange?: (listening: boolean) => void;
  onInterimSpeech?: (transcript: string) => void;
  onFinalSpeech?: (transcript: string) => void;
  /** Fired when a wake word is detected (even if no follow-up command). */
  onWakeWord?: (wakeWord: string) => void;
  onError?: (err: string) => void;
  /** Act only on speech that follows a wake word (or comes inside the follow-up window). Default true. */
  requireWakeWord?: boolean;
  /** How long after a wake word, a reply or a mic tap JARVIS accepts a command without the wake word. */
  followUpMs?: number;
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
  private onError?: (err: string) => void;
  private requireWakeWord: boolean;
  private followUpMs: number;
  private awakeUntil = 0;
  private muted = false;

  constructor(options?: VoiceListenerOptions) {
    // Recognisers often hear "Jarvis" as one of these.
    this.wakeWords = options?.wakeWords ?? ['jarvis', 'jervis', 'javis', 'jarvas', 'jarvice'];
    this.requireWakeWord = options?.requireWakeWord ?? true;
    this.followUpMs = options?.followUpMs ?? 8000;
    this.continuous = options?.continuous ?? true;
    this.onListeningStateChange = options?.onListeningStateChange;
    this.onInterimSpeech = options?.onInterimSpeech;
    this.onFinalSpeech = options?.onFinalSpeech;
    this.onWakeWord = options?.onWakeWord;
    this.onError = options?.onError;
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
        this.isListening = true;
        this.onListeningStateChange?.(true);
        this.notifyStateListeners(true);
      };

      this.recognition.onresult = (event: any) => {
        // While JARVIS speaks, the microphone hears JARVIS: ignore it.
        if (this.muted) return;
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

        if (interim) {
          this.onInterimSpeech?.(interim);
        }

        if (final.trim()) {
          this.handleFinalTranscript(final.trim());
        }
      };

      this.recognition.onerror = (e: any) => {
        if (e.error !== 'no-speech') {
          this.onError?.(`Speech recognition error: ${e.error}`);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.onListeningStateChange?.(false);
        this.notifyStateListeners(false);
        // Automatically restart if user hasn't explicitly stopped it
        if (this.isRunning) {
          try {
            setTimeout(() => {
              if (this.isRunning) this.recognition?.start();
            }, 300);
          } catch {}
        }
      };

      this.isRunning = true;
      // Tapping the mic counts as calling JARVIS, so the first command needs no wake word.
      this.keepAwake();
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
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.onListeningStateChange?.(false);
  }

  /** Accept commands without the wake word for the follow-up window (after a reply, a wake word or a mic tap). */
  keepAwake(): void {
    this.awakeUntil = Date.now() + this.followUpMs;
  }

  /** Mute while JARVIS is talking so its own voice is never taken as a command. */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private handleFinalTranscript(rawText: string): void {
    const command = parseWakeCommand(rawText, this.wakeWords);
    if (command.wake) {
      this.keepAwake();
      this.onWakeWord?.(command.wake);
    } else if (this.requireWakeWord && Date.now() > this.awakeUntil) {
      return; // Room talk, a TV or another assistant ("Hey Google") — not for JARVIS.
    }
    if (command.text) {
      this.awakeUntil = 0; // The reply re-opens the window once it has been spoken.
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

  getListeningState(): boolean {
    return this.isListening;
  }
}

/** Finds a wake word anywhere in a phrase ("okay Jarvis, what time is it") and returns what follows it. */
export function parseWakeCommand(rawText: string, wakeWords: string[]): { wake: string | null; text: string } {
  const text = rawText.trim();
  const words = [...wakeWords].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const match = new RegExp(`\\b(?:(hey|ok|okay|hi|hello)[\\s,]+)?(${words.join('|')})\\b[,.:;!?\\s]*`, 'i').exec(text);
  if (!match) return { wake: null, text };
  const after = text.slice(match.index + match[0].length).trim();
  // "What time is it, Jarvis?" puts the command before the name.
  const before = text.slice(0, match.index).replace(/[,.:;!?\s]+$/, '').trim();
  return { wake: [match[1], match[2]].filter(Boolean).join(' ').toLowerCase(), text: after || before };
}
