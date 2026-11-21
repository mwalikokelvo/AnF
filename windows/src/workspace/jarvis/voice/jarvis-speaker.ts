/**
 * Kevo Speech Synthesis (Text-to-Speech)
 * Plays spoken replies using Web Speech API, with an optional voice-pack MP3
 * identity cue (~1s) before speech. Falls back to a Web Audio chirp when the
 * MP3 is missing. Destructive single speaker — no V2 stack.
 */

import { Bridge } from '../../../core/bridge';
import { getSelectedVoiceProfile, voicePackUrl, type VoiceProfile } from './jarvis-voice-pack';

const audioSampleCache = new Map<string, number[]>();

/** Decodes audio from a URL into 16 kHz mono Float32 samples for the echo canceller. */
export async function fetchAndDecodeTo16kMono(url: string): Promise<number[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const buf = await res.arrayBuffer();
    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext);
    if (!AudioCtx) return [];
    const ctx = new AudioCtx({ sampleRate: 16000 });
    try {
      const decoded = await ctx.decodeAudioData(buf);
      const ch0 = decoded.getChannelData(0);
      if (decoded.sampleRate === 16000) {
        return Array.from(ch0);
      }
      const ratio = decoded.sampleRate / 16000;
      const len = Math.floor(ch0.length / ratio);
      const out = new Array<number>(len);
      for (let i = 0; i < len; i++) {
        out[i] = ch0[Math.min(Math.floor(i * ratio), ch0.length - 1)];
      }
      return out;
    } finally {
      void ctx.close();
    }
  } catch {
    return [];
  }
}

/** Generates 420 ms of 16 kHz mono Float32 chirp samples matching playChirpCue. */
export function generateChirpSamples(): number[] {
  const sampleRate = 16000;
  const duration = 0.42;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Array<number>(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const f = 880 * Math.pow(440 / 880, Math.min(t / 0.35, 1.0));
    let g = 0.0001;
    if (t <= 0.04) {
      g = 0.0001 + (0.18 - 0.0001) * (t / 0.04);
    } else if (t <= 0.4) {
      g = 0.18 * Math.exp(-3.0 * (t - 0.04));
    } else {
      g = 0.0001;
    }
    samples[i] = g * Math.sin(2 * Math.PI * f * t);
  }
  return samples;
}

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
export function pickVoice(voices: readonly SpeechSynthesisVoice[], profile: Pick<VoiceProfile, 'accent' | 'gender'>, allowOnline = false): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    if (!/^en\b/i.test(v.lang)) continue;
    // Online voices send the reply text to the voice provider: skipped when the owner turned them off.
    if (!v.localService && !allowOnline) continue;
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
  // A sentence longer than the limit is broken at word boundaries.
  const pieces = sentences.flatMap(s => (s.length <= 220 ? [s] : s.match(/.{1,219}(?:\s|$)|\S+/g) || [s]));
  const parts: string[] = [];
  for (const s of pieces) {
    const last = parts[parts.length - 1];
    if (last && last.length + s.length <= 220) parts[parts.length - 1] = last + s;
    else parts.push(s);
  }
  return parts.map(p => p.trim()).filter(Boolean);
}

const ONLINE_VOICES_KEY = 'jarvis-allow-online-voices';
/** Online (cloud) voices send reply text to the voice provider. On unless the owner turns them off (owner's decision, 14 Nov 2026). */
export function onlineVoicesAllowed(): boolean {
  try { return localStorage.getItem(ONLINE_VOICES_KEY) !== '0'; } catch { return true; }
}
export function setOnlineVoicesAllowed(allowed: boolean): void {
  try { localStorage.setItem(ONLINE_VOICES_KEY, allowed ? '1' : '0'); } catch { /* not remembered */ }
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

/** Stops speech that is playing or queued. Does nothing when there is none. */
function cancelSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();
}

export interface JarvisSpeakerOptions {
  onStart?: () => void;
  onEnd?: () => void;
  duckAudio?: (duck: boolean) => void;
  /** Play ~1s identity cue before every reply. Default false: the cue plays on the wake word instead. */
  identityCue?: boolean;
  /** Push reference audio samples to echo canceller. Defaults to Bridge.kevoEarsPushReference. */
  onPushReference?: (samples: number[]) => void | Promise<void>;
  /** Clear reference audio on echo canceller. Defaults to Bridge.kevoEarsClearReference. */
  onClearReference?: () => void | Promise<void>;
}

export class JarvisSpeaker {
  private isSpeaking = false;
  private audioEl: HTMLAudioElement | null = null;
  private onStart?: () => void;
  private onEnd?: () => void;
  private duckAudio?: (duck: boolean) => void;
  private identityCue: boolean;
  private onPushReference?: (samples: number[]) => void | Promise<void>;
  private onClearReference?: () => void | Promise<void>;
  private utteranceToken = 0;
  private cue: Promise<void> = Promise.resolve();
  private streamWake: (() => void) | null = null;

  constructor(options?: JarvisSpeakerOptions) {
    this.onStart = options?.onStart;
    this.onEnd = options?.onEnd;
    this.duckAudio = options?.duckAudio;
    this.identityCue = options?.identityCue === true;
    this.onPushReference = options?.onPushReference;
    this.onClearReference = options?.onClearReference;
  }

  private async pushRef(samples: number[]): Promise<void> {
    if (!samples || !samples.length) return;
    try {
      if (this.onPushReference) {
        await this.onPushReference(samples);
      } else if (typeof Bridge !== 'undefined' && Bridge.kevoEarsPushReference) {
        await Bridge.kevoEarsPushReference(samples);
      }
    } catch {
      /* ignore reference push failure */
    }
  }

  private async clearRef(): Promise<void> {
    try {
      if (this.onClearReference) {
        await this.onClearReference();
      } else if (typeof Bridge !== 'undefined' && Bridge.kevoEarsClearReference) {
        await Bridge.kevoEarsClearReference();
      }
    } catch {
      /* ignore */
    }
  }

  /** Speak a phrase out loud. */
  async speak(text: string): Promise<void> {
    if (!text || typeof window === 'undefined') return;
    const stream = this.beginStream();
    stream.push(text);
    await stream.end();
  }

  /**
   * Speaks an answer while it is still being written: `push` each finished sentence, then `end`.
   * It is one stretch of speech (one start, one end), so the microphone stays rested between sentences.
   */
  beginStream(): { push: (text: string) => void; end: () => Promise<void> } {
    const queue: string[] = [];
    let ended = false;
    const before = this.utteranceToken;
    const done = (async () => {
      // Let a wake cue that is still playing finish instead of cutting it off or talking over it.
      await this.cue;
      if (before !== this.utteranceToken) return; // stopped or replaced while waiting
      this.stop();
      const token = ++this.utteranceToken;

      const profile = getSelectedVoiceProfile();
      this.duckAudio?.(true);
      this.isSpeaking = true;
      this.onStart?.();

      // Feed Kevo's speech output into echo canceller reference during normal replies (Review 1.6 Item 1)
      void (async () => {
        try {
          const url = voicePackUrl(profile.filename);
          let samples = audioSampleCache.get(url);
          if (!samples) {
            samples = await fetchAndDecodeTo16kMono(url);
            if (samples.length) audioSampleCache.set(url, samples);
          }
          if (samples && samples.length) {
            await this.pushRef(samples);
          }
        } catch {}
      })();

      if (this.identityCue) await this.playIdentityCue(profile.filename);

      const canSpeak = 'speechSynthesis' in window;
      const voices = canSpeak ? await loadVoices() : [];
      if (token !== this.utteranceToken) return; // stop() already finished this reply
      cancelSpeech(); // only when something is still queued: cancelling right before speaking clips the first word
      const voice = pickVoice(voices, profile, onlineVoicesAllowed());
      const tone = STYLE_TONE[profile.style || ''] || { rate: 1, pitch: 1 };
      for (;;) {
        if (token !== this.utteranceToken) return;
        const part = queue.shift();
        if (part === undefined) {
          if (ended) break;
          await new Promise<void>((resolve) => { this.streamWake = resolve; }); // the next sentence, the end, or stop()
          continue;
        }
        if (!canSpeak) continue;
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
    })();
    const wake = () => { const w = this.streamWake; this.streamWake = null; w?.(); };
    return {
      // Long text is spoken in sentence-sized parts: Chromium voices stop mid-sentence after ~15 s.
      push: (text) => { queue.push(...splitForSpeech(text)); wake(); },
      end: () => { ended = true; wake(); return done; },
    };
  }

  /** Play ~1s of the selected voice-pack MP3, or a Web Audio chirp on miss. */
  playIdentityCue(filename?: string): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    const name = filename || getSelectedVoiceProfile().filename;
    const cue = (async () => {
      const played = await this.playMp3Snippet(voicePackUrl(name), 1100);
      if (!played) await this.playChirpCue();
    })();
    this.cue = cue.catch(() => {});
    return this.cue;
  }

  /** Plays a voice's built-in recording in full. False when the file is not in this build. */
  async playSample(filename: string): Promise<boolean> {
    this.stop();
    const token = ++this.utteranceToken;
    // A recording is speech too: same start/end as a reply, so the microphone is muted while it plays.
    this.duckAudio?.(true);
    this.isSpeaking = true;
    this.onStart?.();
    const played = await this.playMp3Snippet(voicePackUrl(filename), 20000);
    if (token === this.utteranceToken) this.finishSpeaking();
    return played;
  }

  private playMp3Snippet(url: string, maxMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(url);
        this.audioEl = audio;
        audio.volume = 0.85;

        // Feed real playback audio into echo canceller reference (Review 1.6 Item 1)
        void (async () => {
          try {
            let samples = audioSampleCache.get(url);
            if (!samples) {
              samples = await fetchAndDecodeTo16kMono(url);
              if (samples.length) audioSampleCache.set(url, samples);
            }
            if (samples && samples.length) {
              await this.pushRef(samples);
            }
          } catch {}
        })();

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

  /** The short tone Kevo plays when it hears its name. A tone, not a clip of a voice, which sounded like a glitch. */
  playWakeTone(): Promise<void> {
    this.cue = this.playChirpCue();
    return this.cue;
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
      void this.pushRef(generateChirpSamples());
      await new Promise((r) => setTimeout(r, 450));
      await ctx.close();
    } catch {
      /* silent if Web Audio blocked */
    }
  }

  stop(): void {
    this.utteranceToken++;
    const waiting = this.streamWake; // a stream waiting for its next sentence must notice it was stopped
    this.streamWake = null;
    waiting?.();
    cancelSpeech();
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = null;
    }
    void this.clearRef();
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
