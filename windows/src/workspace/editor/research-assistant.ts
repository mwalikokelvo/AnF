/**
 * Research Assistant for AnF Editor
 * 
 * Provides academic research scaffolding, citation extraction,
 * syntopical multi-source comparison, and academic quality auditing.
 * Inspired by luwill/research-skills & imbad0202/academic-research-skills.
 */

export interface InTextCitation {
  raw: string;
  author: string;
  year: string;
  pages?: string;
}

export interface ResearchProposal {
  topic: string;
  domain: string;
  markdown: string;
}

export interface AcademicAuditResult {
  score: number;
  wordCount: number;
  citations: InTextCitation[];
  hasClearThesis: boolean;
  hasCounterArgument: boolean;
  hasConclusion: boolean;
  suggestions: string[];
}

export interface SyntopicalComparisonItem {
  sourceTitle: string;
  author: string;
  perspective: string;
  keyPassage: string;
}

/** Extract APA style (Author, Year, p. X) citations from Markdown text. */
export function extractCitations(text: string): InTextCitation[] {
  if (!text) return [];
  const regex = /\(([A-Z][a-zA-Z\s.-]+?),\s*([12]\d{3}[a-z]?)(?:,\s*p{1,2}\.?\s*(\d+(?:-\d+)?))?\)/g;
  const results: InTextCitation[] = [];
  for (const m of text.matchAll(regex)) {
    results.push({
      raw: m[0],
      author: m[1].trim(),
      year: m[2],
      pages: m[3] || undefined,
    });
  }
  return results;
}

/** Create a structured academic research proposal draft. */
export function createResearchProposal(topic: string, domain = 'Interdisciplinary Studies'): ResearchProposal {
  const dateStr = new Date().toISOString().split('T')[0];
  const markdown = `# Research Proposal: ${topic}

> **Field:** ${domain}  
> **Date:** ${dateStr}  
> **Status:** Working Draft (Private Vault)

## 1. Executive Summary & Core Hypothesis
- **Hypothesis:** State the primary claim clearly and concisely.
- **Scope:** Define the empirical and theoretical boundaries of the investigation.

## 2. Literature Review & Theoretical Grounding
- Foundational references:
  - [[Key Literature 1]]
  - [[Key Literature 2]]
- Identify existing gaps, debates, or methodological limitations.

## 3. Methodology & Evidence
- Primary source material and datasets.
- Qualitative or quantitative synthesis framework.

## 4. Counter-Arguments & Limitations
- What are the strongest objections or alternative explanations?
- How does the evidence address or bound these objections?

## 5. Academic Quality Checklist
- [ ] Central thesis is explicit and falsifiable
- [ ] Primary evidence is clearly separated from interpretive commentary
- [ ] In-text citations reference verified vault or literature records
- [ ] Conflicting viewpoints are steelmanned and analyzed
`;

  return { topic, domain, markdown };
}

/** Build a Markdown syntopical comparison table across multiple sources. */
export function buildSyntopicalTable(topic: string, items: SyntopicalComparisonItem[]): string {
  let md = `## Syntopical Comparison: ${topic}\n\n`;
  md += `| Source | Author | Perspective / Stance | Key Evidence / Passage |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  for (const item of items) {
    const cleanPassage = item.keyPassage.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    md += `| **${item.sourceTitle}** | ${item.author} | ${item.perspective} | "${cleanPassage}" |\n`;
  }
  return md + '\n';
}

/** Audit Markdown draft for academic rigor and structure. */
export function auditAcademicText(text: string): AcademicAuditResult {
  const str = text || '';
  const words = str.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const citations = extractCitations(str);
  
  const hasClearThesis = /(?:thesis|hypothesis|we propose|this paper argues|i argue|central claim)\b/i.test(str);
  const hasCounterArgument = /\b(however|conversely|in contrast|nevertheless|opposing view|critics argue|on the other hand)\b/i.test(str);
  const hasConclusion = /\b(in conclusion|to conclude|summary|therefore|ultimately|in summary)\b/i.test(str);

  let score = 0;
  const suggestions: string[] = [];

  if (hasClearThesis) score += 25;
  else suggestions.push('State your central hypothesis or core claim explicitly.');

  if (citations.length > 0) score += 25;
  else suggestions.push('Include in-text citations e.g. (Author, Year) to support arguments.');

  if (hasCounterArgument) score += 25;
  else suggestions.push('Address potential counter-arguments or opposing perspectives.');

  if (hasConclusion) score += 15;
  else suggestions.push('Provide a definitive concluding synthesis.');

  if (wordCount >= 250) score += 10;
  else suggestions.push('Elaborate with additional evidence and context (aim for at least 250 words).');

  return {
    score: Math.min(100, score),
    wordCount,
    citations,
    hasClearThesis,
    hasCounterArgument,
    hasConclusion,
    suggestions,
  };
}
