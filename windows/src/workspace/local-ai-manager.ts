/**
 * Local AI Model Manager: offline model profiles, Hugging Face / Flint bucket weights downloader,
 * memory verification, and local offline chat completions.
 *
 * Honesty rules: the entries below are a catalog of intended profiles. Their sha256/bucketUrl values are
 * placeholders, so downloads are reported as "not available yet" (never as simulated progress), and replies
 * are labelled with the model file the offline runtime actually loads, not with the profile name.
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
  /** Every catalog entry is 'not-available-yet' until real, hash-pinned weights are published. */
  downloadStatus: 'available' | 'not-available-yet';
}

export const DOWNLOAD_NOT_AVAILABLE = 'Not available yet: verified model weights for this profile have not been published.';

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
  downloadWeights(profileId: string, onProgress: (pct: number) => void): Promise<void>;
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
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    minRamGb: 8,
    bucketUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017/deepseek-v4.1-flash-q4_k_m.gguf',
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
    sha256: 'c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef',
    minRamGb: 8,
    bucketUrl: 'https://huggingface.co/unsloth/DeepSeek-V3.2-GGUF/deepseek-v3.2-q4_k_m.gguf',
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
    sha256: 'd1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcd',
    minRamGb: 4,
    bucketUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B/deepseek-r1-distill-qwen-1.5b-q4_k_m.gguf',
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
    sha256: 'f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90123456789abcd',
    minRamGb: 8,
    bucketUrl: 'https://huggingface.co/unsloth/Kimi-K3-GGUF/kimi-k3-thinking-q4_k_m.gguf',
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
    sha256: 'e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9',
    minRamGb: 4,
    bucketUrl: 'https://huggingface.co/bartowski/moonshotai_Kimi-Linear-48B-A3B-Instruct-GGUF/kimi-linear-48b-a3b-instruct-q4_k_m.gguf',
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
    quant: 'Q4_K_M',
    sizeBytes: 412_000_000,
    sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    minRamGb: 2,
    bucketUrl: 'https://huggingface.co/buckets/mwalikokelvo/flint-bucket/qwen3-0.6b-q4_k_m.gguf',
    huggingFaceRepo: 'Qwen/Qwen3-0.6B',
    description: 'Ultra-lightweight fallback model requiring only 2 GB RAM.',
    recommendedRole: 'fast',
  },
  {
    id: 'qwen3-1.7b-balanced',
    name: 'Balanced · Qwen3 1.7B',
    family: 'qwen',
    architecture: 'Dense Transformer',
    quant: 'Q4_K_M',
    sizeBytes: 1_180_000_000,
    sha256: 'b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1',
    minRamGb: 4,
    bucketUrl: 'https://huggingface.co/buckets/mwalikokelvo/flint-bucket/qwen3-1.7b-q4_k_m.gguf',
    huggingFaceRepo: 'Qwen/Qwen3-1.7B',
    description: 'Balanced fallback model requiring 4 GB RAM.',
    recommendedRole: 'chat',
  },
];

export const OFFICIAL_PROFILES: ModelWeightProfile[] = PROFILE_CATALOG.map(p => ({ ...p, downloadStatus: 'not-available-yet' as const }));

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

    async downloadWeights(profileId: string, _onProgress: (pct: number) => void): Promise<void> {
      const profile = OFFICIAL_PROFILES.find(p => p.id === profileId);
      if (!profile) {
        throw new Error(`Unknown model weight profile: ${profileId}`);
      }

      if (!validateHuggingFaceUrl(profile.bucketUrl)) {
        throw new Error(`Untrusted model download URL: ${profile.bucketUrl}. Only huggingface.co is permitted.`);
      }

      if (systemRamGb < profile.minRamGb) {
        throw new Error(
          `Insufficient system RAM for profile ${profile.name}: requires ${profile.minRamGb} GB, available ${systemRamGb} GB.`
        );
      }

      // The catalog's hashes and bucket URLs are placeholders: refuse honestly instead of faking progress.
      if (profile.downloadStatus !== 'available') {
        throw new Error(`${profile.name}: ${DOWNLOAD_NOT_AVAILABLE}`);
      }
      throw new Error('Model download is not implemented in this build.');
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
      // model-fast.gguf may be absent, in which case the runtime serves the fast slot from model.gguf.
      const modelFile = slot === 'fast' ? 'model-fast.gguf (or model.gguf if the fast model is not installed)' : 'model.gguf';
      return { text, slot, modelFile, label: `Offline model · ${modelFile}` };
    },

    async chatCompletion(request: { messages: Array<{ role: string; content: string }> }): Promise<string> {
      return (await this.chatCompletionWithSource(request)).text;
    },
  };
}
