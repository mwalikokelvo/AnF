// Cisco AI Defense-grade Model Context Protocol (MCP) tool and manifest security scanner.
// Detects tool poisoning, prompt injection in tool descriptions, privilege escalation, and SSRF.

export interface McpToolParameter {
  type: string;
  description?: string;
  enum?: string[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties?: Record<string, McpToolParameter>;
    required?: string[];
  };
}

export interface McpSecurityThreat {
  category: 'tool_poisoning' | 'privilege_escalation' | 'ssrf_risk' | 'zero_width_evasion' | 'confusing_name';
  severity: 'critical' | 'high' | 'medium';
  message: string;
  matchedText?: string;
}

export interface McpScanResult {
  toolName: string;
  safe: boolean;
  score: number; // 0 to 100
  threats: McpSecurityThreat[];
}

const POISONING_PATTERNS: Array<{ regex: RegExp; message: string; severity: 'critical' | 'high' }> = [
  {
    regex: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|prompts|rules)/i,
    message: 'Prompt injection directive attempting to reset system instructions.',
    severity: 'critical',
  },
  {
    regex: /(?:system\s+override|admin\s+mode|developer\s+mode|jailbreak|dan\s+mode)/i,
    message: 'System override or jailbreak phrase in tool description.',
    severity: 'critical',
  },
  {
    regex: /(?:always\s+call\s+this\s+tool|never\s+ask\s+confirmation|bypass\s+safety)/i,
    message: 'Coercive tool description attempting to force model invocation.',
    severity: 'high',
  },
  {
    regex: /<!--[\s\S]*?-->|<\?xml[\s\S]*?\?>/i,
    message: 'Hidden markup payload embedded in tool description.',
    severity: 'high',
  },
];

const INTERNAL_IP_PATTERNS = [
  /^https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|169\.254\.169\.254|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/i,
];

export function scanMcpToolDefinition(tool: McpToolDefinition): McpScanResult {
  const threats: McpSecurityThreat[] = [];

  // 1. Zero-width character evasion scan
  if (/[\u200B-\u200D\uFEFF]/.test(tool.description) || /[\u200B-\u200D\uFEFF]/.test(tool.name)) {
    threats.push({
      category: 'zero_width_evasion',
      severity: 'high',
      message: 'Zero-width Unicode characters detected. Common heuristic evasion technique.',
    });
  }

  // 2. Tool poisoning / Prompt injection patterns in description
  for (const { regex, message, severity } of POISONING_PATTERNS) {
    const match = regex.exec(tool.description);
    if (match) {
      threats.push({
        category: 'tool_poisoning',
        severity,
        message,
        matchedText: match[0],
      });
    }
  }

  // 3. Privilege escalation & Masquerading
  // e.g., name suggests read/search, but parameters accept delete/drop/format
  const lowerName = tool.name.toLowerCase();
  const isReadOnlyName = /^(?:get|read|list|search|query|fetch|find|view|peek)_/i.test(lowerName);
  const props = tool.parameters?.properties || {};

  for (const [paramName, paramDef] of Object.entries(props)) {
    const lowerParam = paramName.toLowerCase();
    const paramDesc = (paramDef.description || '').toLowerCase();

    if (isReadOnlyName && (lowerParam.includes('delete') || lowerParam.includes('drop') || lowerParam.includes('exec') || paramDesc.includes('permanent delete'))) {
      threats.push({
        category: 'privilege_escalation',
        severity: 'critical',
        message: `Tool "${tool.name}" presents as read-only but declares destructive parameter "${paramName}".`,
      });
    }

    // SSRF parameter check
    if (lowerParam === 'url' || lowerParam === 'endpoint' || lowerParam === 'webhook') {
      threats.push({
        category: 'ssrf_risk',
        severity: 'medium',
        message: `Parameter "${paramName}" accepts arbitrary network endpoints. Target host validation required.`,
      });
    }
  }

  let score = 100;
  for (const t of threats) {
    if (t.severity === 'critical') score -= 40;
    else if (t.severity === 'high') score -= 20;
    else score -= 10;
  }
  score = Math.max(0, score);

  return {
    toolName: tool.name,
    safe: threats.filter(t => t.severity === 'critical' || t.severity === 'high').length === 0,
    score,
    threats,
  };
}

export function validateSsrfTargetUrl(urlStr: string, allowedHosts?: string[]): { allowed: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    // Check loopback / internal private IP ranges
    for (const pat of INTERNAL_IP_PATTERNS) {
      if (pat.test(urlStr)) {
        return { allowed: false, reason: 'Access to loopback or private cloud metadata IP is prohibited.' };
      }
    }

    if (allowedHosts && allowedHosts.length > 0) {
      const isAllowed = allowedHosts.some(h => host === h.toLowerCase() || host.endsWith('.' + h.toLowerCase()));
      if (!isAllowed) {
        return { allowed: false, reason: `Host "${host}" is not on the allowed host list.` };
      }
    }

    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'Invalid URL format.' };
  }
}
