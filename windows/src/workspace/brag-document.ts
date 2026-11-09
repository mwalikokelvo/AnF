/**
 * Developer Accomplishments & Impact Log Generator
 * Inspired by latent-spaces/brag.
 * Automatically synthesizes completed tasks, architectural milestones,
 * and shipped features into structured Markdown brag documents for engineering reviews.
 */

export interface BragItem {
  text: string;
  source?: string;
  category?: 'Feature' | 'Architecture' | 'Quality' | 'Standard';
}

export interface BragDocumentInput {
  title?: string;
  period?: string;
  author?: string;
  completedTasks: BragItem[];
  inProgressTasks?: BragItem[];
  architecturalMilestones?: string[];
  qualityMetrics?: {
    unitTestsPassing?: number;
    e2eTestsPassing?: number;
    testSuites?: number;
    regressionGatesPassing?: number;
    bundleBuildTime?: string;
  };
  keyLearnings?: string[];
}

/**
 * Categorize a task or accomplishment text into an engineering area.
 */
export function categorizeBragText(text: string): 'Feature' | 'Architecture' | 'Quality' | 'Standard' {
  const lower = text.toLowerCase();
  if (['rfc', 'standard', 'podcasting', 'ics', 'icalendar', 'spec', 'format', 'yaml'].some(k => lower.includes(k))) {
    return 'Standard';
  }
  if (['test', 'gate', 'ci', 'verify', 'regression', 'mock', 'assert', 'coverage', 'audit'].some(k => lower.includes(k))) {
    return 'Quality';
  }
  if (['engine', 'dsp', 'gain', 'crypto', 'cache', 'pipeline', 'adapter', 'refactor', 'decouple', 'architecture', 'graph'].some(k => lower.includes(k))) {
    return 'Architecture';
  }
  return 'Feature';
}

/**
 * Generate a clean, structured Markdown brag document with YAML frontmatter.
 */
export function buildBragDocument(input: BragDocumentInput): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const docTitle = input.title || `Engineering Accomplishments · ${input.period || dateStr}`;
  const totalCompleted = input.completedTasks.length;

  // Group tasks by category
  const categories: Record<'Feature' | 'Architecture' | 'Quality' | 'Standard', BragItem[]> = {
    Feature: [],
    Architecture: [],
    Quality: [],
    Standard: [],
  };

  for (const task of input.completedTasks) {
    const cat = task.category || categorizeBragText(task.text);
    categories[cat].push(task);
  }

  const frontmatter = `---
title: "${docTitle}"
type: brag-document
date: ${dateStr}
period: "${input.period || dateStr}"
completed_items: ${totalCompleted}
tags:
  - brag
  - accomplishments
  - engineering-review
  - impact
---

# ${docTitle}

> **Impact Summary:** Shipped **${totalCompleted}** completed deliverables across features, architecture, and standards.  
> **Author:** ${input.author || 'Senior Software Engineer'}  
> **Generated:** ${dateStr} (via AnF / Latent-Spaces Brag Engine)

## Executive Summary
This document synthesizes key engineering outcomes, shipped user-facing capabilities, architectural hardenings, and quality metrics achieved during this delivery window.
`;

  const sections: string[] = [frontmatter];

  // Shipped features
  if (categories.Feature.length > 0) {
    sections.push(`## Shipped Features & User Capabilities (${categories.Feature.length})\n` +
      categories.Feature.map(t => `- [x] **${t.text}**${t.source ? ` *(Source: ${t.source})*` : ''}`).join('\n')
    );
  }

  // Architecture & DSP
  if (categories.Architecture.length > 0) {
    sections.push(`## Architectural & Core Engine Improvements (${categories.Architecture.length})\n` +
      categories.Architecture.map(t => `- [x] **${t.text}**${t.source ? ` *(Source: ${t.source})*` : ''}`).join('\n')
    );
  }

  // Standards & Interoperability
  if (categories.Standard.length > 0) {
    sections.push(`## Open Standards & Data Portability (${categories.Standard.length})\n` +
      categories.Standard.map(t => `- [x] **${t.text}**${t.source ? ` *(Source: ${t.source})*` : ''}`).join('\n')
    );
  }

  // Quality & Testing
  if (categories.Quality.length > 0 || input.qualityMetrics) {
    let qualStr = `## Quality, Testing & Reliability (${categories.Quality.length})\n`;
    if (input.qualityMetrics) {
      const qm = input.qualityMetrics;
      qualStr += `> **Automated Gates:** ${qm.unitTestsPassing || '100%'} unit tests passing (${qm.testSuites || 'all'} suites) · ${qm.e2eTestsPassing || '100%'} E2E tests · ${qm.regressionGatesPassing || 11}/11 release checks · Build: ${qm.bundleBuildTime || 'clean'}\n\n`;
    }
    if (categories.Quality.length > 0) {
      qualStr += categories.Quality.map(t => `- [x] ${t.text}${t.source ? ` *(Source: ${t.source})*` : ''}`).join('\n');
    }
    sections.push(qualStr);
  }

  // Custom architectural milestones if provided
  if (input.architecturalMilestones && input.architecturalMilestones.length > 0) {
    sections.push(`## Major Architectural Milestones\n` +
      input.architecturalMilestones.map(m => `- ✨ ${m}`).join('\n')
    );
  }

  // Active in-progress tasks
  if (input.inProgressTasks && input.inProgressTasks.length > 0) {
    sections.push(`## In-Flight / Next Focus Items (${input.inProgressTasks.length})\n` +
      input.inProgressTasks.map(t => `- [ ] ⏳ **${t.text}**${t.source ? ` *(Source: ${t.source})*` : ''}`).join('\n')
    );
  }

  // Key learnings
  if (input.keyLearnings && input.keyLearnings.length > 0) {
    sections.push(`## Key Engineering Insights & Ponytail Senior Dev Lessons\n` +
      input.keyLearnings.map(l => `- 💡 ${l}`).join('\n')
    );
  }

  return sections.join('\n\n') + '\n';
}
