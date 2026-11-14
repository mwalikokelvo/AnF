/**
 * JARVIS Speech Synthesis (Text-to-Speech)
 * Plays spoken replies using Web Speech API, with an optional voice-pack MP3
 * identity cue (~1s) before speech. Falls back to a Web Audio chirp when the
 * MP3 is missing. Destructive single speaker — no V2 stack.
 */

import { getSelectedVoiceProfile, voicePackUrl, type VoiceProfile } from './jarvis-voice-pack';

const STYLE_TONE: Record<string, { rate: number; pitch: number }> = {
  'calm-butler': { rate: 0.95, pitch: 0.95 },
  authoritative: { rate: 0.93, pitch: 0.88 },
  cinematic: { rate: 0.9, pitch: 0.85 },
  rugged: { rate: 0.95, pitch: 0.9 },
  comforting: { rate: 0.92, pitch: 0.95 },
  narrative: { rate: 0.96, pitch: 1 },
  gentle: { rate: 0.92, pitch: 1.05 },
  expressive: { rate: 0.98, pitch: 1.05 },
  melodic: { rate: 0.94, pitch: 1.05 },
  bold: { rate: 1.04, pitch: 1 },
  storyteller: { rate: 0.88, pitch: 0.85 },
};

const FEMALE = /\b(female|woman|aria|jenny|michelle|sonia|libby|maisie|natasha|clara|emma|ava|ana|zira|hazel|susan|samantha|karen|moira|tessa|serena|victoria|fiona|kate|heera|neerja|zuri|imani)\b/i;
const MALE = /\b(male|man|guy|ryan|christopher|eric|roger|steffan|thomas|brian|andrew|william|liam|david|mark|george|daniel|james|alex|fred|oliver|arthur|elimu|abeo)\b/i;

/** Picks the most natural installed voice for a profile: neural voices first, then accent, then gender. */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], profile: Pick<VoiceProfile, 'accent' | 'gender'>): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    if (!/^en\b/i.test(v.lang)) continue;
    let score = 0;
    if (/natural|neural|online/i.test(v.name)) score += 6; // Edge/WebView2 neural voices sound human
    else if (/google/i.test(v.name)) score += 3;
    if (profile.accent && v.lang.toLowerCase() === profile.accent.toLowerCase()) score += 3;
    else if (profile.accent && v.lang.toLowerCase().startsWith(profile.accent.slice(0, 2).toLowerCase())) score += 1;
    if (profile.gender === 'female') score += FEMALE.test(v.name) ? 4 : MALE.test(v.name) ? -4 : 0;
    if (profile.gender === 'male') score += MALE.test(v.name) ? 4 : FEMALE.test(v.name) ? -4 : 0;
    if (v.localService) score += 0.5; // works offline
    if (score > bestScore) { best = v; bestScore = score; }
  }
  return best;
}

/** Splits a reply into sentence-sized parts of at most ~220 characters. */
export function splitForSpeech(text: string): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?;:]+[.!?;:]*\s*/g) || [];
  const parts: string[] = [];
  for (const s of sentences) {
    const last = parts[parts.length - 1];
    if (last && last.length + s.length <= 220) parts[parts.length - 1] = last + s;
    else parts.push(s);
  }
  return parts.map(p => p.trim()).filter(Boolean);
}

/** Voices load asynchronously in Chromium; wait briefly for the list instead of speaking with the default voice. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => { synth.removeEventListener('voiceschanged', done); clearTimeout(timer); resolve(synth.getVoices()); };
    const timer = setTimeout(done, 1500);
    synth.addEventListener('voiceschanged', done);
  });
}

export interface JarvisSpeakerOptions {
  onStart?: () => void;
  onEnd?: () => void;
  duckAudio?: (duck: boolean) => void;
  /** Play ~1s identity cue before every reply. Default false: the cue plays on the wake word instead. */
  identityCue?: boolean;
}

export class JarvisSpeaker {
  private isSpeaking = false;
  private audioEl: HTMLAudioElement | null = null;
  private onStart?: () => void;
  private onEnd?: () => void;
  private duckAudio?: (duck: boolean) => void;
  private identityCue: boolean;
  private utteranceToken = 0;

  constructor(options?: JarvisSpeakerOptions) {
    this.onStart = options?.onStart;
    this.onEnd = options?.onEnd;
    this.duckAudio = options?.duckAudio;
    this.identityCue = options?.identityCue === true;
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
      window.speechSynthesis.cancel();
      const voice = pickVoice(await loadVoices(), profile);
      const tone = STYLE_TONE[profile.style || ''] || { rate: 1, pitch: 1 };
      const token = ++this.utteranceToken;
      // Long replies are spoken sentence by sentence: Chromium voices stop mid-sentence after ~15 s.
      for (const part of splitForSpeech(text)) {
        if (token !== this.utteranceToken) break;
        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(part);
          if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
          }
          utterance.rate = tone.rate;
          utterance.pitch = tone.pitch;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.speak(utterance);
        });
      }
      if (token === this.utteranceToken) this.finishSpeaking();
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
    this.utteranceToken++;
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
