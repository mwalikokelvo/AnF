/**
 * Argument Fallacy & Cognitive Bias Auditor
 * 
 * Analyzes debate transcripts, essays, and notes to detect informal logical
 * fallacies, rhetorical biases, and argumentative weaknesses.
 * 
 * Inspired by imbad0202/academic-research-skills peer review and logical auditing.
 */

export type FallacyType =
  | 'ad_hominem'
  | 'strawman'
  | 'false_dilemma'
  | 'appeal_to_authority'
  | 'slippery_slope'
  | 'correlation_causation'
  | 'confirmation_bias';

export interface FallacyFinding {
  type: FallacyType;
  title: string;
  excerpt: string;
  explanation: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AuditReport {
  rigorScore: number; // 0 to 100
  totalFallaciesDetected: number;
  findings: FallacyFinding[];
  summary: string;
}

const FALLACY_RULES: Array<{
  type: FallacyType;
  title: string;
  pattern: RegExp;
  explanation: string;
  severity: 'low' | 'medium' | 'high';
}> = [
  {
    type: 'ad_hominem',
    title: 'Ad Hominem (Personal Attack)',
    pattern: /\b(?:they are idiots|he is incompetent|she is ignorant|corrupt motives|stupid to believe|foolish people)\b/i,
    explanation: 'Attacks the character, motive, or identity of the speaker rather than addressing the substantive claim.',
    severity: 'high'
  },
  {
    type: 'false_dilemma',
    title: 'False Dilemma / False Dichotomy',
    pattern: /\b(?:(?:either we|we must either).+ or (?:face total |total )?(?:ruin|collapse|destruction)|you are either with us or against us|there is no alternative but to)\b/i,
    explanation: 'Artificially restricts options to two extreme opposites while ignoring nuanced intermediate alternatives.',
    severity: 'high'
  },
  {
    type: 'slippery_slope',
    title: 'Slippery Slope',
    pattern: /\b(?:if we allow .+ then (?:inevitably|soon) .+(?:will lead to|results in catastrophe))\b/i,
    explanation: 'Asserts that a minor initial action will inevitably trigger a chain of disastrous consequences without causal evidence.',
    severity: 'medium'
  },
  {
    type: 'correlation_causation',
    title: 'Correlation Conflated with Causation (Post Hoc)',
    pattern: /\b(?:since .+ increased after .+, it clearly caused|proves that .+ is the direct cause of)\b/i,
    explanation: 'Assumes that temporal succession or statistical correlation guarantees a direct causal relationship.',
    severity: 'medium'
  },
  {
    type: 'strawman',
    title: 'Strawman Caricature',
    pattern: /\b(?:wants to destroy all|advocates that nobody should ever|claims that nothing matters)\b/i,
    explanation: 'Misrepresents an opposing view in an exaggerated or simplified form to make it easier to attack.',
    severity: 'high'
  },
  {
    type: 'appeal_to_authority',
    title: 'Unqualified Appeal to Popularity / Authority',
    pattern: /\b(?:everyone knows that|all real experts agree without question|nobody can deny that)\b/i,
    explanation: 'Substitutes broad claims of consensus or unquestionable authority for empirical evidence or logical derivation.',
    severity: 'low'
  }
];

export class FallacyAuditor {
  /**
   * Scans text for rhetorical fallacies and scores logical rigor
   */
  public auditText(text: string): AuditReport {
    const findings: FallacyFinding[] = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      for (const rule of FALLACY_RULES) {
        const match = rule.pattern.exec(line);
        if (match) {
          findings.push({
            type: rule.type,
            title: rule.title,
            excerpt: line.length > 120 ? line.slice(0, 117) + '...' : line,
            explanation: rule.explanation,
            severity: rule.severity
          });
        }
      }
    }

    // Compute Rigor Score: starts at 100, penalized by severity of findings
    let penalty = 0;
    for (const f of findings) {
      if (f.severity === 'high') penalty += 20;
      else if (f.severity === 'medium') penalty += 12;
      else penalty += 6;
    }

    const rigorScore = Math.max(0, 100 - penalty);
    let summary = '';
    if (rigorScore >= 85) {
      summary = 'High argumentative rigor. Premises are well-substantiated with negligible rhetorical fallacies.';
    } else if (rigorScore >= 60) {
      summary = 'Moderate logical rigor. Contains noticeable cognitive biases or unsupported dichotomies.';
    } else {
      summary = 'Low logical rigor. Argument relies heavily on ad hominem attacks, false dilemmas, or circular reasoning.';
    }

    return {
      rigorScore,
      totalFallaciesDetected: findings.length,
      findings,
      summary
    };
  }
}
