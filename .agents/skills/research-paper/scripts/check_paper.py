#!/usr/bin/env python3
"""research-paper Phase 5 mechanical gate.

    python3 scripts/check_paper.py paper_draft.md --ledger results_ledger.csv --bib references.bib

Checks, each a FAIL line naming the offending item:

1. number-not-in-ledger — a metric-like number in the draft prose (decimal, percentage,
   n=/N= count; references section, headings, citations and [PENDING…] flags excluded)
   that no results_ledger.csv `value`/`dispersion` covers. Untraceable = fabrication risk.
2. citation-without-entry / entry-never-cited — `[@citekey]` ↔ references.bib, both ways.
3. placeholder / ai-tell — the SKILL.md Phase 5 grep patterns, same regex.
4. checklist-undisposed — a checklist_*.md row with an empty disposition column.

Exit 0: no mechanical findings (not proof the paper is right). 1: findings. 2: bad input.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from integrity_gate import (  # noqa: E402
    Finding,
    bib_keys,
    citekeys_in,
    finish,
    ledger_numbers,
    metric_numbers,
    pattern_hits,
    read_text,
    reconcile,
    split_body,
    usage_error,
)

#: 与 SKILL.md Phase 5 门禁 1 的 grep 模式逐字相同（tests/test_check_paper.py 锁定）
PLACEHOLDER_PATTERN = r"xxx|XXXX|\[TBD\]|\[PENDING|\[UNVERIFIED[^]]*\]|10\.xxxx|doi:10\.[a-z]+/x"
#: 与 SKILL.md Phase 5 门禁 2 的 grep -nEi 模式逐字相同
AI_TELL_PATTERN = (
    r"over the past ((few|several|two|three) )?(decades?|years)|in recent years,|it is worth noting"
    r"|plays a (crucial|pivotal|vital) role|sheds light on|paves the way|ever-evolving"
    r"|has garnered significant attention|delves into|a testament to|众所周知|近年来，?随着|日益受到(广泛)?关注"
)
#: 作者已向用户披露的旗标——`--allow-disclosed-flags` 时降为警告，其余占位符永远是失败
DISCLOSED_FLAG_RE = re.compile(r"^\[(PENDING|UNVERIFIED)")
LEDGER_COLUMNS = ("value", "dispersion")
UNDISPOSED = {"", "[ ]", "TBD", "tbd", "xxx"}


def check_numbers(draft: Path, body: list[tuple[int, str]], ledger: Path) -> list[Finding]:
    covered = ledger_numbers(ledger, LEDGER_COLUMNS)
    return [
        Finding("number-not-in-ledger", f"{draft.name}:{line}",
                f"'{raw}' is not covered by any {ledger.name} value — trace it or flag it [PENDING: …]")
        for line, raw, value in metric_numbers(body)
        if value not in covered
    ]


def check_citations(draft: Path, body: list[tuple[int, str]], bib: Path,
                    allow_uncited: set[str]) -> list[Finding]:
    listed = {key: bib.name for key in bib_keys(read_text(bib))}
    findings = reconcile(citekeys_in(body), listed, draft.name, bib.name)
    # 豁免只免「列了没引」，不免「引了没条目」
    return [
        item for item in findings
        if not (item.kind == "entry-never-cited" and item.detail.split()[0] in allow_uncited)
    ]


def check_patterns(draft: Path, text: str, allow_flags: bool) -> tuple[list[Finding], list[Finding]]:
    findings: list[Finding] = []
    warnings: list[Finding] = []
    for line, hit, context in pattern_hits(text, PLACEHOLDER_PATTERN):
        item = Finding("placeholder", f"{draft.name}:{line}", f"'{hit}' in: {context[:80]}")
        (warnings if allow_flags and DISCLOSED_FLAG_RE.match(hit) else findings).append(item)
    for line, hit, context in pattern_hits(text, AI_TELL_PATTERN, ignore_case=True):
        findings.append(Finding("ai-tell", f"{draft.name}:{line}", f"'{hit}' in: {context[:80]}"))
    return findings, warnings


def check_checklists(paths: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        for number, line in enumerate(read_text(path).splitlines(), start=1):
            row = line.strip()
            if re.match(r"^-\s*\[ \]", row):
                findings.append(Finding("checklist-undisposed", f"{path.name}:{number}",
                                        f"unchecked box: {row[:60]}"))
                continue
            if not row.startswith("|") or set(row) <= {"|", "-", ":", " "}:
                continue
            cells = [cell.strip() for cell in row.strip("|").split("|")]
            # 缺第二列（`| 3. Data sources |`）与空第二列同样是未处置
            if cells[0] and (len(cells) < 2 or cells[1] in UNDISPOSED):
                findings.append(Finding("checklist-undisposed", f"{path.name}:{number}",
                                        f"no location or disposition for: {cells[0][:60]}"))
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("draft", type=Path)
    parser.add_argument("--ledger", type=Path, required=True, help="results_ledger.csv")
    parser.add_argument("--bib", type=Path, required=True, help="references.bib")
    parser.add_argument("--checklist-dir", type=Path,
                        help="where checklist_*.md live (default: the draft's directory)")
    parser.add_argument("--skip-checklist", action="store_true",
                        help="drafting-stage run before the reporting checklist exists (warned)")
    parser.add_argument("--allow-disclosed-flags", action="store_true",
                        help="[PENDING…]/[UNVERIFIED…] already disclosed to the user: warn, don't fail")
    parser.add_argument("--allow-uncited", action="append", default=[], metavar="KEY",
                        help="bib entry deliberately listed without in-text citation (venue norm)")
    args = parser.parse_args(argv)

    for label, path in (("draft", args.draft), ("ledger", args.ledger), ("bib", args.bib)):
        if not path.is_file():
            return usage_error(f"{label} not found: {path}")

    try:
        findings, warnings = run_checks(args)
    except UnicodeDecodeError as error:
        return usage_error(f"an input file is not UTF-8: {error.reason}")
    except ValueError as error:  # InputError and a ledger without a value column
        return usage_error(str(error))
    return finish(findings, warnings, "check_paper")


def run_checks(args: argparse.Namespace) -> tuple[list[Finding], list[Finding]]:
    text = read_text(args.draft)
    body, _refs = split_body(text)
    findings = check_numbers(args.draft, body, args.ledger)
    findings += check_citations(args.draft, body, args.bib, set(args.allow_uncited))
    pattern_findings, warnings = check_patterns(args.draft, text, args.allow_disclosed_flags)
    findings += pattern_findings

    if args.skip_checklist:
        warnings.append(Finding("checklist-skipped", "-", "reporting checklist not checked (--skip-checklist)"))
    else:
        directory = args.checklist_dir or args.draft.parent
        checklists = sorted(directory.glob("checklist_*.md"))
        if not checklists:
            findings.append(Finding("checklist-missing", str(directory),
                                    "no checklist_*.md next to the draft (REPORTING_CHECKLISTS step 4)"))
        findings += check_checklists(checklists)
    return findings, warnings


if __name__ == "__main__":
    sys.exit(main())
