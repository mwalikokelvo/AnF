# Citation Integrity (journal-style instantiation)

Derived from the repository's shared five-rule citation-integrity core
(`docs/citation-integrity-core.md` at development time; this copy ships
self-contained), instantiated for **journal/conference citation styles**
(author–year or numeric per the venue). The core rules read here as:

1. **Existence before use.** A reference enters the bibliography only after its
   existence is confirmed against a first source (resolvable DOI, PubMed,
   arXiv, publisher page, or Zotero metadata). The Crossref REST API
   (`WebFetch https://api.crossref.org/works/<DOI>`) is the highest-signal
   existence+metadata check for journal articles.
2. **Identity verbatim.** Author list, year, title, venue as cited match the
   source exactly. No silent truncation of author lists beyond what the style
   permits; no "et al." where the style spells out.
3. **Unverifiable → `[UNVERIFIED: …]`** inline + explicit disclosure to the
   user; the user decides before submission.
4. **Never invent furniture.** No fabricated DOIs, page ranges, volume/issue,
   or authors to complete an entry.
5. **Claims match sources.** Every cited quantitative or directional claim
   matches the cited work in magnitude and direction; hedges and scope
   conditions survive the paraphrase.

Governing principle: **宁可少，不可假。** Related Work cites what the argument
positions against — no padding, no citation-swap to game reference count.

## Style-specific mechanics

- **Numeric styles** (IEEE, most venues' `[1]`): numbering follows first-use
  order; one entry per source (never duplicate entries for the same work).
- **Author–year** (Nature-ish, APA): consistent et-al. rule from the venue's
  guide; in-text `(Author et al., 2024)` reconciles 1:1 with the reference
  list.
- **Preprints vs. versions:** cite the version you actually read; if the
  published version exists, cite it (or both, per venue norm) — never silently
  swap after submission.
- **Self-citations** go in on merit only; a reviewer can tell.

## Reconciliation gate (Phase 5)

Every in-text citation has exactly one bibliography entry, and every entry is
cited (or deliberately included per venue norm — state which). For
author–year styles a quick `grep -oE "\([A-Z][a-zA-Z]+( et al\.| and [A-Z][a-zA-Z]+)?, [0-9]{4}[a-z]?\)"`
spot-list helps (covers `(Smith, 2024)`, `(Smith and Jones, 2024)`, and
`(Smith et al., 2024)` — grep is a sample, not the census; reconcile the rest
by reading); for numeric styles the outline-to-reference map in
`paper_plan.md` is the audit trail.

The working draft avoids that problem altogether: it cites stable pandoc
citekeys (`[@smith2024model]`) against `references.bib`, and
`scripts/check_paper.py` reconciles them 1:1 mechanically (citekey with no
entry, entry never cited). The venue style is rendered from the citekeys only
at final formatting.
