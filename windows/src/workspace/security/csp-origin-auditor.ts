// Cloudflare Security Audit-grade Content Security Policy (CSP) and Origin Defense Auditor.
// Verifies webview boundaries, script execution restrictions, and network isolation policies.

export interface CspFinding {
  directive: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  message: string;
}

export interface CspAuditReport {
  valid: boolean;
  score: number; // 0 to 100
  findings: CspFinding[];
  parsedDirectives: Record<string, string[]>;
}

export function parseCspString(csp: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!csp) return result;

  const parts = csp.split(';').map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const tokens = part.split(/\s+/);
    if (tokens.length > 0) {
      const dir = tokens[0].toLowerCase();
      result[dir] = tokens.slice(1);
    }
  }
  return result;
}

export function auditCspDirectives(csp: string): CspAuditReport {
  const parsed = parseCspString(csp);
  const findings: CspFinding[] = [];

  // 1. Check default-src
  if (!parsed['default-src']) {
    findings.push({
      directive: 'default-src',
      severity: 'high',
      message: 'Missing default-src directive. Unspecified fetch types may fall back to permissive defaults.',
    });
  }

  // 2. Check script-src
  const scriptSrc = parsed['script-src'] || parsed['default-src'] || [];
  if (scriptSrc.includes("'unsafe-eval'")) {
    findings.push({
      directive: 'script-src',
      severity: 'critical',
      message: "Unsafe 'unsafe-eval' in script-src allows string evaluation and JIT code compilation.",
    });
  }
  if (scriptSrc.includes("'unsafe-inline'")) {
    findings.push({
      directive: 'script-src',
      severity: 'high',
      message: "Unsafe 'unsafe-inline' in script-src enables inline script execution and stored XSS.",
    });
  }
  if (scriptSrc.some(s => s === '*' || s.startsWith('http:'))) {
    findings.push({
      directive: 'script-src',
      severity: 'critical',
      message: 'Permissive wildcard or unencrypted HTTP origin in script-src allows remote script injection.',
    });
  }

  // 3. Check connect-src (network boundary)
  const connectSrc = parsed['connect-src'] || parsed['default-src'] || [];
  if (connectSrc.includes('*')) {
    findings.push({
      directive: 'connect-src',
      severity: 'high',
      message: "Wildcard '*' in connect-src allows telemetry leakage or outbound data exfiltration.",
    });
  }

  // 4. Check object-src
  const objectSrc = parsed['object-src'] || parsed['default-src'] || [];
  if (!objectSrc.includes("'none'")) {
    findings.push({
      directive: 'object-src',
      severity: 'medium',
      message: "object-src is not set to 'none'. Flash and Java plugins should be forbidden.",
    });
  }

  // Calculate score
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'critical') score -= 35;
    else if (f.severity === 'high') score -= 20;
    else if (f.severity === 'medium') score -= 10;
  }
  score = Math.max(0, score);

  return {
    valid: findings.filter(f => f.severity === 'critical' || f.severity === 'high').length === 0,
    score,
    findings,
    parsedDirectives: parsed,
  };
}
