# Integrity & Accuracy Guardrails (ALWAYS on)

These separate a *scholarly* tool from a *marketing* tool. They are enforced by gates (the
CKPT-3 self-review), not treated as suggestions. They apply at every stage.

Citation/number rules 1-2, 4-5 below are **derived from** the repository's shared
citation-integrity core (`docs/citation-integrity-core.md` at development time; this copy
ships self-contained), instantiated for a deck whose deliverable is slides; rules 3, 6-7
and the flag taxonomy are slide-specific.

## Hard rules
1. **Never fabricate numbers.** Every statistic / metric / p-value / axis value comes from the
   source digest. Charts are data-bound to extracted values, never an image model's guess.
   Do not "fill in" a plausible accuracy or round a reported number.
2. **Never fabricate citations.** No invented authors / years / venues / DOIs. Citations are
   grounded in Zotero (`mcp__zotero__*`) or verified via arXiv / DOI / Crossref. A references
   slide written from memory is a fabrication vector and is blocked.
3. **Never fabricate figures.** Reuse the paper's real figures (bbox-cropped, attributed).
   Redrawing is allowed only for a genuinely conceptual schematic with no factual content, and
   it must be labeled "redrawn, not from source". Generative image art is quarantined to
   title/conceptual decoration and labeled.
4. **Faithfully represent the source.** No overclaiming beyond what the paper states. Preserve
   hedges, scope conditions, and the authors' own stated limitations. Don't upgrade "suggests"
   to "proves"; don't drop the dataset/scope that bounds a claim.
5. **Flag, don't invent.** An un-extractable figure, an ambiguous number, or an unresolved
   citation emits a visible placeholder surfaced to the user — never a silent substitute.
6. **Provenance is mandatory.** Every reused figure/table carries its source; every claim
   traces back to a paper span (a `source_ref`). The deck must be defensible under questioning.
7. **Disclose generated assets.** Anything not from the source is labeled, consistent with
   venue policies on generated content.

## Flag taxonomy
Use these literal markers; the QA gate scans for them and they are reviewed at CKPT-3:
- `[MISSING: Figure 3 not found]` — a referenced asset could not be extracted/located.
- `[UNVERIFIED: cite key]` — a citation did not resolve in Zotero/Crossref/arXiv.
- `[UNVERIFIED: value]` — a number could not be read confidently from the source.
- `[REDRAWN]` — a conceptual schematic was redrawn rather than reused from the source.
- `[GENERATED]` — title/conceptual art produced by an image model.

A deck may ship with flags **only** after the user has seen and accepted each one at CKPT-3.

## What grounding does NOT prove

The QA number-grounding check proves a number on a slide **appears in the source text** —
boundary-matched, not superstring. It does **not** prove semantic correctness: a slide can
say "increased" where the source says "decreased", quote the right number against the wrong
metric, or drop a unit and still pass grounding. Direction, unit, and claim-to-evidence
mapping are CKPT-3 human checks; treat "grounding passed" as "no fabricated digits", never
as "the claim is right".
