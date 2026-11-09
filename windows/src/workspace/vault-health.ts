/**
 * Vault Health, Broken Link Finder & Knowledge Graph Analytics
 *
 * Diagnoses knowledge vault integrity by detecting broken wikilinks,
 * identifying orphan notes, calculating graph connectivity metrics,
 * and generating actionable health reports for Obsidian / AnF vaults.
 * Follows Ponytail Lazy Senior Dev principles: pure TypeScript, zero dependencies.
 */

import { references, type KnowledgeNote } from './knowledge-data';

export interface BrokenLink {
  sourceNoteId: string;
  sourceNoteName: string;
  missingTarget: string;
}

export interface OrphanNote {
  noteId: string;
  noteName: string;
  wordCount: number;
}

export interface HubNote {
  noteId: string;
  noteName: string;
  inboundCount: number;
  outboundCount: number;
  totalConnections: number;
}

export interface VaultHealthReport {
  timestamp: string;
  totalNotes: number;
  totalWords: number;
  totalWikilinks: number;
  totalTags: number;
  uniqueTagsCount: number;
  brokenLinks: BrokenLink[];
  orphanNotes: OrphanNote[];
  hubNotes: HubNote[];
  graphDensity: number; // 0.0 to 1.0
  healthScore: number; // 0 to 100
}

/**
 * Analyzes a collection of knowledge notes and produces a comprehensive health report.
 */
export function auditVaultHealth(notes: KnowledgeNote[]): VaultHealthReport {
  const noteNameSet = new Set(notes.map(n => n.name.trim().toLowerCase()));
  const noteMap = new Map<string, KnowledgeNote>();
  for (const n of notes) {
    noteMap.set(n.id, n);
  }

  const outbound = new Map<string, Set<string>>(); // noteId -> targets
  const inbound = new Map<string, Set<string>>();  // noteNameLower -> sourceNoteIds
  const brokenLinks: BrokenLink[] = [];
  const allTags = new Set<string>();

  let totalWords = 0;
  let totalWikilinks = 0;

  for (const n of notes) {
    const text = n.draft || '';
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
    totalWords += words;

    const refs = references(text);
    totalWikilinks += refs.links.length;

    for (const t of refs.tags) {
      allTags.add(t);
    }

    const noteOutbound = new Set<string>();
    for (const link of refs.links) {
      const cleanLink = link.trim().toLowerCase();
      noteOutbound.add(cleanLink);

      if (!noteNameSet.has(cleanLink)) {
        brokenLinks.push({
          sourceNoteId: n.id,
          sourceNoteName: n.name,
          missingTarget: link,
        });
      } else {
        let inSet = inbound.get(cleanLink);
        if (!inSet) {
          inSet = new Set();
          inbound.set(cleanLink, inSet);
        }
        inSet.add(n.id);
      }
    }
    outbound.set(n.id, noteOutbound);
  }

  // Identify orphans (0 outbound valid links and 0 inbound links)
  const orphanNotes: OrphanNote[] = [];
  const hubNotes: HubNote[] = [];

  for (const n of notes) {
    const noteNameLower = n.name.trim().toLowerCase();
    const inCount = inbound.get(noteNameLower)?.size || 0;
    const outSet = outbound.get(n.id) || new Set();
    // Only count outbound links that actually resolve
    let validOutCount = 0;
    for (const target of outSet) {
      if (noteNameSet.has(target)) validOutCount++;
    }

    const totalConns = inCount + validOutCount;
    const wordCount = (n.draft || '').trim() ? (n.draft || '').trim().split(/\s+/u).length : 0;

    if (totalConns === 0) {
      orphanNotes.push({
        noteId: n.id,
        noteName: n.name,
        wordCount,
      });
    }

    if (totalConns > 0) {
      hubNotes.push({
        noteId: n.id,
        noteName: n.name,
        inboundCount: inCount,
        outboundCount: validOutCount,
        totalConnections: totalConns,
      });
    }
  }

  hubNotes.sort((a, b) => b.totalConnections - a.totalConnections);

  const n = notes.length;
  const maxPossibleEdges = n > 1 ? n * (n - 1) : 1;
  const actualEdges = Array.from(inbound.values()).reduce((acc, s) => acc + s.size, 0);
  const graphDensity = Math.round((actualEdges / maxPossibleEdges) * 1000) / 1000;

  // Compute Health Score (0-100)
  // Penalize broken links (-5 per broken link, max -40)
  // Penalize orphan note ratio (-30 * (orphan / total))
  let score = 100;
  if (notes.length > 0) {
    const brokenPenalty = Math.min(40, brokenLinks.length * 5);
    const orphanPenalty = Math.min(30, Math.round((orphanNotes.length / notes.length) * 30));
    score = Math.max(10, 100 - brokenPenalty - orphanPenalty);
  }

  return {
    timestamp: new Date().toISOString(),
    totalNotes: notes.length,
    totalWords,
    totalWikilinks,
    totalTags: Array.from(allTags).length,
    uniqueTagsCount: allTags.size,
    brokenLinks,
    orphanNotes,
    hubNotes: hubNotes.slice(0, 10),
    graphDensity,
    healthScore: score,
  };
}

/**
 * Formats a VaultHealthReport into a clean Markdown note with frontmatter.
 */
export function vaultHealthToMarkdown(report: VaultHealthReport): string {
  const frontmatter = [
    '---',
    'title: "Vault Health & Graph Analytics"',
    'type: vault-report',
    `health_score: ${report.healthScore}`,
    `total_notes: ${report.totalNotes}`,
    `broken_links_count: ${report.brokenLinks.length}`,
    `orphan_notes_count: ${report.orphanNotes.length}`,
    `created_at: "${report.timestamp}"`,
    '---',
    '',
  ].join('\n');

  const lines = [
    frontmatter,
    '# Vault Health & Graph Analytics',
    '',
    `> **Overall Health Score**: **${report.healthScore}/100** | **Total Notes**: ${report.totalNotes.toLocaleString()} | **Total Words**: ${report.totalWords.toLocaleString()}`,
    '',
    '## Integrity Overview',
    `- **Broken Wikilinks**: \`${report.brokenLinks.length}\``,
    `- **Orphan Notes** (no links): \`${report.orphanNotes.length}\``,
    `- **Total Wikilinks**: \`${report.totalWikilinks}\``,
    `- **Unique Tags**: \`${report.uniqueTagsCount}\``,
    `- **Graph Density**: \`${(report.graphDensity * 100).toFixed(1)}%\``,
    '',
  ];

  if (report.brokenLinks.length > 0) {
    lines.push('## Broken Wikilinks (Missing Target Notes)');
    lines.push('| Source Note | Missing Target | Action |');
    lines.push('|---|---|---|');
    for (const b of report.brokenLinks) {
      lines.push(`| \`${b.sourceNoteName}\` | \`[[${b.missingTarget}]]\` | Create note or update link |`);
    }
    lines.push('');
  } else {
    lines.push('## Broken Wikilinks');
    lines.push('All wikilinks resolve successfully to existing notes in the vault.\n');
  }

  if (report.orphanNotes.length > 0) {
    lines.push('## Orphan Notes (Disconnected from Graph)');
    lines.push('| Note Name | Word Count | Suggestion |');
    lines.push('|---|---|---|');
    for (const o of report.orphanNotes) {
      lines.push(`| \`${o.noteName}\` | ${o.wordCount} words | Link from an index or daily note |`);
    }
    lines.push('');
  }

  if (report.hubNotes.length > 0) {
    lines.push('## Top Knowledge Hubs');
    lines.push('| Hub Note | Inbound Links | Outbound Links | Total Connections |');
    lines.push('|---|---|---|---|');
    for (const h of report.hubNotes) {
      lines.push(`| **${h.noteName}** | ${h.inboundCount} | ${h.outboundCount} | **${h.totalConnections}** |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
