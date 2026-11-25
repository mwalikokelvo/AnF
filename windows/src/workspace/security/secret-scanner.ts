// Gitleaks-grade secret scanner and Shannon entropy detector for AnF & ThingsBook
// Detects API tokens, private keys, and high-entropy credentials to prevent leakage.

export interface SecretFinding {
  type: string;
  match: string;
  index: number;
  length: number;
  entropy?: number;
  severity: 'critical' | 'high' | 'medium';
}

const SECRET_PATTERNS: Array<{
  type: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium';
}> = [
  {
    type: 'Anthropic API Key',
    regex: /sk-ant-api\d{2}-[a-zA-Z0-9_\-]{80,110}/g,
    severity: 'critical',
  },
  {
    type: 'OpenAI API Key',
    regex: /sk-[a-zA-Z0-9]{48,}/g,
    severity: 'critical',
  },
  {
    type: 'GitHub Token',
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{30,40}/g,
    severity: 'critical',
  },
  {
    type: 'Google AI API Key',
    regex: /AIzaSy[A-Za-z0-9_\-]{33}/g,
    severity: 'critical',
  },
  {
    type: 'AWS Access Key ID',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    severity: 'critical',
  },
  {
    type: 'Private RSA/EC/OPENSSH Key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    severity: 'critical',
  },
  {
    type: 'JWT Bearer Token',
    regex: /ey[A-Za-z0-9-_=]+\.ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*/g,
    severity: 'high',
  },
];

/**
 * Calculates Shannon entropy of a string (in bits per symbol).
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const frequencies = new Map<string, number>();
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Scans text content for secret patterns and high-entropy secret candidates.
 */
export function scanTextForSecrets(text: string, entropyThreshold = 4.6): SecretFinding[] {
  if (!text) return [];
  const findings: SecretFinding[] = [];
  const coveredRanges: Array<{ start: number; end: number }> = [];

  // 1. Regex pattern scanning
  for (const { type, regex, severity } of SECRET_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      coveredRanges.push({ start, end });
      findings.push({
        type,
        match: match[0],
        index: start,
        length: match[0].length,
        severity,
      });
    }
  }

  // 2. High-entropy candidate scanning for unformatted raw tokens
  const tokenCandidates = text.matchAll(/[A-Za-z0-9+/=_\-]{28,}/g);
  for (const candidate of tokenCandidates) {
    const val = candidate[0];
    const start = candidate.index ?? 0;
    const end = start + val.length;

    // Skip if overlaps an already detected secret pattern
    const overlaps = coveredRanges.some(r => !(end <= r.start || start >= r.end));
    if (!overlaps) {
      const entropy = calculateShannonEntropy(val);
      if (entropy >= entropyThreshold) {
        coveredRanges.push({ start, end });
        findings.push({
          type: 'High-Entropy Secret Candidate',
          match: val,
          index: start,
          length: val.length,
          entropy: Math.round(entropy * 100) / 100,
          severity: 'medium',
        });
      }
    }
  }

  return findings.sort((a, b) => a.index - b.index);
}

/**
 * Redacts secrets from the given text safely, replacing them with a redacted placeholder.
 */
export function redactSecrets(text: string): string {
  const findings = scanTextForSecrets(text);
  if (findings.length === 0) return text;

  let offset = 0;
  let redacted = text;

  for (const finding of findings) {
    const start = finding.index + offset;
    const end = start + finding.length;
    const placeholder = `[REDACTED_${finding.type.toUpperCase().replace(/[^A-Z0-9]/g, '_')}]`;
    redacted = redacted.slice(0, start) + placeholder + redacted.slice(end);
    offset += placeholder.length - finding.length;
  }

  return redacted;
}
