# Quality Checklist

Split into **mechanical gates** (paste command output as evidence — a gate
without output is unchecked) and **judgment items** (anchored). The results
ledger reconciliation is the paper-specific gate that has no counterpart in
the proposal skill: your own numbers are the fabrication risk here.

## Mechanical gates

- [ ] **Executable gate** exits 0 (paste its output): covers the four gates
      below — numbers ↔ ledger, `[@citekey]` ↔ `references.bib`, placeholder /
      AI-tell patterns, checklist dispositions:
      `python3 <skill_dir>/scripts/check_paper.py paper_draft.md --ledger results_ledger.csv --bib references.bib`
      The manual commands below remain the fallback without Python and the
      explanation of what each check means.
- [ ] Placeholder gate returns 0 hits, or every `[UNVERIFIED]`/`[PENDING]` is
      explicitly disclosed and never presented as real:
      `grep -nE "xxx|XXXX|\[TBD\]|\[PENDING|\[UNVERIFIED[^]]*\]|10\.xxxx|doi:10\.[a-z]+/x" paper_draft.md`
- [ ] AI-tell gate returns 0 hits (regex in SKILL.md Phase 5).
- [ ] **Reporting-checklist artifact**: `checklist_<name>.md` exists next to the draft
      and every table row carries a disposition (REPORTING_CHECKLISTS 规定的两列
      表：条目 → 位置或处置；空第二列 = 未处置):
      ```bash
      ls checklist_*.md && python3 - <<'PY'
      import glob, re, sys
      bad = []
      for path in sorted(glob.glob("checklist_*.md")):
          for n, line in enumerate(open(path, encoding="utf-8"), 1):
              row = line.strip()
              if re.match(r"^-\s*\[ \]", row):
                  bad.append(f"{path}:{n} unchecked box: {row[:40]}")
                  continue
              if not row.startswith("|") or set(row) <= {"|", "-", ":", " "}:
                  continue  # 只看表格数据行
              cells = [c.strip() for c in row.strip("|").split("|")]
              if len(cells) >= 2 and cells[0] and (
                  not cells[1] or cells[1] in {"[ ]", "TBD", "xxx"}
              ):
                  bad.append(f"{path}:{n} no disposition: {cells[0][:40]}")
      print("\n".join(bad) or "all checklist rows disposed")
      sys.exit(1 if bad else 0)
      PY
      ```

- [ ] **results_ledger reconciliation**: every number in the manuscript's own
      prose — Abstract, Methods (n=, doses, hyperparameters), Results, and
      Discussion restatements — appears in `results_ledger.csv` with the same
      value; every ledger row backing a claim is actually cited in the text.
      Paste-command diff (lists every draft number no ledger value covers —
      each hit is either a retyped-from-memory error (fix) or formatting,
      e.g. percent vs. fraction (unify); years, section numbers and citation
      brackets are judgment calls, not auto-passes):
      ```bash
      python3 - <<'PY'
      import csv, pathlib, re
      draft = pathlib.Path("paper_draft.md").read_text(encoding="utf-8")
      draft = re.sub(r"\[[^\]]*\]", "", draft)  # strip citations/flags first
      numbers = set(re.findall(r"\d+(?:\.\d+)?", draft))
      ledger = set()
      for row in csv.DictReader(open("results_ledger.csv", encoding="utf-8")):
          value = (row.get("value") or "").strip()
          if value:
              ledger |= set(re.findall(r"\d+(?:\.\d+)?", value))
      uncovered = sorted(numbers - ledger)
      print("draft numbers not covered by any ledger value:",
            uncovered if uncovered else "none")
      PY
      ```
- [ ] Citation reconciliation: in-text ↔ bibliography 1:1 both directions
      (see CITATION_INTEGRITY.md).
- [ ] Abbreviation list complete: every abbreviation defined at first use.
- [ ] Abstract word count within the venue limit — English `wc -w`;
      **Chinese counts characters, not whitespace words**: `wc -m`
      (`wc -w` reads a 19-character Chinese sentence as 2 "words").

## results_ledger.csv (built in Phase 2, checked in Phase 5)

One row per load-bearing number:

```csv
claim_id,section,claim_text,value,unit,dispersion,source_artifact,source_locator,status
R1,Results-3.1,"mean Dice on external test set",0.847,,95% CI 0.82-0.87,results/external_test.csv,row 14,verified
R2,Abstract,"AUC improved by 4.1 points",4.1,points,,results/main_table.tex,Table 1,verified
```

`status` ∈ verified | pending (pending rows must not appear in the draft
without a `[PENDING]` flag).

## Judgment items (anchored scoring)

- **5** — a domain expert reading only this section would not reorder, delete,
  or caveat anything; every claim carries evidence; all gates pass.
- **4** — at most one paragraph needs reweighting or one claim a stronger
  source; gates pass.
- **3** — does its job, but a supervisor would return it with specific line
  comments; gates pass.
- **2** — structural problem (results don't support the claims as ordered;
  any mechanical gate fails).
- **1** — missing/boilerplate content, or **any fabricated-or-untraceable
  number** (caps the whole paper at 1 regardless of other strengths).

| Dimension | Weight |
|---|---|
| Claims ↔ evidence (Results ordering & support) | 25% |
| Methods reproducibility | 20% |
| Reporting-checklist completeness | 20% |
| Writing style / cohesion | 15% |
| Discussion & limitations honesty | 10% |
| Title/abstract fidelity | 10% |

Minimum: nothing below 3 with named anchor evidence; weighted average ≥ 3.5;
all mechanical gates pass.
