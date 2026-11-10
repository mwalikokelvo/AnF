/**
 * JARVIS Speech Synthesis (Text-to-Speech)
 * Plays spoken replies using Web Speech API or custom neural sample previews.
 * Features automatic audio ducking: coordinates with Music Hub / Audio Studio to lower/pause music while JARVIS speaks.
 */

import { getSelectedVoiceProfile } from './jarvis-voice-pack';

export interface JarvisSpeakerOptions {
  onStart?: () => void;
  onEnd?: () => void;
  duckAudio?: (duck: boolean) => void;
}

export class JarvisSpeaker {
  private isSpeaking = false;
  private audioEl: HTMLAudioElement | null = null;
  private onStart?: () => void;
  private onEnd?: () => void;
  private duckAudio?: (duck: boolean) => void;

  constructor(options?: JarvisSpeakerOptions) {
    this.onStart = options?.onStart;
    this.onEnd = options?.onEnd;
    this.duckAudio = options?.duckAudio;
  }

  /**
   * Speak a phrase out loud.
   * Ducks background music, selects voice based on active profile, and restores music once done.
   */
  async speak(text: string): Promise<void> {
    if (!text || typeof window === 'undefined') return;

    this.stop();

    const profile = getSelectedVoiceProfile();
    this.duckAudio?.(true);
    this.isSpeaking = true;
    this.onStart?.();

    if ('speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);

        // Find best matching voice
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          if (profile.accent) {
            const matched = voices.find(v => v.lang.startsWith(profile.accent!)) ||
                            voices.find(v => v.name.toLowerCase().includes('british') || v.name.toLowerCase().includes('uk') || v.name.toLowerCase().includes('george'));
            if (matched) utterance.voice = matched;
          }
        }

        utterance.rate = 1.0;
        utterance.pitch = profile.style === 'authoritative' ? 0.9 : profile.style === 'calm-butler' ? 0.95 : 1.0;

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
