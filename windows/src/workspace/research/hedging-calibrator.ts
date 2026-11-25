/**
 * Academic Hedging Calibrator & De-Jargonizer
 * 
 * Measures epistemic humility, hedging density, and jargon complexity in scholarly
 * writing to balance nuanced scientific claims against dogmatic over-assertion.
 * 
 * Inspired by imbad0202/academic-research-skills scholarly tone calibration.
 */

export interface ToneFinding {
  type: 'hedging' | 'over_assertive' | 'jargon_nominalization';
  excerpt: string;
  suggestion: string;
}

export interface HedgingReport {
  sentenceCount: number;
  hedgingCount: number;
  overAssertiveCount: number;
  hedgingDensity: number; // 0.0 to 1.0 (recommended: 0.20 to 0.40)
  toneClassification: 'dogmatic_overconfident' | 'balanced_scholarly' | 'excessively_tentative';
  findings: ToneFinding[];
  summary: string;
}

const HEDGING_PATTERNS = [
  /\b(?:suggests? that|may indicate|is plausible|appears to be|tentatively|could potentially|preliminary evidence points to)\b/i
];

const OVER_ASSERTIVE_PATTERNS = [
  /\b(?:proves? beyond doubt|undeniably|unquestionably|absolute fact|completely refutes|undisputed truth)\b/i
];

const JARGON_NOMINALIZATIONS = [
  /\b(?:utilization of|operationalization of|paradigm shift regarding|substantive implementation of)\b/i
];

export class AcademicHedgingCalibrator {
  public auditTone(text: string): HedgingReport {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 15);

    const findings: ToneFinding[] = [];
    let hedgingCount = 0;
    let overAssertiveCount = 0;

    for (const sent of sentences) {
      for (const p of HEDGING_PATTERNS) {
        if (p.test(sent)) {
          hedgingCount++;
          findings.push({
            type: 'hedging',
            excerpt: sent.slice(0, 80) + '...',
            suggestion: 'Appropriate epistemic humility.'
          });
          break;
        }
      }

      for (const p of OVER_ASSERTIVE_PATTERNS) {
        if (p.test(sent)) {
          overAssertiveCount++;
          findings.push({
            type: 'over_assertive',
            excerpt: sent.slice(0, 80) + '...',
            suggestion: 'Consider softening claim to "evidence suggests" or "findings support" rather than absolute proof.'
          });
          break;
        }
      }

      for (const p of JARGON_NOMINALIZATIONS) {
        const m = p.exec(sent);
        if (m) {
          findings.push({
            type: 'jargon_nominalization',
            excerpt: m[0],
            suggestion: 'Replace heavy nominalization with a direct, active verb (e.g. "using" instead of "utilization of").'
          });
        }
      }
    }

    const n = Math.max(1, sentences.length);
    const density = Math.round((hedgingCount / n) * 100) / 100;

    let classification: HedgingReport['toneClassification'] = 'balanced_scholarly';
    let summary = '';

    if (overAssertiveCount > 0 && density < 0.15) {
      classification = 'dogmatic_overconfident';
      summary = 'Prose exhibits excessive epistemic certainty. Introduce empirical qualifiers to avoid over-claiming.';
    } else if (density > 0.60) {
      classification = 'excessively_tentative';
      summary = 'High hedging density detected. Excessive uncertainty may dilute the strength of your findings.';
    } else {
      classification = 'balanced_scholarly';
      summary = 'Balanced scholarly tone with appropriate scientific nuance and epistemic humility.';
    }

    return {
      sentenceCount: n,
      hedgingCount,
      overAssertiveCount,
      hedgingDensity: density,
      toneClassification: classification,
      findings,
      summary
    };
  }
}
