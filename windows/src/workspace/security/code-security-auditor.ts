// Semgrep-style static security rule auditor for Tauri, Electron, and Webview desktop apps.
// Flags injection risks, path traversal, dangerous eval, and privilege escalation vulnerabilities.

export interface CodeSecurityIssue {
  ruleId: string;
  category: 'xss' | 'command_injection' | 'path_traversal' | 'unsafe_eval' | 'insecure_storage';
  severity: 'critical' | 'high' | 'medium' | 'low';
  line: number;
  message: string;
  snippet: string;
}

export interface SecurityAuditResult {
  filename: string;
  issues: CodeSecurityIssue[];
  passed: boolean;
  score: number; // 0 to 100
}

interface SecurityRule {
  ruleId: string;
  category: CodeSecurityIssue['category'];
  severity: CodeSecurityIssue['severity'];
  pattern: RegExp;
  message: string;
}

const SECURITY_RULES: SecurityRule[] = [
  {
    ruleId: 'TAURI_UNSAFE_INNER_HTML',
    category: 'xss',
    severity: 'high',
    pattern: /\.innerHTML\s*=\s*(?!['"`][^$`]*['"`])/i,
    message: 'Direct dynamic assignment to innerHTML introduces Cross-Site Scripting (XSS). Use textContent or sanitized DOM nodes.',
  },
  {
    ruleId: 'DANGEROUS_EVAL',
    category: 'unsafe_eval',
    severity: 'critical',
    pattern: /\b(?:eval|new\s+Function)\s*\(/i,
    message: 'Dynamic code execution via eval() or new Function() allows arbitrary code execution.',
  },
  {
    ruleId: 'UNSAFE_SHELL_EXECUTION',
    category: 'command_injection',
    severity: 'critical',
    pattern: /(?:child_process|exec|execSync|spawn|spawnSync)\s*\([^)]*(?:\+|\$\{)/i,
    message: 'Shell command execution with string interpolation or concatenation risk command injection. Use parameterized arrays.',
  },
  {
    ruleId: 'PATH_TRAVERSAL_SUSPECT',
    category: 'path_traversal',
    severity: 'high',
    pattern: /(?:readFile|writeFile|unlink|access|resolve|join)\s*\([^)]*\.\.\//i,
    message: 'Literal directory traversal pattern (../) detected in filesystem operation. Verify path sandboxing.',
  },
  {
    ruleId: 'PLAINTEXT_SECRET_STORAGE',
    category: 'insecure_storage',
    severity: 'medium',
    pattern: /localStorage\.setItem\s*\(\s*['"`](?:token|password|secret|auth|apiKey)['"`]/i,
    message: 'Sensitive credentials stored in unencrypted localStorage. Use SQLCipher or secure OS credential storage.',
  },
];

/**
 * Audits code contents against security rules.
 */
export function auditSourceCode(filename: string, code: string): SecurityAuditResult {
  const lines = code.split('\n');
  const issues: CodeSecurityIssue[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    // Skip single-line comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    for (const rule of SECURITY_RULES) {
      if (rule.pattern.test(line)) {
        issues.push({
          ruleId: rule.ruleId,
          category: rule.category,
          severity: rule.severity,
          line: lineIdx + 1,
          message: rule.message,
          snippet: trimmed,
        });
      }
    }
  }

  // Deduct score based on issues
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 30;
    else if (issue.severity === 'high') score -= 15;
    else if (issue.severity === 'medium') score -= 5;
    else score -= 2;
  }
  score = Math.max(0, score);

  return {
    filename,
    issues,
    passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
    score,
  };
}
