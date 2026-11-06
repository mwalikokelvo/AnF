/**
 * Unlimited-OCR client for AnF.
 *
 * Security (review finding M1): the webview never opens a connection to an OCR port. Rust
 * starts the OCR process on an OS-chosen ephemeral loopback port, keeps that port private and
 * forwards the two OpenAI-compatible calls we need through the `ocr_request` command. The
 * endpoint reported by `ocr_status` is for display only; it is never fetched from here, so
 * another local process squatting a well-known port can never receive documents, and the CSP
 * needs no loopback connect-src entry.
 * A user-run external server is used only after the user confirmed that exact endpoint.
 */

export interface OcrParseResult {
  markdown: string;
  headings: string[];
  tablesCount: number;
  hasFormulas: boolean;
}

export type OcrInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

export type OcrMode = 'owned' | 'external' | 'external-unconfirmed' | 'off';
export type OcrState = 'ready' | 'starting' | 'unavailable' | 'needs-confirmation' | 'off';

export interface OcrStatus {
  mode: OcrMode;
  state: OcrState;
  /** Display only. Never used as a fetch target. */
  endpoint?: string;
  message?: string;
}

export interface OcrRetryOptions {
  timeoutMs?: number;
  retryIntervalMs?: number;
  invokeFn?: OcrInvoke;
}

export interface LaunchOcrOptions extends OcrRetryOptions {}

export interface LaunchOcrResult {
  success: boolean;
  endpoint?: string;
  message: string;
}

const OFF: OcrStatus = { mode: 'off', state: 'off' };
const MODES: OcrMode[] = ['owned', 'external', 'external-unconfirmed', 'off'];
const STATES: OcrState[] = ['ready', 'starting', 'unavailable', 'needs-confirmation', 'off'];

async function resolveInvoke(invokeFn?: OcrInvoke): Promise<OcrInvoke | null> {
  if (invokeFn) return invokeFn;
  try {
    const core = await import('@tauri-apps/api/core');
    return core.invoke as OcrInvoke;
  } catch {
    return null; // Not in the Tauri runtime: OCR is simply unavailable.
  }
}

export function normalizeOcrStatus(raw: unknown): OcrStatus {
  if (!raw || typeof raw !== 'object') return OFF;
  const r = raw as Record<string, unknown>;
  const mode = MODES.includes(r.mode as OcrMode) ? (r.mode as OcrMode) : 'off';
  const state = STATES.includes(r.state as OcrState) ? (r.state as OcrState) : 'off';
  return {
    mode,
    state,
    endpoint: typeof r.endpoint === 'string' ? r.endpoint : undefined,
    message: typeof r.message === 'string' ? r.message : undefined
  };
}

export async function getOcrStatus(invokeFn?: OcrInvoke): Promise<OcrStatus> {
  const invoke = await resolveInvoke(invokeFn);
  if (!invoke) return OFF;
  try {
    return normalizeOcrStatus(await invoke('ocr_status'));
  } catch {
    return OFF;
  }
}

export async function isOcrAvailable(invokeFn?: OcrInvoke): Promise<boolean> {
  return (await getOcrStatus(invokeFn)).state === 'ready';
}

export async function waitForOcrReady(options?: OcrRetryOptions): Promise<OcrStatus> {
  const timeoutMs = options?.timeoutMs ?? 15000;
  const retryIntervalMs = options?.retryIntervalMs ?? 1000;
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const status = await getOcrStatus(options?.invokeFn);
    if (status.state === 'ready') return status;
    if (status.state === 'needs-confirmation') {
      throw new Error('A custom OCR server is configured but not confirmed.');
    }
    const remaining = timeoutMs - (Date.now() - startTime);
    if (remaining <= 0) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(retryIntervalMs, remaining)));
  }
  throw new Error(`Unlimited-OCR service failed to respond within ${timeoutMs}ms.`);
}

export async function launchOcrService(options?: LaunchOcrOptions): Promise<LaunchOcrResult> {
  const invoke = await resolveInvoke(options?.invokeFn);
  if (!invoke) {
    return { success: false, message: 'Failed to start OCR service: native OCR is only available in the desktop app.' };
  }

  try {
    const status = normalizeOcrStatus(await invoke('start_ocr_service'));
    if (status.state === 'ready') {
      return { success: true, endpoint: status.endpoint, message: 'OCR Engine Ready' };
    }
    if (status.state === 'needs-confirmation') {
      return { success: false, endpoint: status.endpoint, message: status.message || 'Confirm the custom OCR server first.' };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      const ready = await waitForOcrReady({
        timeoutMs: options?.timeoutMs ?? 3000,
        retryIntervalMs: options?.retryIntervalMs ?? 400,
        invokeFn: invoke
      });
      return { success: true, endpoint: ready.endpoint, message: 'OCR Engine Ready' };
    } catch {
      return { success: false, message: `Failed to start OCR service: ${errMsg}` };
    }
  }

  // Spawned but still initializing models.
  try {
    const ready = await waitForOcrReady({
      timeoutMs: options?.timeoutMs ?? 15000,
      retryIntervalMs: options?.retryIntervalMs ?? 800,
      invokeFn: invoke
    });
    return { success: true, endpoint: ready.endpoint, message: 'OCR Engine Ready' };
  } catch (err) {
    return { success: false, message: `OCR service timed out during startup: ${String(err)}` };
  }
}

/** The user's explicit confirmation of exactly this external endpoint (or `null` to clear it). */
export async function configureExternalOcr(
  endpoint: string | null,
  confirm: boolean,
  invokeFn?: OcrInvoke
): Promise<OcrStatus> {
  const invoke = await resolveInvoke(invokeFn);
  if (!invoke) return OFF;
  return normalizeOcrStatus(await invoke('ocr_configure_external', { endpoint, confirm }));
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
  options?: { invokeFn?: OcrInvoke }
): Promise<OcrParseResult> {
  const invoke = await resolveInvoke(options?.invokeFn);
  if (!invoke) {
    throw new Error('Unlimited-OCR is only available in the desktop app.');
  }

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

  const raw = (await invoke('ocr_request', {
    method: 'POST',
    path: 'chat/completions',
    body: JSON.stringify(payload)
  })) as { status?: number; body?: string };

  const status = typeof raw?.status === 'number' ? raw.status : 0;
  if (status < 200 || status >= 300) {
    throw new Error(`Unlimited-OCR failed (${status}): ${String(raw?.body ?? '').slice(0, 300)}`);
  }

  let data: any;
  try {
    data = JSON.parse(String(raw.body ?? ''));
  } catch {
    throw new Error('Unlimited-OCR returned an invalid response.');
  }
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
    const status = await getOcrStatus();
    const isOnline = status.state === 'ready';
    if (destroyed) return isOnline;

    container.replaceChildren();

    if (isOnline) {
      const badge = document.createElement('span');
      badge.className = 'ocr-badge ready';
      badge.title = `Unlimited-OCR vision engine on this device (${status.mode === 'external' ? 'external server you confirmed' : 'started by AnF'})${status.endpoint ? ' at ' + status.endpoint : ''}.`;
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '5px';
      badge.style.padding = '3px 10px';
      badge.style.borderRadius = '999px';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '600';
      badge.style.letterSpacing = '0.02em';
      badge.style.background = 'color-mix(in srgb, var(--reader-control-mark, var(--accent, #79e4b4)) 18%, transparent)';
      badge.style.color = 'var(--reader-control-ink, var(--ink, #edf4ef))';
      badge.style.border = '1px solid var(--reader-control-mark, var(--accent, #79e4b4))';

      const dot = document.createElement('span');
      dot.textContent = '●';
      dot.style.color = 'var(--reader-control-mark, var(--accent, #79e4b4))';
      dot.style.fontSize = '9px';

      const label = document.createElement('span');
      label.textContent = status.mode === 'external' ? `OCR Engine Ready (external ${status.endpoint ?? ''})` : 'OCR Engine Ready';

      badge.append(dot, label);
      container.append(badge);
      options?.onStatusChange?.(true);
    } else if (status.state === 'needs-confirmation' && status.endpoint) {
      const endpoint = status.endpoint;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ocr-confirm-btn';
      btn.textContent = `Allow OCR server at ${endpoint}`;
      btn.title = `Documents will be sent to the process listening at ${endpoint}. Only confirm a server you started yourself.`;
      btn.style.fontSize = '11px';
      btn.style.padding = '3px 10px';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await configureExternalOcr(endpoint, true);
          options?.notify?.(`Using the OCR server you confirmed at ${endpoint}.`);
        } catch (err) {
          options?.notify?.(String(err));
        }
        await checkStatus();
      });
      container.append(btn);
      options?.onStatusChange?.(false);
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
      btn.style.background = 'var(--reader-control-bg, var(--surface, #1e1e1e))';
      btn.style.color = 'var(--reader-control-ink, var(--ink, #e0e0e0))';
      btn.style.border = '1px solid var(--reader-control-line, var(--line, #3a3a3a))';
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
