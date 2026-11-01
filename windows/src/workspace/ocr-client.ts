/**
 * Unlimited-OCR Client for AnF
 * Connects to local Unlimited-OCR vision endpoint (vLLM / SGLang / OpenAI vision compatible)
 * on http://127.0.0.1:8000/v1 (primary) or http://127.0.0.1:3900/v1 (fallback)
 * for high-fidelity multi-page document parsing, tables & formulas.
 * Zero-cloud telemetry and on-device privacy.
 */

export interface OcrParseResult {
  markdown: string;
  headings: string[];
  tablesCount: number;
  hasFormulas: boolean;
}

export const DEFAULT_OCR_ENDPOINT = 'http://127.0.0.1:8000/v1';
export const FALLBACK_OCR_ENDPOINT = 'http://127.0.0.1:3900/v1';
export const OCR_ENDPOINTS = [DEFAULT_OCR_ENDPOINT, FALLBACK_OCR_ENDPOINT];

export interface OcrRetryOptions {
  timeoutMs?: number;
  retryIntervalMs?: number;
  endpoints?: string[];
  checkFn?: (endpoint: string, timeoutMs?: number) => Promise<boolean>;
}

export interface LaunchOcrOptions extends OcrRetryOptions {
  invokeFn?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

export interface LaunchOcrResult {
  success: boolean;
  endpoint?: string;
  message: string;
}

export async function checkEndpointHealth(endpoint: string, timeoutMs: number = 2000): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function detectActiveOcrEndpoint(
  endpoints: string[] = OCR_ENDPOINTS,
  timeoutMs: number = 2000
): Promise<string | null> {
  for (const ep of endpoints) {
    if (await checkEndpointHealth(ep, timeoutMs)) {
      return ep;
    }
  }
  return null;
}

export async function isOcrAvailable(endpoint?: string): Promise<boolean> {
  if (endpoint) {
    return checkEndpointHealth(endpoint);
  }
  const active = await detectActiveOcrEndpoint();
  return active !== null;
}

export async function waitForOcrReady(options?: OcrRetryOptions): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 15000;
  const retryIntervalMs = options?.retryIntervalMs ?? 1000;
  const endpoints = options?.endpoints ?? OCR_ENDPOINTS;
  const check = options?.checkFn ?? checkEndpointHealth;

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    for (const ep of endpoints) {
      try {
        if (await check(ep, Math.min(2000, retryIntervalMs))) {
          return ep;
        }
      } catch {
        // Keep polling
      }
    }
    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(retryIntervalMs, remaining)));
  }

  throw new Error(`Unlimited-OCR service failed to respond within ${timeoutMs}ms.`);
}

export async function launchOcrService(options?: LaunchOcrOptions): Promise<LaunchOcrResult> {
  const endpoints = options?.endpoints ?? OCR_ENDPOINTS;
  const check = options?.checkFn ?? checkEndpointHealth;

  // 1. Return immediately if already available on primary or fallback
  for (const ep of endpoints) {
    if (await check(ep, 1500)) {
      return {
        success: true,
        endpoint: ep,
        message: 'OCR Engine Ready'
      };
    }
  }

  // 2. Invoke native spawn command if available
  let invoke = options?.invokeFn;
  if (!invoke) {
    try {
      const core = await import('@tauri-apps/api/core');
      invoke = core.invoke;
    } catch {
      // Not in Tauri runtime
    }
  }

  if (invoke) {
    try {
      await invoke('start_ocr_service');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Even if spawn returned an error, check if service actually came up
      try {
        const readyEp = await waitForOcrReady({
          timeoutMs: options?.timeoutMs ?? 3000,
          retryIntervalMs: options?.retryIntervalMs ?? 400,
          endpoints,
          checkFn: check
        });
        return {
          success: true,
          endpoint: readyEp,
          message: 'OCR Engine Ready'
        };
      } catch {
        return {
          success: false,
          message: `Failed to start OCR service: ${errMsg}`
        };
      }
    }
  }

  // 3. Wait for background process or daemon to initialize
  try {
    const readyEp = await waitForOcrReady({
      timeoutMs: options?.timeoutMs ?? 15000,
      retryIntervalMs: options?.retryIntervalMs ?? 800,
      endpoints,
      checkFn: check
    });
    return {
      success: true,
      endpoint: readyEp,
      message: 'OCR Engine Ready'
    };
  } catch (err) {
    return {
      success: false,
      message: `OCR service timed out during startup: ${String(err)}`
    };
  }
}

export function extractHeadings(markdown: string): string[] {
  const matches = markdown.match(/^(?:#{1,6})\s+(.+)$/gm) || [];
  return matches.map(h => h.replace(/^#+\s+/, '').trim());
}

export function extractDocumentMetadata(markdown: string): OcrParseResult {
  const headings = extractHeadings(markdown);
  const tables = (markdown.match(/\|[\s\S]+?\|[\r\n]+\|[-:| ]+\|/g) || []).length;
  const hasFormulas = /\$[^$]+\$|\$\$[\s\S]+?\$\$/.test(markdown);
  return {
    markdown,
    headings,
    tablesCount: tables,
    hasFormulas
  };
}

export async function parseImageBlobWithOcr(
  blob: Blob,
  endpoint?: string
): Promise<OcrParseResult> {
  const targetEndpoint = endpoint || (await detectActiveOcrEndpoint()) || DEFAULT_OCR_ENDPOINT;

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const mimeType = blob.type || 'image/png';
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const payload = {
    model: 'baidu/Unlimited-OCR',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract the full contents of this document into structured Markdown. Preserve reading order, headings (#, ##, ###), tables, and mathematical formulas in LaTeX ($...$ and $$...$$).'
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl }
          }
        ]
      }
    ],
    temperature: 0.1,
    max_tokens: 4096
  };

  const response = await fetch(`${targetEndpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Unlimited-OCR failed (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || '';
  if (!text) {
    throw new Error('Unlimited-OCR returned an empty response.');
  }

  return extractDocumentMetadata(text);
}

export interface OcrStatusIndicator {
  element: HTMLElement;
  refresh: () => Promise<boolean>;
  destroy: () => void;
}

export interface OcrStatusIndicatorOptions {
  notify?: (msg: string) => void;
  onStatusChange?: (isOnline: boolean) => void;
  pollIntervalMs?: number;
}

export function createOcrStatusIndicator(options?: OcrStatusIndicatorOptions): OcrStatusIndicator | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const container = document.createElement('div');
  container.className = 'ocr-status-container';
  container.style.display = 'inline-flex';
  container.style.alignItems = 'center';
  container.style.margin = '0 6px';

  let destroyed = false;
  let timer: any = null;

  async function checkStatus(): Promise<boolean> {
    if (destroyed) return false;
    const isOnline = await isOcrAvailable();
    if (destroyed) return isOnline;

    container.replaceChildren();

    if (isOnline) {
      const badge = document.createElement('span');
      badge.className = 'ocr-badge ready';
      badge.title = 'Unlimited-OCR vision engine running locally on-device.';
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '5px';
      badge.style.padding = '3px 10px';
      badge.style.borderRadius = '999px';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '600';
      badge.style.letterSpacing = '0.02em';
      badge.style.background = 'rgba(121, 228, 180, 0.14)';
      badge.style.color = 'var(--accent, #79e4b4)';
      badge.style.border = '1px solid rgba(121, 228, 180, 0.35)';

      const dot = document.createElement('span');
      dot.textContent = '●';
      dot.style.color = 'var(--accent, #79e4b4)';
      dot.style.fontSize = '9px';

      const label = document.createElement('span');
      label.textContent = 'OCR Engine Ready';

      badge.append(dot, label);
      container.append(badge);
      options?.onStatusChange?.(true);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ocr-start-btn';
      btn.textContent = 'Start OCR Server';
      btn.title = 'Launch local Unlimited-OCR inference background service';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.padding = '3px 10px';
      btn.style.borderRadius = '6px';
      btn.style.fontSize = '11px';
      btn.style.fontWeight = '500';
      btn.style.background = 'var(--surface, #1e1e1e)';
      btn.style.color = 'var(--ink, #e0e0e0)';
      btn.style.border = '1px solid var(--line, #3a3a3a)';
      btn.style.cursor = 'pointer';

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Starting OCR…';
        options?.notify?.('Starting local Unlimited-OCR service…');

        const res = await launchOcrService();
        if (destroyed) return;

        if (res.success) {
          options?.notify?.('Unlimited-OCR service started successfully.');
          await checkStatus();
        } else {
          btn.disabled = false;
          btn.textContent = 'Start OCR Server';
          options?.notify?.(res.message);
        }
      });

      container.append(btn);
      options?.onStatusChange?.(false);
    }

    return isOnline;
  }

  // Initial check
  void checkStatus();

  // Periodic polling if requested
  if (options?.pollIntervalMs && options.pollIntervalMs > 0) {
    timer = setInterval(() => {
      void checkStatus();
    }, options.pollIntervalMs);
  }

  return {
    element: container,
    refresh: checkStatus,
    destroy: () => {
      destroyed = true;
      if (timer) clearInterval(timer);
    }
  };
}
