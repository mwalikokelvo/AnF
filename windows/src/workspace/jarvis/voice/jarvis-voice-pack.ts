/**
 * JARVIS Voice Pack & Speech Synthesis Profile Registry
 * Manages custom reference voice audio samples (cloned voices) and Web Speech / Neural TTS synthesis.
 */

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  filename: string;
  isPersonaVoice?: boolean;
  accent?: string;
  style?: string;
  /** Which system voices suit this profile; the reference MP3 itself is not used to speak. */
  gender?: 'female' | 'male';
}

export const JARVIS_VOICE_PACK: readonly VoiceProfile[] = [
  {
    id: 'nath-british-calm',
    name: 'Nath (British & Calm - Classic JARVIS)',
    description: 'Engaging, British, polished and calm. True AI butler feel.',
    filename: 'Nath - engaging, british and calm.mp3',
    isPersonaVoice: true,
    accent: 'en-GB',
    gender: 'male',
    style: 'calm-butler',
  },
  {
    id: 'burt-deep-smooth',
    name: 'Burt (Deep, Smooth & Clear)',
    description: 'Deep, resonant, authoritative and articulate.',
    filename: 'Burt - deep, smooth and clear.mp3',
    accent: 'en-US',
    gender: 'male',
    style: 'authoritative',
  },
  {
    id: 'kelvin-mwamburi',
    name: 'Kelvin Mwamburi Mwaliko (Personal Voice)',
    description: 'Custom authentic personal reference voice.',
    filename: 'Kelvin mwamburi mwaliko.mp3',
    accent: 'en',
    style: 'natural',
  },
  {
    id: 'dav-movie-trailer',
    name: 'Dav (Movie Trailer Narrator)',
    description: 'Dramatic, deep and cinematic narrator voice.',
    filename: 'Dav - movie trailer narrator.mp3',
    accent: 'en-US',
    gender: 'male',
    style: 'cinematic',
  },
  {
    id: 'cart-rugged',
    name: 'Cart (Rich, Smooth & Rugged)',
    description: 'Rich, textured masculine voice.',
    filename: 'Cart - rich, smooth and rugged.mp3',
    accent: 'en-US',
    gender: 'male',
    style: 'rugged',
  },
  {
    id: 'bria-resonant',
    name: 'Bria (Deep, Resonant & Comforting)',
    description: 'Deep, soothing and comforting presence.',
    filename: 'Bria - deep, resonant and comforting.mp3',
    accent: 'en-US',
    gender: 'female',
    style: 'comforting',
  },
  {
    id: 'jean-audiobook',
    name: 'Jean (Audiobook Narrator)',
    description: 'Clear, engaging storytelling cadence.',
    filename: 'Jean - audiobook narrator.mp3',
    accent: 'en-US',
    gender: 'female',
    style: 'narrative',
  },
  {
    id: 'aust-raspy',
    name: 'Aust (Deep, Raspy & Authentic)',
    description: 'Warm, raspy and authentic conversational tone.',
    filename: 'Aust - deep, raspy and authentic.mp3',
    accent: 'en-US',
    gender: 'male',
    style: 'conversational',
  },
  {
    id: 'bra-gentle',
    name: 'Bra (Gentle & Romantic)',
    description: 'Soft, gentle and melodic presence.',
    filename: 'Bra - romantic & gentle.mp3',
    accent: 'en-US',
    gender: 'female',
    style: 'gentle',
  },
  {
    id: 'lil-velvety',
    name: 'Lil (Velvety Actress)',
    description: 'Smooth, polished feminine actress cadence.',
    filename: 'Lil - velvety actress.mp3',
    accent: 'en-US',
    gender: 'female',
    style: 'expressive',
  },
  {
    id: 'seraf-sensual',
    name: 'Seraf (Melodic & Warm)',
    description: 'Warm, expressive, melodic vocal style.',
    filename: 'Seraf - sensual temptress.mp3',
    accent: 'en-US',
    gender: 'female',
    style: 'melodic',
  },
  {
    id: 'husky-bold',
    name: 'Husky (Engaging & Bold)',
    description: 'High energy, bold and engaging announcer style.',
    filename: 'Husky, engaging and bold.mp3',
    accent: 'en-US',
    gender: 'male',
    style: 'bold',
  },
  {
    id: 'grandpa',
    name: 'Grandpa (Wise & Gentle)',
    description: 'Wise, gentle, vintage storytelling voice.',
    filename: 'grandpa.mp3',
    accent: 'en-US',
    gender: 'male',
    style: 'storyteller',
  },
];

const PREF_VOICE_KEY = 'jarvis-active-voice-id';
let _memVoiceId: string | null = null;

export function getSelectedVoiceId(): string {
  if (_memVoiceId !== null) return _memVoiceId;
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(PREF_VOICE_KEY)) || 'nath-british-calm';
  } catch {
    return 'nath-british-calm';
  }
}

export function setSelectedVoiceId(id: string): void {
  _memVoiceId = id;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PREF_VOICE_KEY, id);
  } catch {}
}

export function getSelectedVoiceProfile(): VoiceProfile {
  const id = getSelectedVoiceId();
  return JARVIS_VOICE_PACK.find(v => v.id === id) || JARVIS_VOICE_PACK[0];
}

/** Dev/build URL for a voice-pack MP3 (Vite serves /voice-pack/*). */
export function voicePackUrl(filename: string): string {
  return `/voice-pack/${encodeURIComponent(filename)}`;
}
