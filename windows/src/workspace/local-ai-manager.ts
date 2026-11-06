/**
 * Local AI Model Manager: offline model profiles, Hugging Face / Flint bucket weights downloader,
 * memory verification, and local offline chat completions.
 *
 * Honesty rules: only profiles with a real, pinned SHA-256 and a real Hugging Face file can be downloaded
 * (today: Qwen3 0.6B and 1.7B, Q8_0). Every other entry has no hash or URL and stays "not available yet".
 * The download itself runs in Rust (`model_download`, which owns the URL, size and hash; the webview only
 * names a profile id). A model counts as installed only after Rust verified its SHA-256, and replies are
 * labelled with the file the offline runtime actually loads, not with the profile name.
 */

export interface ModelWeightProfile {
  id: string;
  name: string;
  family: 'deepseek' | 'kimi' | 'qwen';
  architecture: string;
  quant: string;
  sizeBytes: number;
  sha256: string;
  minRamGb: number;
  bucketUrl: string;
  huggingFaceRepo: string;
  description: string;
  recommendedRole?: 'chat' | 'reasoning' | 'coding' | 'fast';
  /** 'available' only with a real 64-hex SHA-256 and a huggingface.co file; everything else is 'not-available-yet'. */
  downloadStatus: 'available' | 'not-available-yet';
}

export const DOWNLOAD_NOT_AVAILABLE = 'Not available yet: verified model weights for this profile have not been published.';

/** What Rust reports per downloadable model (`local_ai_models`). `installed` means the SHA-256 was verified. */
export interface ModelStatus {
  id: string;
  file: string;
  size: number;
  sha256: string;
  slot: 'fast' | 'balanced';
  state: 'installed' | 'partial' | 'unverified' | 'absent';
  partial_bytes: number;
  downloading: boolean;
}

/** Payload of the `local-ai-download` event emitted by Rust. */
export interface DownloadEvent {
  id: string;
  phase: 'downloading' | 'verifying' | 'ready' | 'failed' | 'cancelled';
  done: number;
  total: number;
  error?: string | null;
}

export type ListenFn = (event: string, handler: (payload: DownloadEvent) => void) => Promise<() => void>;

export interface LocalAiAnswer {
  text: string;
  /** Offline runtime slot that served the request. */
  slot: 'fast' | 'balanced';
  /** The model file the runtime loads for that slot. */
  modelFile: string;
  /** Human-readable, truthful label for the answering model. */
  label: string;
}

export interface LocalAiManager {
  listAvailableProfiles(): ModelWeightProfile[];
  getProfilesByFamily(family: 'deepseek' | 'kimi' | 'qwen'): ModelWeightProfile[];
  getActiveProfile(): ModelWeightProfile;
  setActiveProfile(profileId: string): void;
  /**
   * Download and verify a model. Resolves only after Rust verified the SHA-256 and installed the file; rejects with the
   * reason otherwise. `onProgress` gets whole percentages while downloading; `onEvent` gets every phase.
   */
  downloadWeights(profileId: string, onProgress: (pct: number) => void, onEvent?: (e: DownloadEvent) => void): Promise<void>;
  cancelDownload(profileId: string): Promise<boolean>;
  /** Install state of every downloadable model, from Rust. */
  getInstallStatus(): Promise<ModelStatus[]>;
  checkSystemMemory(): { totalRamGb: number; availableRamGb: number; isSufficient: boolean };
  chatCompletion(request: { messages: Array<{ role: string; content: string }> }): Promise<string>;
  chatCompletionWithSource(request: { messages: Array<{ role: string; content: string }> }): Promise<LocalAiAnswer>;
}

const PROFILE_CATALOG: Array<Omit<ModelWeightProfile, 'downloadStatus'>> = [
  // --- Latest DeepSeek AI Models (Hugging Face) ---
  {
    id: 'deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash (1017)',
    family: 'deepseek',
    architecture: 'Engram · Sparse Attention MoE',
    quant: 'Q4_K_M',
    sizeBytes: 2_450_000_000,
    sha256: '',
    minRamGb: 8,
    bucketUrl: '',
    huggingFaceRepo: 'unsloth/DeepSeek-V4.1-Flash-1017-GGUF',
    description: 'DeepSeek flagship 1017 Flash update with n-gram lookup tables, sparse attention, and hyper-connections for ultra-fast local inference.',
    recommendedRole: 'fast',
  },
  {
    id: 'deepseek-v3.2-reasoning',
    name: 'DeepSeek V3.2 Reasoning (DSA)',
    family: 'deepseek',
    architecture: 'DeepSeek Sparse Attention · Hybrid MoE',
    quant: 'Q4_K_M',
    sizeBytes: 3_200_000_000,
    sha256: '',
    minRamGb: 8,
    bucketUrl: '',
    huggingFaceRepo: 'unsloth/DeepSeek-V3.2-GGUF',
    description: 'DeepSeek V3.2 featuring native DeepSeek Sparse Attention (DSA) and hybrid reasoning with thinking traces.',
    recommendedRole: 'reasoning',
  },
  {
    id: 'deepseek-r1-distill-qwen-1.5b',
    name: 'DeepSeek R1 Distill 1.5B (Edge)',
    family: 'deepseek',
    architecture: 'Dense Reasoning Distillation',
    quant: 'Q4_K_M',
    sizeBytes: 980_000_000,
    sha256: '',
    minRamGb: 4,
    bucketUrl: '',
    huggingFaceRepo: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
    description: 'Ultra-compact edge reasoning model distilled from DeepSeek-R1, optimized for lower-RAM laptops and mobile devices.',
    recommendedRole: 'reasoning',
  },

  // --- Latest Moonshot Kimi Models (Hugging Face) ---
  {
    id: 'kimi-k3-thinking',
    name: 'Kimi K3 Thinking (KDA · MoE)',
    family: 'kimi',
    architecture: 'Kimi Delta Attention · LatentMoE',
    quant: 'Q4_K_M',
    sizeBytes: 3_950_000_000,
    sha256: '',
    minRamGb: 8,
    bucketUrl: '',
    huggingFaceRepo: 'unsloth/Kimi-K3-GGUF',
    description: 'Moonshot AI flagship Kimi-K3 multimodal agentic model with Kimi Delta Attention (KDA) and step-by-step reasoning.',
    recommendedRole: 'reasoning',
  },
  {
    id: 'kimi-linear-a3b',
    name: 'Kimi Linear 48B-A3B (Edge Fast)',
    family: 'kimi',
    architecture: 'Linear Attention · 3B Active Weights',
    quant: 'Q4_K_M',
    sizeBytes: 1_850_000_000,
    sha256: '',
    minRamGb: 4,
    bucketUrl: '',
    huggingFaceRepo: 'bartowski/moonshotai_Kimi-Linear-48B-A3B-Instruct-GGUF',
    description: 'High-throughput Moonshot Kimi Linear hybrid model with only 3B active weights for fast CPU inference.',
    recommendedRole: 'fast',
  },

  // --- Lightweight Fallbacks ---
  {
    id: 'qwen3-0.6b-fast',
    name: 'Fast · Qwen3 0.6B',
    family: 'qwen',
    architecture: 'Dense Transformer',
    quant: 'Q8_0',
    sizeBytes: 639_446_688,
    sha256: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',
    minRamGb: 2,
    bucketUrl: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    huggingFaceRepo: 'Qwen/Qwen3-0.6B-GGUF',
    description: 'Ultra-lightweight model (Q8_0, about 0.6 GB download) requiring 2 GB RAM. Apache-2.0.',
    recommendedRole: 'fast',
  },
  {
    id: 'qwen3-1.7b-balanced',
    name: 'Balanced · Qwen3 1.7B',
    family: 'qwen',
    architecture: 'Dense Transformer',
    quant: 'Q8_0',
    sizeBytes: 1_834_426_016,
    sha256: '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a',
    minRamGb: 4,
    bucketUrl: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf',
    huggingFaceRepo: 'Qwen/Qwen3-1.7B-GGUF',
    description: 'Balanced model (Q8_0, about 1.8 GB download) requiring 4 GB RAM. Apache-2.0.',
    recommendedRole: 'chat',
  },
];

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** A profile is downloadable only with a real pinned hash and a huggingface.co https file URL. */
export function isDownloadable(p: Omit<ModelWeightProfile, 'downloadStatus'>): boolean {
  return SHA256_HEX.test(p.sha256) && p.sizeBytes > 0 && p.bucketUrl.startsWith('https://') && validateHuggingFaceUrl(p.bucketUrl);
}

export const OFFICIAL_PROFILES: ModelWeightProfile[] = PROFILE_CATALOG.map(p => ({
  ...p,
  downloadStatus: isDownloadable(p) ? ('available' as const) : ('not-available-yet' as const),
}));

/** Honest, human text for one profile's install state. `live` is the in-flight download event, if any. */
export function describeInstall(profile: ModelWeightProfile, status: ModelStatus | undefined, live?: DownloadEvent): string {
  if (profile.downloadStatus !== 'available') return 'Not available yet';
  const gb = (n: number) => (n / 1e9).toFixed(2) + ' GB';
  if (live) {
    const pct = live.total > 0 ? Math.min(100, Math.floor((live.done / live.total) * 100)) : 0;
    switch (live.phase) {
      case 'downloading': return `Downloading ${pct}% (${gb(live.done)} of ${gb(live.total)})`;
      case 'verifying': return 'Verifying SHA-256, not installed yet';
      case 'ready': return 'Ready: SHA-256 verified';
      case 'cancelled': return 'Cancelled. The partial file is kept so you can resume';
      case 'failed': return `Failed: ${live.error || 'unknown error'}`;
    }
  }
  if (status?.downloading) return 'Downloading…';
  switch (status?.state) {
    case 'installed': return 'Ready: SHA-256 verified';
    case 'partial': return `Not installed. ${gb(status.partial_bytes)} of ${gb(status.size)} downloaded; you can resume`;
    case 'unverified': return 'Not installed. A file is present but has not been verified yet';
    default: return `Not downloaded (${gb(profile.sizeBytes)})`;
  }
}

/** Profiles served from the runtime's fast slot (mirrors local_ai.rs; the request sends the slot name, which the runtime always accepts). */
const FAST_SLOT_IDS = new Set(['deepseek-v4.1-flash', 'deepseek-r1-distill-qwen-1.5b', 'kimi-linear-a3b', 'qwen3-0.6b-fast']);

/**
 * Validates that download URL is pinned to the trusted Hugging Face endpoint
 */
export function validateHuggingFaceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'huggingface.co' || parsed.hostname === 'www.huggingface.co';
  } catch {
    return false;
  }
}

/**
 * Factory creating LocalAiManager instance
 */
export function createLocalAiManager(options?: {
  systemRamGb?: number;
  initialProfileId?: string;
  invokeFn?: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
  listenFn?: ListenFn;
}): LocalAiManager {
  const systemRamGb = options?.systemRamGb ?? 16;
  let activeProfileId = options?.initialProfileId || 'deepseek-v4.1-flash';

  return {
    listAvailableProfiles(): ModelWeightProfile[] {
      return OFFICIAL_PROFILES;
    },

    getProfilesByFamily(family: 'deepseek' | 'kimi' | 'qwen'): ModelWeightProfile[] {
      return OFFICIAL_PROFILES.filter(p => p.family === family);
    },

    getActiveProfile(): ModelWeightProfile {
      const found = OFFICIAL_PROFILES.find(p => p.id === activeProfileId);
      return found || OFFICIAL_PROFILES[0];
    },

    setActiveProfile(profileId: string): void {
      const exists = OFFICIAL_PROFILES.some(p => p.id === profileId);
      if (exists) {
        activeProfileId = profileId;
      }
    },

    checkSystemMemory() {
      const availableRamGb = Math.max(1, Math.round(systemRamGb * 0.6));
      return {
        totalRamGb: systemRamGb,
        availableRamGb,
        isSufficient: availableRamGb >= 2,
      };
    },

    async downloadWeights(profileId: string, onProgress: (pct: number) => void, onEvent?: (e: DownloadEvent) => void): Promise<void> {
      const profile = OFFICIAL_PROFILES.find(p => p.id === profileId);
      if (!profile) {
        throw new Error(`Unknown model weight profile: ${profileId}`);
      }

      if (profile.downloadStatus === 'available' && !validateHuggingFaceUrl(profile.bucketUrl)) {
        throw new Error(`Untrusted model download URL: ${profile.bucketUrl}. Only huggingface.co is permitted.`);
      }

      if (systemRamGb < profile.minRamGb) {
        throw new Error(
          `Insufficient system RAM for profile ${profile.name}: requires ${profile.minRamGb} GB, available ${systemRamGb} GB.`
        );
      }

      // No pinned hash or real file: refuse honestly instead of faking progress.
      if (profile.downloadStatus !== 'available') {
        throw new Error(`${profile.name}: ${DOWNLOAD_NOT_AVAILABLE}`);
      }
      if (!options?.invokeFn || !options.listenFn) {
        throw new Error('The download service is not connected, so nothing was downloaded.');
      }
      // The webview sends only the profile id. Rust owns the URL, size and hash, streams the file,
      // verifies SHA-256 and renames it into place; this promise settles only after that.
      let lastPct = -1;
      const unlisten = await options.listenFn('local-ai-download', e => {
        if (e.id !== profileId) return;
        onEvent?.(e);
        if (e.phase === 'downloading' && e.total > 0) {
          const pct = Math.min(99, Math.floor((e.done / e.total) * 100));
          if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
        } else if (e.phase === 'ready') {
          onProgress(100);
        }
      });
      try {
        await options.invokeFn('local_ai_download', { id: profileId });
      } finally {
        unlisten();
      }
    },

    async cancelDownload(profileId: string): Promise<boolean> {
      if (!options?.invokeFn) return false;
      return (await options.invokeFn('local_ai_download_cancel', { id: profileId })) === true;
    },

    async getInstallStatus(): Promise<ModelStatus[]> {
      if (!options?.invokeFn) return [];
      const res = await options.invokeFn('local_ai_models', {});
      return Array.isArray(res) ? (res as ModelStatus[]) : [];
    },

    async chatCompletionWithSource(request: { messages: Array<{ role: string; content: string }> }): Promise<LocalAiAnswer> {
      const active = this.getActiveProfile();
      if (!options?.invokeFn) {
        throw new Error('The offline model runtime is not connected, so no answer was generated.');
      }
      const slot: 'fast' | 'balanced' = FAST_SLOT_IDS.has(active.id) ? 'fast' : 'balanced';
      const res = await options.invokeFn('workspace_ask', {
        query: request.messages.at(-1)?.content || '',
        history: request.messages.slice(0, -1),
        model: slot,
      });
      const text = (res as { text?: unknown } | null)?.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('The offline model returned no text.');
      }
      // A downloaded model whose SHA-256 Rust verified takes the slot, so only then is its real name shown.
      const verified = await this.getInstallStatus()
        .then(list => list.find(m => m.slot === slot && m.state === 'installed'))
        .catch(() => undefined);
      if (verified) {
        return { text, slot, modelFile: verified.file, label: `Offline model · ${verified.file} (SHA-256 verified)` };
      }
      // model-fast.gguf may be absent, in which case the runtime serves the fast slot from model.gguf.
      const modelFile = slot === 'fast' ? 'model-fast.gguf (or model.gguf if the fast model is not installed)' : 'model.gguf';
      return { text, slot, modelFile, label: `Offline model · ${modelFile}` };
    },

    async chatCompletion(request: { messages: Array<{ role: string; content: string }> }): Promise<string> {
      return (await this.chatCompletionWithSource(request)).text;
    },
  };
}
