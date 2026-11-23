/**
 * PRISMA Protocol Systematic Reviewer & Multi-Source Matrix
 * 
 * Implements PRISMA 2020 systematic literature review workflow tracking
 * and cross-study multi-source synthesis matrix generation.
 * 
 * Inspired by luwill/research-skills systematic review methodology.
 */

export interface PrismaCounts {
  identified: number;
  duplicatesRemoved: number;
  screened: number;
  screenedExcluded: number;
  eligibilityAssessed: number;
  eligibilityExcluded: Record<string, number>; // reason -> count
  included: number;
}

export interface SynthesisStudyEntry {
  id: string;
  citation: string;
  researchQuestion: string;
  methodology: string;
  findings: string;
  limitations: string;
}

export class PrismaMatrixEngine {
  private counts: PrismaCounts;
  private studies: SynthesisStudyEntry[] = [];

  constructor(initialCounts?: Partial<PrismaCounts>) {
    this.counts = {
      identified: initialCounts?.identified ?? 0,
      duplicatesRemoved: initialCounts?.duplicatesRemoved ?? 0,
      screened: initialCounts?.screened ?? 0,
      screenedExcluded: initialCounts?.screenedExcluded ?? 0,
      eligibilityAssessed: initialCounts?.eligibilityAssessed ?? 0,
      eligibilityExcluded: initialCounts?.eligibilityExcluded ?? {},
      included: initialCounts?.included ?? 0
    };
  }

  public updatePrismaStage(stage: keyof Omit<PrismaCounts, 'eligibilityExcluded'>, count: number): void {
    this.counts[stage] = count;
  }

  public addEligibilityExclusion(reason: string, count: number): void {
    this.counts.eligibilityExcluded[reason] = (this.counts.eligibilityExcluded[reason] || 0) + count;
  }

  public addStudy(study: SynthesisStudyEntry): void {
    this.studies.push(study);
    this.counts.included = this.studies.length;
  }

  public getCounts(): PrismaCounts {
    return { ...this.counts };
  }

  /**
   * Generates a Mermaid Flowchart illustrating the PRISMA 2020 protocol
   */
  public generatePrismaMermaidDiagram(): string {
    const totalExcludedEligibility = Object.values(this.counts.eligibilityExcluded).reduce((a, b) => a + b, 0);
    const reasonsStr = Object.entries(this.counts.eligibilityExcluded)
      .map(([r, c]) => `${r}: ${c}`)
      .join('<br/>') || 'None recorded';

    return [
      'flowchart TD',
      `  A["Identification<br/>Records Identified (n = ${this.counts.identified})"] --> B["Duplicate Removal<br/>Duplicates Removed (n = ${this.counts.duplicatesRemoved})"]`,
      `  B --> C["Screening<br/>Records Screened (n = ${this.counts.screened})"]`,
      `  C -->|Excluded| D["Records Excluded (n = ${this.counts.screenedExcluded})"]`,
      `  C --> E["Eligibility<br/>Full-Text Assessed (n = ${this.counts.eligibilityAssessed})"]`,
      `  E -->|Excluded with Reasons| F["Excluded (n = ${totalExcludedEligibility})<br/>${reasonsStr}"]`,
      `  E --> G["Included<br/>Studies in Synthesis (n = ${this.counts.included})"]`
    ].join('\n');
  }

  /**
   * Generates a multi-source comparative Markdown synthesis table
   */
  public generateSynthesisMatrixMarkdown(): string {
    if (this.studies.length === 0) {
      return '_No studies added to synthesis matrix._';
    }

    const header = '| Study / Citation | Research Question | Methodology | Core Findings | Limitations |\n| :--- | :--- | :--- | :--- | :--- |';
    const rows = this.studies.map(s => {
      const clean = (str: string) => str.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      return `| **${clean(s.citation)}** | ${clean(s.researchQuestion)} | ${clean(s.methodology)} | ${clean(s.findings)} | ${clean(s.limitations)} |`;
    });

    return [header, ...rows].join('\n');
  }
}
