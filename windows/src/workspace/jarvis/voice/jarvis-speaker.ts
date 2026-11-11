/**
 * JARVIS Speech Synthesis (Text-to-Speech)
 * Plays spoken replies using Web Speech API, with an optional voice-pack MP3
 * identity cue (~1s) before speech. Falls back to a Web Audio chirp when the
 * MP3 is missing. Destructive single speaker — no V2 stack.
 */

import { getSelectedVoiceProfile, voicePackUrl } from './jarvis-voice-pack';

export interface JarvisSpeakerOptions {
  onStart?: () => void;
  onEnd?: () => void;
  duckAudio?: (duck: boolean) => void;
  /** Play ~1s identity cue before speaking. Default true. */
  identityCue?: boolean;
}

export class JarvisSpeaker {
  private isSpeaking = false;
  private audioEl: HTMLAudioElement | null = null;
  private onStart?: () => void;
  private onEnd?: () => void;
  private duckAudio?: (duck: boolean) => void;
  private identityCue: boolean;

  constructor(options?: JarvisSpeakerOptions) {
    this.onStart = options?.onStart;
    this.onEnd = options?.onEnd;
    this.duckAudio = options?.duckAudio;
    this.identityCue = options?.identityCue !== false;
  }

  /**
   * Speak a phrase out loud.
   * Ducks background music, optional identity cue, then Web Speech utterance.
   */
  async speak(text: string): Promise<void> {
    if (!text || typeof window === 'undefined') return;

    this.stop();

    const profile = getSelectedVoiceProfile();
    this.duckAudio?.(true);
    this.isSpeaking = true;
    this.onStart?.();

    if (this.identityCue) {
      await this.playIdentityCue(profile.filename);
    }

    if ('speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0 && profile.accent) {
          const matched =
            voices.find((v) => v.lang.startsWith(profile.accent!)) ||
            voices.find(
              (v) =>
                v.name.toLowerCase().includes('british') ||
                v.name.toLowerCase().includes('uk') ||
                v.name.toLowerCase().includes('george')
            );
          if (matched) utterance.voice = matched;
        }

        utterance.rate = 1.0;
        utterance.pitch =
          profile.style === 'authoritative' ? 0.9 : profile.style === 'calm-butler' ? 0.95 : 1.0;

        utterance.onend = () => {
          this.finishSpeaking();
          resolve();
        };

        utterance.onerror = () => {
          this.finishSpeaking();
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      });
    } else {
      this.finishSpeaking();
    }
  }

  /** Play ~1s of the selected voice-pack MP3, or a Web Audio chirp on miss. */
  async playIdentityCue(filename?: string): Promise<void> {
    if (typeof window === 'undefined') return;
    const name = filename || getSelectedVoiceProfile().filename;
    const played = await this.playMp3Snippet(voicePackUrl(name), 1100);
    if (!played) await this.playChirpCue();
  }

  private playMp3Snippet(url: string, maxMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(url);
        this.audioEl = audio;
        audio.volume = 0.85;
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          try {
            audio.pause();
          } catch {
            /* ignore */
          }
          if (this.audioEl === audio) this.audioEl = null;
          resolve(ok);
        };
        const timer = setTimeout(() => done(true), maxMs);
        audio.addEventListener('ended', () => {
          clearTimeout(timer);
          done(true);
        });
        audio.addEventListener('error', () => {
          clearTimeout(timer);
          done(false);
        });
        void audio.play().catch(() => {
          clearTimeout(timer);
          done(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  private async playChirpCue(): Promise<void> {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.42);
      await new Promise((r) => setTimeout(r, 450));
      await ctx.close();
    } catch {
      /* silent if Web Audio blocked */
    }
  }

  stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = null;
    }
    this.finishSpeaking();
  }

  private finishSpeaking(): void {
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.duckAudio?.(false);
      this.onEnd?.();
    }
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}
