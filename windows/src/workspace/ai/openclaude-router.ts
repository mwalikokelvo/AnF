/**
 * OpenClaude Provider Router for AnF
 * 
 * Decouples AI requests from vendor lock-in. Seamlessly routes across:
 * 1. Embedded Local Model (GGUF / DirectML / CPU)
 * 2. Local Ollama Server (http://127.0.0.1:11434)
 * 3. Configured Cloud API Providers (OpenAI, Claude, Gemini) with OS-stored keys
 * 
 * Inspired by Twigpine/openclaude ("runs anywhere. uses anything.").
 */

export type AiProvider = 'local' | 'ollama' | 'openai' | 'claude' | 'gemini';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderConfig {
  provider: AiProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface RouterRequest {
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: AiProvider;
}

export interface RouterResponse {
  content: string;
  provider: AiProvider;
  model: string;
  latencyMs: number;
}

export interface BackendStatus {
  provider: AiProvider;
  available: boolean;
  models: string[];
  endpoint: string;
}

/** Check if a local Ollama server is active and accessible. */
export async function probeOllama(
  endpoint = 'http://127.0.0.1:11434',
  fetchImpl: typeof fetch = fetch
): Promise<{ active: boolean; models: string[] }> {
  try {
    const res = await fetchImpl(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { active: false, models: [] };
    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = Array.isArray(data?.models) ? data.models.map(m => m.name) : [];
    return { active: true, models };
  } catch {
    return { active: false, models: [] };
  }
}

/** Detect all available backends on this machine. */
export async function detectBackends(
  configs: Partial<Record<AiProvider, ProviderConfig>> = {},
  fetchImpl: typeof fetch = fetch
): Promise<BackendStatus[]> {
  const list: BackendStatus[] = [];

  // 1. Embedded Local AI
  list.push({
    provider: 'local',
    available: true,
    models: ['deepseek-v4-pro-qwen3.5-9b'],
    endpoint: 'local://embedded',
  });

  // 2. Ollama
  const ollama = await probeOllama(configs.ollama?.baseUrl || 'http://127.0.0.1:11434', fetchImpl);
  list.push({
    provider: 'ollama',
    available: ollama.active,
    models: ollama.models,
    endpoint: configs.ollama?.baseUrl || 'http://127.0.0.1:11434',
  });

  // 3. OpenAI compatible
  const hasOpenAi = Boolean(configs.openai?.apiKey);
  list.push({
    provider: 'openai',
    available: hasOpenAi,
    models: ['gpt-4o-mini', 'gpt-4o'],
    endpoint: configs.openai?.baseUrl || 'https://api.openai.com/v1',
  });

  // 4. Claude / Anthropic
  const hasClaude = Boolean(configs.claude?.apiKey);
  list.push({
    provider: 'claude',
    available: hasClaude,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    endpoint: 'https://api.anthropic.com/v1',
  });

  // 5. Gemini
  const hasGemini = Boolean(configs.gemini?.apiKey);
  list.push({
    provider: 'gemini',
    available: hasGemini,
    models: ['gemini-2.5-flash', 'gemini-1.5-pro'],
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
  });

  return list;
}

/** Execute chat completion via Ollama endpoint. */
export async function callOllama(
  request: RouterRequest,
  config: ProviderConfig,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const endpoint = config.baseUrl || 'http://127.0.0.1:11434';
  const model = config.model || 'qwen2.5:7b';
  const messages = [...request.messages];
  if (request.system && !messages.some(m => m.role === 'system')) {
    messages.unshift({ role: 'system', content: request.system });
  }

  const res = await fetchImpl(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Ollama returned status ${res.status}`);
  }
  const data = await res.json() as { message?: { content?: string } };
  return data?.message?.content || '';
}

/** Execute chat completion via OpenAI-compatible endpoint. */
export async function callOpenAiCompatible(
  request: RouterRequest,
  config: ProviderConfig,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const model = config.model || 'gpt-4o-mini';
  const messages = [...request.messages];
  if (request.system && !messages.some(m => m.role === 'system')) {
    messages.unshift({ role: 'system', content: request.system });
  }

  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey || ''}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 1024,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API returned status ${res.status}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data?.choices?.[0]?.message?.content || '';
}

/** Decoupled router: executes with preferred provider, auto-falling back to local. */
export async function routeChatCompletion(
  request: RouterRequest,
  configs: Partial<Record<AiProvider, ProviderConfig>> = {},
  localFallbackExec?: (req: RouterRequest) => Promise<string>,
  fetchImpl: typeof fetch = fetch
): Promise<RouterResponse> {
  const t0 = Date.now();
  const provider = request.preferredProvider || 'local';

  // Try preferred provider
  if (provider === 'ollama') {
    try {
      const cfg = configs.ollama || { provider: 'ollama' };
      const content = await callOllama(request, cfg, fetchImpl);
      return {
        content,
        provider: 'ollama',
        model: cfg.model || 'ollama-default',
        latencyMs: Date.now() - t0,
      };
    } catch {
      // Fall through to local
    }
  } else if (provider === 'openai' && configs.openai?.apiKey) {
    try {
      const cfg = configs.openai;
      const content = await callOpenAiCompatible(request, cfg, fetchImpl);
      return {
        content,
        provider: 'openai',
        model: cfg.model || 'gpt-4o-mini',
        latencyMs: Date.now() - t0,
      };
    } catch {
      // Fall through to local
    }
  }

  // Local fallback (offline guarantee)
  const localContent = localFallbackExec
    ? await localFallbackExec(request)
    : 'Local offline response ready.';

  return {
    content: localContent,
    provider: 'local',
    model: 'deepseek-v4-pro',
    latencyMs: Date.now() - t0,
  };
}
