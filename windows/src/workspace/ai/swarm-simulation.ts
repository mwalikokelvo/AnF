/**
 * Multi-Perspective Swarm Intelligence & Simulation Engine
 * Inspired by MiroFish and multi-agent consensus protocols.
 * Evaluates decisions, architectural proposals, research notes, or plans
 * across diverse agent personas, calculating consensus and friction points offline.
 */

export interface SwarmAgentPerspective {
  agentName: string;
  role: string;
  stance: 'favorable' | 'cautious' | 'critical' | 'neutral';
  score: number; // 0 to 100
  assessment: string;
  keyPoints: string[];
  blindspots: string[];
}

export interface SwarmSimulationResult {
  topic: string;
  timestamp: string;
  consensusScore: number; // 0 to 100
  dominantStance: 'favorable' | 'cautious' | 'critical' | 'neutral';
  perspectives: SwarmAgentPerspective[];
  consensusPoints: string[];
  frictionPoints: string[];
  synthesis: string;
}

export interface SwarmPersonaDefinition {
  name: string;
  role: string;
  focusKeywords: string[];
  riskKeywords: string[];
  evaluate: (topic: string, context: string) => {
    stance: 'favorable' | 'cautious' | 'critical' | 'neutral';
    score: number;
    assessment: string;
    keyPoints: string[];
    blindspots: string[];
  };
}

export const DEFAULT_SWARM_PERSONAS: readonly SwarmPersonaDefinition[] = [
  {
    name: 'Security & Privacy Guardian',
    role: 'Threat modeling, offline integrity, and data leakage audit',
    focusKeywords: ['local', 'offline', 'encryption', 'private', 'safety', 'sandbox', 'zero-trust'],
    riskKeywords: ['cloud', 'telemetry', 'remote', 'api-key', 'leak', 'unencrypted', 'exfiltration', 'vulnerability'],
    evaluate: (topic: string, context: string) => {
      const combined = (topic + ' ' + context).toLowerCase();
      const hasSecurityStrengths = ['offline', 'local', 'privacy', 'integrity'].some(k => combined.includes(k)) || (combined.includes('encrypt') && !combined.includes('unencrypt'));
      const hasSecurityRisks = ['cloud', 'telemetry', 'unencrypted', 'broadcast', 'public'].some(k => combined.includes(k));

      if (hasSecurityRisks && !hasSecurityStrengths) {
        return {
          stance: 'critical',
          score: 35,
          assessment: 'Exposes potential remote attack surfaces or telemetry without sufficient local isolation.',
          keyPoints: ['Demands explicit local-only boundaries', 'Audit any external data flows or credential handling'],
          blindspots: ['Over-engineering isolation can impede collaborative convenience'],
        };
      }
      if (hasSecurityStrengths) {
        return {
          stance: 'favorable',
          score: 92,
          assessment: 'Upholds strict offline-first principles with verified client-side privacy.',
          keyPoints: ['No ungrounded remote network exposure', 'Data remains solely on user-controlled hardware'],
          blindspots: ['Ensure secure local cryptographic key derivation (e.g. PBKDF2/AES-GCM)'],
        };
      }
      return {
        stance: 'cautious',
        score: 68,
        assessment: 'Adequate privacy posture, but requires formal trust boundary verification.',
        keyPoints: ['Establish explicit data retention boundaries', 'Sanitize user inputs and exported payloads'],
        blindspots: ['Verify error logs do not capture sensitive tokens or private notes'],
      };
    },
  },
  {
    name: 'Architect & Pragmatist',
    role: 'Simplicity, maintainability, Ponytail lazy senior dev ethos',
    focusKeywords: ['native', 'minimal', 'diff', 'performance', 'standard', 'lean', 'reuse'],
    riskKeywords: ['overcomplicated', 'dependency', 'wrapper', 'heavy', 'bloat', 'redundant'],
    evaluate: (topic: string, context: string) => {
      const combined = (topic + ' ' + context).toLowerCase();
      const hasSimplicity = ['native', 'minimal', 'reuse', 'clean', 'standard', 'fast'].some(k => combined.includes(k));
      const hasBloat = ['framework', 'wrapper', 'heavy', 'rewrite', 'overcomplicated'].some(k => combined.includes(k));

      if (hasBloat && !hasSimplicity) {
        return {
          stance: 'critical',
          score: 40,
          assessment: 'Introduces unnecessary abstraction layers or excessive external package dependencies.',
          keyPoints: ['Eliminate wrapper boilerplate', 'Leverage existing platform standards and native APIs'],
          blindspots: ['Do not sacrifice readability for hyper-terse single-liners'],
        };
      }
      if (hasSimplicity) {
        return {
          stance: 'favorable',
          score: 90,
          assessment: 'Excellent architectural economy: shortest working diff with high native reuse.',
          keyPoints: ['Solves the whole problem with minimal new code', 'Zero unnecessary npm dependencies'],
          blindspots: ['Document edge cases so maintainers understand the lean design choices'],
        };
      }
      return {
        stance: 'favorable',
        score: 75,
        assessment: 'Sound architectural direction; keep components focused with single responsibilities.',
        keyPoints: ['Favor native standard library and Web APIs', 'Keep modules easily testable'],
        blindspots: ['Check for circular imports across shared domain packages'],
      };
    },
  },
  {
    name: 'User Experience Advocate',
    role: 'Cognitive load, intuitive discovery, speed, accessibility',
    focusKeywords: ['intuitive', 'fast', 'smooth', 'accessible', 'responsive', 'feedback', 'clear'],
    riskKeywords: ['confusing', 'laggy', 'hidden', 'friction', 'pop', 'steep', 'jank'],
    evaluate: (topic: string, context: string) => {
      const combined = (topic + ' ' + context).toLowerCase();
      const hasUx = ['ui', 'ux', 'accessible', 'smooth', 'clear', 'feedback', 'responsive', 'speed'].some(k => combined.includes(k));

      if (hasUx) {
        return {
          stance: 'favorable',
          score: 88,
          assessment: 'Empowers the user with clear interactive feedback, zero latency, and thoughtful ergonomics.',
          keyPoints: ['Immediate visual feedback for all user actions', 'Graceful keyboard and screen reader accessibility'],
          blindspots: ['Ensure high-contrast states remain visible across dark and light themes'],
        };
      }
      return {
        stance: 'neutral',
        score: 72,
        assessment: 'Functional and practical; ensure interaction points have obvious affordances.',
        keyPoints: ['Provide visible tooltips or status messages', 'Minimize unnecessary clicks or modal disruptions'],
        blindspots: ['Test on varied screen viewports and mobile form factors'],
      };
    },
  },
  {
    name: 'Systems Futurist',
    role: 'Long-term ecosystem resilience, open standards, and future compatibility',
    focusKeywords: ['open-source', 'interoperable', 'standard', 'future-proof', 'rfc', 'durable'],
    riskKeywords: ['proprietary', 'lock-in', 'deprecated', 'fragile', 'silo'],
    evaluate: (topic: string, context: string) => {
      const combined = (topic + ' ' + context).toLowerCase();
      const isOpenStandards = ['rfc', 'open', 'standard', 'markdown', 'json', 'ics', 'podcasting', 'wav'].some(k => combined.includes(k));

      if (isOpenStandards) {
        return {
          stance: 'favorable',
          score: 95,
          assessment: 'Strong open-standards foundation ensuring decade-long data portability and ecosystem longevity.',
          keyPoints: ['Standards compliance prevents vendor lock-in', 'Enables frictionless cross-tool interoperability'],
          blindspots: ['Keep up with emerging RFC drafts and revisions'],
        };
      }
      return {
        stance: 'cautious',
        score: 70,
        assessment: 'Solid baseline; prioritize standardized serialization (e.g. RFC 5545, Podcasting 2.0, Open Graph).',
        keyPoints: ['Adopt open file interchange formats over custom binary schemas', 'Support straightforward export to companion tools'],
        blindspots: ['Plan schema migration paths early to avoid legacy format debt'],
      };
    },
  },
];

/**
 * Execute an offline multi-agent simulation on a proposal, research topic, or draft notes.
 */
export function simulateSwarmConsensus(
  topic: string,
  contextNotes: string[] = [],
  customPersonas: readonly SwarmPersonaDefinition[] = DEFAULT_SWARM_PERSONAS
): SwarmSimulationResult {
  const cleanTopic = topic.trim() || 'General System Architecture';
  const joinedContext = contextNotes.join('\n');

  const perspectives: SwarmAgentPerspective[] = customPersonas.map(persona => {
    const evaluation = persona.evaluate(cleanTopic, joinedContext);
    return {
      agentName: persona.name,
      role: persona.role,
      stance: evaluation.stance,
      score: evaluation.score,
      assessment: evaluation.assessment,
      keyPoints: evaluation.keyPoints,
      blindspots: evaluation.blindspots,
    };
  });

  const totalScore = perspectives.reduce((acc, p) => acc + p.score, 0);
  const consensusScore = Math.round(totalScore / Math.max(1, perspectives.length));

  const stanceCounts: Record<string, number> = { favorable: 0, cautious: 0, critical: 0, neutral: 0 };
  for (const p of perspectives) {
    stanceCounts[p.stance] = (stanceCounts[p.stance] || 0) + 1;
  }

  let dominantStance: 'favorable' | 'cautious' | 'critical' | 'neutral' = 'neutral';
  let maxCount = -1;
  for (const [st, count] of Object.entries(stanceCounts) as ['favorable' | 'cautious' | 'critical' | 'neutral', number][]) {
    if (count > maxCount) {
      maxCount = count;
      dominantStance = st;
    }
  }

  // Consensus points: points that multiple agents align on or high-scoring favorable notes
  const consensusPoints: string[] = [];
  if (consensusScore >= 70) {
    consensusPoints.push('Core architecture adheres to strong offline-first, native-platform principles.');
    consensusPoints.push('Data longevity and user ownership are preserved without external cloud lock-in.');
  }
  for (const p of perspectives) {
    if (p.stance === 'favorable' && p.keyPoints[0]) {
      consensusPoints.push(`${p.agentName}: ${p.keyPoints[0]}`);
    }
  }

  // Friction points: critical or cautious warnings
  const frictionPoints: string[] = [];
  for (const p of perspectives) {
    if (p.stance === 'critical' || p.stance === 'cautious') {
      frictionPoints.push(`${p.agentName}: ${p.assessment}`);
    }
    if (p.blindspots[0]) {
      frictionPoints.push(`Watchout (${p.agentName}): ${p.blindspots[0]}`);
    }
  }

  const synthesis = `Swarm consensus for "${cleanTopic}" reached ${consensusScore}% agreement (${dominantStance.toUpperCase()}). ` +
    `The swarm strongly endorses the open, native approach while advising rigorous verification on highlighted friction points.`;

  return {
    topic: cleanTopic,
    timestamp: new Date().toISOString(),
    consensusScore,
    dominantStance,
    perspectives,
    consensusPoints: Array.from(new Set(consensusPoints)),
    frictionPoints: Array.from(new Set(frictionPoints)),
    synthesis,
  };
}

/**
 * Format a SwarmSimulationResult into an Obsidian / AnF Markdown note with frontmatter.
 */
export function simulationToMarkdownNote(result: SwarmSimulationResult): string {
  const frontmatter = `---
title: "Swarm Simulation · ${result.topic}"
type: swarm-simulation
consensus_score: ${result.consensusScore}
dominant_stance: ${result.dominantStance}
date: ${result.timestamp.slice(0, 10)}
tags:
  - swarm
  - simulation
  - mirofish
  - decision-record
---

# Swarm Simulation: ${result.topic}

> **Consensus Index:** ${result.consensusScore}% (${result.dominantStance.toUpperCase()})  
> **Evaluated:** ${result.timestamp}

## Synthesis
${result.synthesis}

## Agent Perspectives
${result.perspectives.map(p => `### ${p.agentName} (${p.score}%)
- **Role:** ${p.role}
- **Stance:** \`${p.stance}\`
- **Assessment:** ${p.assessment}
- **Key Points:**
${p.keyPoints.map(kp => `  - ${kp}`).join('\n')}
- **Blindspots & Watchouts:**
${p.blindspots.map(bs => `  - ${bs}`).join('\n')}
`).join('\n')}

## Points of Strong Consensus
${result.consensusPoints.map(cp => `- [x] ${cp}`).join('\n')}

## Points of Friction & Divergence
${result.frictionPoints.map(fp => `- [ ] ${fp}`).join('\n')}
`;
  return frontmatter;
}
