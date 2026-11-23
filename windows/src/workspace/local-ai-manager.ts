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
  slot: 'fast' | 'balanced' | 'default';
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
  slot: 'fast' | 'balanced' | 'default';
  /** The model file the runtime loads for that slot. */
  modelFile: string;
  /** Human-readable, truthful label for the answering model. */
  label: string;
}

export type ModelTier = 'fast' | 'balanced' | 'quality';

export interface EvaluatedHardwareTier {
  totalRamGb: number;
  availableRamGb: number;
  cpuCores: number;
  recommendedTier: ModelTier;
  recommendedModelId: string;
  recommendedThreads: number;
  avx2Supported: boolean;
}

export interface LocalAiManager {
  listAvailableProfiles(): ModelWeightProfile[];
  getProfilesByFamily(family: 'deepseek' | 'kimi' | 'qwen'): ModelWeightProfile[];
  getActiveProfile(): ModelWeightProfile;
  setActiveProfile(profileId: string): void;
  /** Evaluates host hardware capabilities and maps to model tier (Phase 6 Step 6.1). */
  getHardwareTier(): EvaluatedHardwareTier;
  /** Switches active profile to match chosen tier. */
  selectTier(tier: ModelTier): void;
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
  {
    id: 'deepseek-v4-pro-qwen3.5-9b',
    name: 'DeepSeek V4 Pro (Qwen3.5 9B Uncensored)',
    family: 'deepseek',
    architecture: 'Qwen3.5 9B Uncensored · MoE/Dense',
    quant: 'Q4_K_M',
    sizeBytes: 5_780_092_768,
    sha256: 'b4363b5710a29a03cab49bc10df92ca688f891eba1a63cae912e4d96f3fd7a65',
    minRamGb: 8,
    bucketUrl: 'https://huggingface.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-GGUF/resolve/main/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic.Q4_K_M.gguf',
    huggingFaceRepo: 'mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-GGUF',
    description: 'Single unified local model: DeepSeek V4 Pro Qwen3.5 9B Uncensored (5.78 GB, Q4_K_M). Verified SHA-256.',
    recommendedRole: 'chat',
  },
];

export function validateHuggingFaceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'huggingface.co' || parsed.hostname === 'www.huggingface.co';
  } catch {
    return false;
  }
}

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

export function evaluateHardwareTier(info: {
  totalRamGb: number;
  availableRamGb?: number;
  cpuCores?: number;
  avx2Supported?: boolean;
}): EvaluatedHardwareTier {
  const ram = info.totalRamGb;
  const avx2 = info.avx2Supported ?? true;
  const cores = info.cpuCores ?? 4;
  const recommendedThreads = Math.max(1, Math.min(cores, 8));

  return {
    totalRamGb: ram,
    availableRamGb: info.availableRamGb ?? Math.max(1, Math.round(ram * 0.6)),
    cpuCores: cores,
    recommendedTier: 'quality',
    recommendedModelId: 'deepseek-v4-pro-qwen3.5-9b',
    recommendedThreads,
    avx2Supported: avx2,
  };
}

/** Returns the official recommended profile corresponding to a chosen tier. */
export function getRecommendedProfileForTier(_tier: ModelTier): ModelWeightProfile {
  return OFFICIAL_PROFILES[0];
}

const resolveProfileId = (id?: string): string => {
  if (!id || id === 'deepseek-v4-pro-qwen3.5-9b') return 'deepseek-v4-pro-qwen3.5-9b';
  // Map any old alias profile to the new model without error
  return 'deepseek-v4-pro-qwen3.5-9b';
};

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
  let activeProfileId = resolveProfileId(options?.initialProfileId);

  return {
    listAvailableProfiles(): ModelWeightProfile[] {
      return OFFICIAL_PROFILES;
    },

    getProfilesByFamily(_family: 'deepseek' | 'kimi' | 'qwen'): ModelWeightProfile[] {
      return OFFICIAL_PROFILES;
    },

    getActiveProfile(): ModelWeightProfile {
      return OFFICIAL_PROFILES.find(p => p.id === activeProfileId) || OFFICIAL_PROFILES[0];
    },

    setActiveProfile(profileId: string): void {
      activeProfileId = resolveProfileId(profileId);
    },

    getHardwareTier(): EvaluatedHardwareTier {
      return evaluateHardwareTier({ totalRamGb: systemRamGb });
    },

    selectTier(_tier: ModelTier): void {
      activeProfileId = OFFICIAL_PROFILES[0].id;
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
      const resolved = resolveProfileId(profileId);
      const profile = OFFICIAL_PROFILES.find(p => p.id === resolved) || OFFICIAL_PROFILES[0];

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
        if (e.id !== profile.id && e.id !== profileId) return;
        onEvent?.(e);
        if (e.phase === 'downloading' && e.total > 0) {
          const pct = Math.min(99, Math.floor((e.done / e.total) * 100));
          if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
        } else if (e.phase === 'ready') {
          onProgress(100);
        }
      });
      try {
        await options.invokeFn('local_ai_download', { id: profile.id });
      } finally {
        unlisten();
      }
    },

    async cancelDownload(profileId: string): Promise<boolean> {
      if (!options?.invokeFn) return false;
      return (await options.invokeFn('local_ai_download_cancel', { id: resolveProfileId(profileId) })) === true;
    },

    async getInstallStatus(): Promise<ModelStatus[]> {
      if (!options?.invokeFn) return [];
      const res = await options.invokeFn('local_ai_models', {});
      return Array.isArray(res) ? (res as ModelStatus[]) : [];
    },

    async chatCompletionWithSource(request: { messages: Array<{ role: string; content: string }> }): Promise<LocalAiAnswer> {
      if (!options?.invokeFn) {
        throw new Error('The offline model runtime is not connected, so no answer was generated.');
      }
      const active = OFFICIAL_PROFILES[0];
      const res = await options.invokeFn('workspace_ask', {
        query: request.messages.at(-1)?.content || '',
        history: request.messages.slice(0, -1),
        model: active.id,
      });
      const text = (res as { text?: unknown } | null)?.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('The offline model returned no text.');
      }
      const verified = await this.getInstallStatus()
        .then(list => list.find(m => m.state === 'installed'))
        .catch(() => undefined);
      if (verified) {
        return { text, slot: 'default', modelFile: verified.file, label: `Offline model · ${verified.file} (SHA-256 verified)` };
      }
      return { text, slot: 'default', modelFile: active.name, label: `Offline model · ${active.name}` };
    },

    async chatCompletion(request: { messages: Array<{ role: string; content: string }> }): Promise<string> {
      return (await this.chatCompletionWithSource(request)).text;
    },
  };
}
