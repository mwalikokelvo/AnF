/**
 * MiniMind Fast Intent Router for Kevo
 * 
 * Provides ultra-lightweight, zero-latency intent classification
 * and entity extraction (< 1ms on CPU) for voice commands before
 * routing to heavy LLM models.
 * Inspired by jingyaogong/minimind.
 */

export type KevoIntentType =
  | 'TELL_TIME'
  | 'TELL_DATE'
  | 'MUSIC_PLAY'
  | 'MUSIC_PAUSE'
  | 'MUSIC_NEXT'
  | 'MUSIC_PREV'
  | 'WHATS_PLAYING'
  | 'TIMER_SET'
  | 'REMINDER_CREATE'
  | 'NOTE_CREATE'
  | 'CONVERT_UNITS'
  | 'RANDOM_ADVICE'
  | 'TODAY_IN_HISTORY'
  | 'TRANSCRIBE_VIDEO'
  | 'DEEP_CHAT';

export interface IntentResult {
  intent: KevoIntentType;
  confidence: number;
  slots: Record<string, string>;
  isInstantCommand: boolean;
}

/** Rapidly classify user utterance into Kevo intent and extract parameters. */
export function classifyKevoIntent(utterance: string): IntentResult {
  if (!utterance || typeof utterance !== 'string') {
    return { intent: 'DEEP_CHAT', confidence: 0, slots: {}, isInstantCommand: false };
  }

  const text = utterance.trim().toLowerCase();

  // 1. Time & Date
  if (/^(what time is it|what's the time|tell me the time|current time)\b/.test(text)) {
    return { intent: 'TELL_TIME', confidence: 0.99, slots: {}, isInstantCommand: true };
  }
  if (/^(what('s| is) (today's date|the date)|what day is it|tell me the date)\b/.test(text)) {
    return { intent: 'TELL_DATE', confidence: 0.99, slots: {}, isInstantCommand: true };
  }

  // 2. Music Controls
  if (/^(what's playing|what song is this|what track is playing|current song)\b/.test(text)) {
    return { intent: 'WHATS_PLAYING', confidence: 0.98, slots: {}, isInstantCommand: true };
  }
  if (/^(pause|pause music|stop playback|pause song)\b/.test(text)) {
    return { intent: 'MUSIC_PAUSE', confidence: 0.98, slots: {}, isInstantCommand: true };
  }
  if (/^(resume|play|unpause|resume playback)\b/.test(text) && !text.includes('play song') && !text.includes('play artist')) {
    return { intent: 'MUSIC_PLAY', confidence: 0.95, slots: {}, isInstantCommand: true };
  }
  if (/^(next track|next song|skip song|skip track)\b/.test(text)) {
    return { intent: 'MUSIC_NEXT', confidence: 0.98, slots: {}, isInstantCommand: true };
  }
  if (/^(previous track|previous song|last song)\b/.test(text)) {
    return { intent: 'MUSIC_PREV', confidence: 0.98, slots: {}, isInstantCommand: true };
  }
  const playMatch = text.match(/^(?:play|listen to)\s+(.+)$/);
  if (playMatch && !playMatch[1].startsWith('youtube')) {
    return { intent: 'MUSIC_PLAY', confidence: 0.92, slots: { query: playMatch[1] }, isInstantCommand: true };
  }

  // 3. Timers & Reminders
  const timerMatch = text.match(/(?:set|start)(?:\s+a)?\s+timer\s+for\s+(\d+)\s*(seconds?|minutes?|hours?)/);
  if (timerMatch) {
    return {
      intent: 'TIMER_SET',
      confidence: 0.95,
      slots: { amount: timerMatch[1], unit: timerMatch[2] },
      isInstantCommand: true,
    };
  }

  const reminderMatch = text.match(/remind\s+me\s+(?:in\s+(\d+\s*(?:minutes?|hours?|days?))\s+)?to\s+(.+)/);
  if (reminderMatch) {
    return {
      intent: 'REMINDER_CREATE',
      confidence: 0.95,
      slots: {
        timeframe: reminderMatch[1] || 'later',
        task: reminderMatch[2].trim(),
      },
      isInstantCommand: true,
    };
  }

  // 4. Note taking
  const noteMatch = text.match(/(?:take|make|write)(?:\s+a)?\s+note\s*(?::|that|saying)?\s+(.+)/);
  if (noteMatch) {
    return {
      intent: 'NOTE_CREATE',
      confidence: 0.94,
      slots: { text: noteMatch[1].trim() },
      isInstantCommand: true,
    };
  }

  // 5. Unit Conversion
  const convertMatch = text.match(/(?:convert|how many)\s+([\d.]+)\s*([a-zA-Z]+)\s+(?:in|to|into)\s+([a-zA-Z]+)/);
  if (convertMatch) {
    return {
      intent: 'CONVERT_UNITS',
      confidence: 0.96,
      slots: { amount: convertMatch[1], from: convertMatch[2], to: convertMatch[3] },
      isInstantCommand: true,
    };
  }

  // 6. Advice & History
  if (/(?:give me|any)\s+(?:random\s+)?advice|life tip/i.test(text)) {
    return { intent: 'RANDOM_ADVICE', confidence: 0.95, slots: {}, isInstantCommand: true };
  }
  if (/today in history|what happened today in history/i.test(text)) {
    return { intent: 'TODAY_IN_HISTORY', confidence: 0.97, slots: {}, isInstantCommand: true };
  }

  // 7. Video Transcripts (preserve case for video IDs and URLs)
  const transMatch = utterance.match(/(?:transcribe|extract transcript from)\s+(https?:\/\/\S+|[a-zA-Z0-9_-]{11})/i);
  if (transMatch) {
    return {
      intent: 'TRANSCRIBE_VIDEO',
      confidence: 0.98,
      slots: { url: transMatch[1] },
      isInstantCommand: true,
    };
  }

  // 8. Otherwise route to full AI chat
  return {
    intent: 'DEEP_CHAT',
    confidence: 0.5,
    slots: { query: utterance },
    isInstantCommand: false,
  };
}
