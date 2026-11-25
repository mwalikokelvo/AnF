/**
 * Kevo Ears Listener (Phase 1, Step 1.3)
 * On-PC hearing listener with sherpa-onnx (Silero VAD + KWS + streaming ASR)
 * capturing microphone input in Rust via cpal at 16 kHz mono.
 *
 * Implements the same public interface as JarvisVoiceListener:
 * start, stop, setMuted, keepAwake, isAwake, addStateListener, getListeningState.
 * Follow-up window and settling rules carry over directly.
 */

import { Bridge, onEvent } from '../../../core/bridge';
import { type VoiceListenerOptions, parseWakeCommand } from './jarvis-voice-listener';

export interface KevoEarsEventSource {
  onEvent: <T>(name: string, handler: (payload: T) => void) => Promise<(() => void) | void> | (() => void) | void;
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  mute?: (muted: boolean) => Promise<void>;
}

export interface KevoEarsListenerOptions extends VoiceListenerOptions {
  eventSource?: KevoEarsEventSource;
  onBargeIn?: () => void;
  /** Told what hearing is doing before it listens (the first start downloads the models). */
  onStatus?: (text: string) => void;
}

export class KevoEarsListener {
  private isRunning = false;
  private wakeWords: string[];
  private onListeningStateChange?: (listening: boolean) => void;
  private stateListeners: ((listening: boolean) => void)[] = [];
  public onInterimSpeech?: (transcript: string) => void;
  public onFinalSpeech?: (transcript: string) => void;
  public onWakeWord?: (wakeWord: string) => void;
  public onBargeIn?: () => void;
  public onError?: (err: string) => void;
  public onStatus?: (text: string) => void;
  private requireWakeWord: boolean;
  private followUpMs: number;
  private awakeUntil = 0;
  private muted = false;
  private tapPending = false;
  private settleMs: number;
  private heard: string[] = [];
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private reported = false;
  private onAwakeChange?: (awake: boolean) => void;
  private awakeTimer: ReturnType<typeof setTimeout> | undefined;
  private interim = '';
  private interimTimer: ReturnType<typeof setTimeout> | undefined;
  private promoted = '';
  private unlistenWake: (() => void) | undefined;
  private unlistenPartial: (() => void) | undefined;
  private unlistenFinal: (() => void) | undefined;
  private unlistenError: (() => void) | undefined;
  private unlistenBargeIn: (() => void) | undefined;
  private unlistenDownload: (() => void) | undefined;
  private eventSource?: KevoEarsEventSource;
  private runId = 0;
  private started: Promise<void> = Promise.resolve();

  constructor(options?: KevoEarsListenerOptions) {
    this.wakeWords = options?.wakeWords ?? ['kevo', 'keevo', 'kivo', 'kayvo', 'kebo', 'cavo', 'caval', 'cavil', 'kevel', 'kevil', 'cabo'];
    this.requireWakeWord = options?.requireWakeWord ?? true;
    this.followUpMs = options?.followUpMs ?? 8000;
    this.settleMs = options?.settleMs ?? 1100;
    this.onAwakeChange = options?.onAwakeChange;
    this.onListeningStateChange = options?.onListeningStateChange;
    this.onInterimSpeech = options?.onInterimSpeech;
    this.onFinalSpeech = options?.onFinalSpeech;
    this.onWakeWord = options?.onWakeWord;
    this.onBargeIn = options?.onBargeIn;
    this.onError = options?.onError;
    this.onStatus = options?.onStatus;
    this.eventSource = options?.eventSource;
  }

  isSupported(): boolean {
    return this.eventSource != null || (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  }

  start(): boolean {
    if (this.isRunning) return true;
    if (!this.isSupported()) {
      this.onError?.('On-PC hearing requires the AnF desktop app.');
      return false;
    }

    try {
      this.isRunning = true;
      this.tapPending = true;
      const run = ++this.runId;

      // Every event is bound before the Rust pipeline starts, so its first wake or speech is not lost.
      // Listening is reported only once the microphone is open: the first start downloads the models.
      this.started = this.bindEvents().then(() => {
        if (run !== this.runId) return; // switched off while binding: never open the mic
        return this.eventSource?.start ? this.eventSource.start() : Bridge.kevoEarsStart();
      }).then(() => {
        if (run !== this.runId) return;
        this.reportRunning(true);
        if (this.tapPending) {
          this.tapPending = false;
          this.keepAwake();
        }
      });
      this.started.catch((err: unknown) => {
        if (run !== this.runId) return; // switched off (or restarted) meanwhile
        this.onError?.(`Failed to start hearing on PC: ${String(err)}`);
        this.stop();
      });

      return true;
    } catch (err: unknown) {
      this.onError?.(`Failed to initialize Kevo ears: ${String(err)}`);
      return false;
    }
  }

  /** Resolves when the latest start has opened the microphone; rejects with why it could not. */
  whenStarted(): Promise<void> {
    return this.started;
  }

  stop(): void {
    this.isRunning = false;
    this.runId++;
    clearTimeout(this.settleTimer);
    clearTimeout(this.interimTimer);
    this.interim = '';
    this.promoted = '';
    this.heard = [];
    this.muted = false;
    this.setAwakeUntil(0);
    this.unbindEvents();
    if (this.eventSource?.stop) void this.eventSource.stop();
    else void Bridge.kevoEarsStop();
    this.reportRunning(false);
  }

  keepAwake(): void {
    this.setAwakeUntil(Date.now() + this.followUpMs);
  }

  isAwake(): boolean {
    return Date.now() < this.awakeUntil;
  }

  private setAwakeUntil(until: number): void {
    this.awakeUntil = until;
    clearTimeout(this.awakeTimer);
    const left = until - Date.now();
    this.onAwakeChange?.(left > 0);
    if (left > 0 && this.onAwakeChange) {
      this.awakeTimer = setTimeout(() => this.onAwakeChange?.(false), left);
    }
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (this.eventSource?.mute) void this.eventSource.mute(muted);
    else void Bridge.kevoEarsMute(muted);
    if (muted) {
      clearTimeout(this.settleTimer);
      clearTimeout(this.interimTimer);
      this.interim = '';
      this.promoted = '';
      this.heard = [];
    }
  }

  getListeningState(): boolean {
    return this.isRunning;
  }

  addStateListener(fn: (listening: boolean) => void): () => void {
    this.stateListeners.push(fn);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== fn);
    };
  }

  private reportRunning(running: boolean): void {
    if (this.reported === running) return;
    this.reported = running;
    this.onListeningStateChange?.(running);
    this.notifyStateListeners(running);
  }

  private notifyStateListeners(state: boolean): void {
    for (const listener of this.stateListeners) {
      try { listener(state); } catch {}
    }
  }

  private async bindEvents(): Promise<void> {
    this.unbindEvents();
    const run = this.runId;
    if (!this.isRunning) return;

    const listenFn = this.eventSource?.onEvent ?? onEvent;

    const uWake = await listenFn<string>('kevo-ears-wake', (wakeWord) => {
      if (!this.isRunning) return;
      if (this.muted) {
        this.onBargeIn?.();
      }
      this.keepAwake();
      this.onWakeWord?.(wakeWord || 'kevo');
    });
    if (run !== this.runId || !this.isRunning) {
      if (typeof uWake === 'function') uWake();
      return;
    }
    this.unlistenWake = typeof uWake === 'function' ? uWake : undefined;

    const uDownload = await listenFn<unknown>('kevo-ears-download-progress', () => {
      if (!this.isRunning || this.reported) return;
      this.onStatus?.('Kevo is downloading its hearing models (first use only, about 80 MB)…');
    });
    if (run !== this.runId || !this.isRunning) {
      this.unbindEvents();
      if (typeof uDownload === 'function') uDownload();
      return;
    }
    this.unlistenDownload = typeof uDownload === 'function' ? uDownload : undefined;

    const uBargeIn = await listenFn<void>('kevo-ears-barge-in', () => {
      if (!this.isRunning) return;
      this.onBargeIn?.();
    });
    if (run !== this.runId || !this.isRunning) {
      this.unbindEvents();
      if (typeof uBargeIn === 'function') uBargeIn();
      return;
    }
    this.unlistenBargeIn = typeof uBargeIn === 'function' ? uBargeIn : undefined;

    const uPartial = await listenFn<string>('kevo-ears-partial', (transcript) => {
      if (this.muted || !this.isRunning) return;
      const text = (transcript || '').trim();
      if (!text) return;
      this.onInterimSpeech?.(text);
      if (this.isAwake()) this.keepAwake();
      if (this.heard.length) this.settle();
      this.interim = text;
      clearTimeout(this.interimTimer);
      this.interimTimer = setTimeout(() => this.promoteInterim(), this.settleMs + 1400);
    });
    if (run !== this.runId || !this.isRunning) {
      this.unbindEvents();
      if (typeof uPartial === 'function') uPartial();
      return;
    }
    this.unlistenPartial = typeof uPartial === 'function' ? uPartial : undefined;

    const uFinal = await listenFn<string>('kevo-ears-final', (transcript) => {
      if (this.muted || !this.isRunning) return;
      const text = (transcript || '').trim();
      if (!text) return;
      const late = this.promoted && squashWords(text) === this.promoted;
      this.promoted = '';
      this.interim = '';
      clearTimeout(this.interimTimer);
      if (!late) {
        this.heard.push(text);
        this.settle();
      }
    });
    if (run !== this.runId || !this.isRunning) {
      this.unbindEvents();
      if (typeof uFinal === 'function') uFinal();
      return;
    }
    this.unlistenFinal = typeof uFinal === 'function' ? uFinal : undefined;

    const uErr = await listenFn<string>('kevo-ears-error', (err) => {
      if (!this.isRunning) return;
      this.onError?.(err);
    });
    if (run !== this.runId || !this.isRunning) {
      this.unbindEvents();
      if (typeof uErr === 'function') uErr();
      return;
    }
    this.unlistenError = typeof uErr === 'function' ? uErr : undefined;
  }

  private unbindEvents(): void {
    this.unlistenWake?.();
    this.unlistenWake = undefined;
    this.unlistenPartial?.();
    this.unlistenPartial = undefined;
    this.unlistenFinal?.();
    this.unlistenFinal = undefined;
    this.unlistenError?.();
    this.unlistenError = undefined;
    this.unlistenBargeIn?.();
    this.unlistenBargeIn = undefined;
    this.unlistenDownload?.();
    this.unlistenDownload = undefined;
  }

  private promoteInterim(): void {
    clearTimeout(this.interimTimer);
    const text = this.interim;
    this.interim = '';
    if (!text || this.muted || !this.isRunning) return;
    this.promoted = squashWords(text);
    clearTimeout(this.settleTimer);
    const all = [...this.heard, text].join(' ');
    this.heard = [];
    this.handleFinalTranscript(all);
  }

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
      return;
    }
    if (command.text) {
      this.setAwakeUntil(0);
      this.onFinalSpeech?.(command.text);
    }
  }
}

function squashWords(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
