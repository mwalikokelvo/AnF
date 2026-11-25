# Structure Guide (IMRaD and variants)

## The IMRaD spine (methods papers, observational studies)

| Section | Job | Length share (typical) |
|---|---|---|
| Title | One sentence: method + task + distinguishing claim | — |
| Abstract | Background (1) → gap (1) → method (2-3) → results with numbers (2-3) → implication (1) | 150-300 words / venue limit |
| Introduction | Funnel: concrete problem → why existing approaches fall short (cited) → this work's claim → contributions (2-4, prose or tight list per venue norm) | 15-20% |
| Methods | What was done, in reproducible detail: data, preprocessing, model/algorithm, training/evaluation protocol, baselines, statistics | 25-35% |
| Results | What was found, in order of the claims; tables/figures carry the numbers; **no interpretation** | 20-30% |
| Discussion | What it means: principal findings, relation to cited prior work (agree/disagree and why), limitations (honest, specific), future work | 15-25% |
| Conclusion | 1 short paragraph; no new claims | 3-5% |

### Methods-forward vs. hypotheses-forward

- **Engineering/ML papers** lead with the method. The full CS-venue order (matching
  SKILL.md's routing table): Abstract → Introduction → Related Work → Method →
  Experiments (setup/results may merge) → Discussion → Conclusion. No separate
  conference scaffold: start from `assets/paper_scaffold_en.md`, promote its
  related-work material to a top-level section after the Introduction, and keep
  Discussion before Conclusion. Contribution claims are testable by the
  experiments that follow.
- **Clinical/observational papers** lead with the question: Introduction →
  hypothesis → Methods → Results → Discussion. The STROBE checklist drives
  Methods completeness.

## Introduction, concretely

Open on the concrete problem — never scene-setting boilerplate (AI-tell gate
bans "Over the past decade…" and 中文 "近年来，随着……"). A working shape:

1. The task and why it matters (1-2 sentences, specific: modality, clinical or
   scientific decision at stake).
2. The state of the art and its specific shortcoming (cited; name the gap as a
   falsifiable statement, not "remains challenging").
3. This work: "We propose/present X, which …" — one sentence, matching the title.
4. Contributions (2-4): what is new, each verifiable from a Results table.

## Results ordering

Order results to answer the Introduction's claims in sequence — primary
outcome first, ablations/supplementary after. Every table/figure is called out
in the text with what to notice; no "as shown in Table 2" without the finding.
Numbers carry dispersion/CI where the data support it; exact values from
`results_ledger.csv`, never retyped from memory.

## Discussion without overclaiming

- Findings ↔ claims: restate the primary result with its number, then interpret.
- Comparison: agree/disagree with cited prior work and propose why — this is
  where Related Work gets its payoff.
- Limitations: name them yourself, specifically (data spectrum, single-center,
  no external validation, compute scale). A limitation you name is a boundary;
  one a reviewer names is a weakness.
- No new results appear in Discussion.

## 中文论文的对应关系

引言/方法/结果/讨论/结论对应同一条脊柱；注意：国内期刊（学报类）多用 GB/T 7714
顺序编码制（正文 `[1]`），学位论文按学校模板——写作前确认制式并在全文保持
一致（两制混排是实测过的错误形态）。
