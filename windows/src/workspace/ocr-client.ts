/**
 * Unlimited-OCR Client for AnF
 * Connects to local Unlimited-OCR vision endpoint (vLLM / SGLang / OpenAI vision compatible)
 * on http://localhost:8000/v1 for high-fidelity multi-page document parsing, tables & formulas.
 */

export interface OcrParseResult {
  markdown: string;
  headings: string[];
  tablesCount: number;
  hasFormulas: boolean;
}

export const DEFAULT_OCR_ENDPOINT = 'http://localhost:8000/v1';

export async function isOcrAvailable(endpoint: string = DEFAULT_OCR_ENDPOINT): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/models`, { method: 'GET', signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
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
  endpoint: string = DEFAULT_OCR_ENDPOINT
): Promise<OcrParseResult> {
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

  const response = await fetch(`${endpoint}/chat/completions`, {
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
