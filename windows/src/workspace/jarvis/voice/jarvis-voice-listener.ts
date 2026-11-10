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
  onError?: (err: string) => void;
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
  private onError?: (err: string) => void;

  constructor(options?: VoiceListenerOptions) {
    this.wakeWords = options?.wakeWords ?? ['jarvis', 'hey jarvis', 'ok jarvis', 'hi jarvis'];
    this.continuous = options?.continuous ?? true;
    this.onListeningStateChange = options?.onListeningStateChange;
    this.onInterimSpeech = options?.onInterimSpeech;
    this.onFinalSpeech = options?.onFinalSpeech;
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

  private handleFinalTranscript(rawText: string): void {
    let clean = rawText.trim();
    // Check if wake word prefixed, or strip wake word for natural commands
    const lower = clean.toLowerCase();
    for (const wake of this.wakeWords) {
      if (lower.startsWith(wake)) {
        clean = clean.slice(wake.length).replace(/^[,.:;\s]+/, '').trim();
        break;
      }
    }

    if (clean) {
      this.onFinalSpeech?.(clean);
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
