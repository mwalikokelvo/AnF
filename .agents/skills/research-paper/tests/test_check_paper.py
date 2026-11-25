"""check_paper.py 的行为测试：每个门禁各有一个能让它失败的输入，外加一份干净稿。"""

from __future__ import annotations

import io
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import check_paper  # noqa: E402

CLEAN_DRAFT = """# A Model for X

## Abstract

On the external test set (n=412) the model reached a mean Dice of 0.847
(95% CI 0.82-0.87), improving AUC by 4.1 points over the baseline [@smith2024model].

## 2. Methods

### 2.1 Data

We followed the split protocol of @lee2023split and trained for 200 epochs.

## 3. Results

Sensitivity was 91.5% on the internal set.

## References

Smith J. Model. Radiology. 2024;310(2):1-12. Reported kappa 0.62 and 87.5% agreement. doi:10.1148/radiol.2024.0001
"""

LEDGER = """claim_id,section,claim_text,value,unit,dispersion,source_artifact,source_locator,status
R1,Abstract,external test n,412,,,results/split.csv,row 2,verified
R2,Abstract,mean Dice,0.847,,95% CI 0.82-0.87,results/external_test.csv,row 14,verified
R3,Abstract,AUC gain,4.1,points,,results/main_table.tex,Table 1,verified
R4,Results,sensitivity,91.5,%,,results/internal.csv,row 3,verified
"""

BIB = """@article{smith2024model,
  title = {Model},
  author = {Smith, J.},
  year = {2024},
}
@inproceedings{lee2023split,
  title = {Split},
  author = {Lee, K.},
  year = {2023},
}
"""

CHECKLIST = """# CLAIM 2024

| Item | Location / disposition |
|---|---|
| 1. Title identifies AI methodology | Title |
| 2. Abstract structured summary | Abstract |
"""


class CheckPaperTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.write(draft=CLEAN_DRAFT, ledger=LEDGER, bib=BIB, checklist=CHECKLIST)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, *, draft=None, ledger=None, bib=None, checklist=None) -> None:
        for name, content in (("paper_draft.md", draft), ("results_ledger.csv", ledger),
                              ("references.bib", bib), ("checklist_claim.md", checklist)):
            if content is not None:
                (self.dir / name).write_text(content, encoding="utf-8")

    def run_gate(self, *extra: str) -> tuple[int, str]:
        out = io.StringIO()
        with redirect_stdout(out):
            code = check_paper.main([
                str(self.dir / "paper_draft.md"),
                "--ledger", str(self.dir / "results_ledger.csv"),
                "--bib", str(self.dir / "references.bib"),
                *extra,
            ])
        return code, out.getvalue()

    # --- clean -------------------------------------------------------------------------------

    def test_clean_fixture_passes(self):
        code, out = self.run_gate()
        self.assertEqual(code, 0, out)
        self.assertNotIn("FAIL", out)

    # --- (a) numbers ↔ ledger ----------------------------------------------------------------

    def test_untraced_decimal_fails_and_is_named(self):
        self.write(draft=CLEAN_DRAFT.replace("Sensitivity was 91.5%", "Specificity was 0.912"))
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertRegex(out, r"FAIL \[number-not-in-ledger\] paper_draft\.md:\d+: '0\.912'")

    def test_untraced_percentage_fails(self):
        self.write(draft=CLEAN_DRAFT.replace("91.5%", "93.0%"))
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("'93.0%'", out)

    def test_unit_glued_and_leading_dot_numbers_are_checked(self):
        # landing review: `12.5ms`、`r = .85`、`95%CI` 曾整段漏检
        for text, shown in (("latency 12.5ms", "12.5"), ("a 2.5x speedup", "2.5"),
                            ("3.5mm slices", "3.5"), ("r = .85", ".85"), ("p < .001", ".001"),
                            ("coverage 97%CI", "97%")):
            with self.subTest(text=text):
                self.write(draft=CLEAN_DRAFT.replace("## References", f"Also {text}.\n\n## References"))
                code, out = self.run_gate()
                self.assertEqual(code, 1, out)
                self.assertIn(f"'{shown}'", out)

    def test_leading_dot_matches_the_ledger_and_versions_are_not_numbers(self):
        ledger = LEDGER.rstrip("\n") + "\nC9,results,corr,0.85,,,a.csv,row 9,verified\n"
        draft = CLEAN_DRAFT.replace("## References", "Agreement r = .85 with tool 2.0.1.\n\n## References")
        self.write(draft=draft, ledger=ledger)
        code, out = self.run_gate()
        self.assertEqual(code, 0, out)

    def test_untraced_sample_size_fails(self):
        self.write(draft=CLEAN_DRAFT.replace("(n=412)", "(n=1,204)"))
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("'n=1,204'", out)

    def test_pending_flag_headings_and_references_are_not_numbers(self):
        draft = CLEAN_DRAFT.replace(
            "Sensitivity was 91.5% on the internal set.",
            "Sensitivity was 91.5% on the internal set; specificity [PENDING: 0.93 from rerun].",
        )
        self.write(draft=draft)
        code, out = self.run_gate("--allow-disclosed-flags")
        self.assertEqual(code, 0, out)
        self.assertNotIn("number-not-in-ledger", out)

    def test_numbers_in_chinese_prose_are_checked(self):
        # 回归（对抗方 S1-1）：\w 含汉字，旧边界让紧贴汉字的数字整句漏检
        draft = CLEAN_DRAFT.replace("## References", "外部验证AUC为0.912。\n\n## References")
        self.write(draft=draft)
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("'0.912'", out)

    def test_fullwidth_percent_and_equals_are_checked(self):
        # landing review r2：中文输入法打出的 `96％`、`n＝120` 曾整个漏检
        for text, shown in (("准确率为96％", "96％"), ("样本量n＝120", "n＝120")):
            with self.subTest(text=text):
                self.write(draft=CLEAN_DRAFT.replace("## References", f"{text}。\n\n## References"))
                code, out = self.run_gate()
                self.assertEqual(code, 1, out)
                self.assertIn(f"'{shown}'", out)

    def test_leading_dot_in_the_ledger_matches_the_draft(self):
        ledger = LEDGER.rstrip("\n") + "\nC9,results,corr,.85,,p < .001,a.csv,row 9,verified\n"
        draft = CLEAN_DRAFT.replace("## References", "Agreement r = .85 (p < .001).\n\n## References")
        self.write(draft=draft, ledger=ledger)
        code, out = self.run_gate()
        self.assertEqual(code, 0, out)

    def test_bracketed_confidence_interval_is_checked(self):
        # 回归（对抗方 S1-2）：只有 [PENDING…] 与引文可豁免，方括号里的置信区间要对账
        self.write(draft=CLEAN_DRAFT.replace("(95% CI 0.82-0.87)", "[95% CI 0.71, 0.80]"))
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("'0.71'", out)

    def test_thousands_separator_matches_the_ledger(self):
        # 回归（对抗方 S1-4）：账本里的 1,204 是一个数
        self.write(draft=CLEAN_DRAFT.replace("(n=412)", "(n=1,204)"),
                   ledger=LEDGER.replace("external test n,412", 'external test n,"1,204"'))
        code, out = self.run_gate()
        self.assertEqual(code, 0, out)

    def test_section_after_references_at_the_same_level_is_checked(self):
        # landing review：与 References 同级的 `## Appendix` 结束文献表，里面的数字照样对账
        self.write(draft=CLEAN_DRAFT + "\n## Appendix\n\nExtra AUC 0.777.\n")
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("'0.777'", out)

    def test_references_section_numbers_are_excluded(self):
        # 回归（对抗方 S1-6）：文献表里的 0.62 / 87.5% 不是本文结果；把它挪进正文就必须失败
        code, out = self.run_gate()
        self.assertEqual(code, 0, out)
        self.write(draft=CLEAN_DRAFT.replace("## References\n", "Reported kappa 0.62.\n\n## References\n"))
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("'0.62'", out)

    # --- (b) citekeys ↔ bib ------------------------------------------------------------------

    def test_citekey_without_bib_entry_fails(self):
        self.write(draft=CLEAN_DRAFT.replace("[@smith2024model]", "[@smith2024model; @ghost2025]"))
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertRegex(out, r"FAIL \[citation-without-entry\] paper_draft\.md:\d+: ghost2025")

    def test_bib_entry_never_cited_fails(self):
        self.write(bib=BIB + "@article{orphan2022,\n  title = {Orphan},\n  year = {2022},\n}\n")
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("[entry-never-cited]", out)
        self.assertIn("orphan2022", out)

    def test_allow_uncited_exempts_only_the_named_entry(self):
        self.write(bib=BIB + "@article{orphan2022,\n  title = {Orphan},\n  year = {2022},\n}\n")
        code, out = self.run_gate("--allow-uncited", "orphan2022")
        self.assertEqual(code, 0, out)

    def test_email_address_is_not_a_citekey(self):
        self.write(draft=CLEAN_DRAFT + "\nContact: author@example.org\n")
        code, out = self.run_gate()
        self.assertEqual(code, 0, out)

    # --- (c) placeholder / AI-tell -----------------------------------------------------------

    def test_fake_doi_placeholder_fails(self):
        self.write(draft=CLEAN_DRAFT.replace("doi:10.1148/radiol.2024.0001", "doi:10.xxxx/abc"))
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("[placeholder]", out)

    def test_pending_flag_fails_unless_disclosed(self):
        self.write(draft=CLEAN_DRAFT + "\nExternal AUC [PENDING: user to supply].\n")
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("FAIL [placeholder]", out)
        code, out = self.run_gate("--allow-disclosed-flags")
        self.assertEqual(code, 0, out)
        self.assertIn("WARN [placeholder]", out)

    def test_disclosure_flag_does_not_excuse_other_placeholders(self):
        # 回归（对抗方 S1-3）：--allow-disclosed-flags 只降级 [PENDING…]/[UNVERIFIED…]
        self.write(draft=CLEAN_DRAFT.replace("doi:10.1148/radiol.2024.0001", "doi:10.xxxx/abc"))
        code, out = self.run_gate("--allow-disclosed-flags")
        self.assertEqual(code, 1, out)
        self.assertIn("FAIL [placeholder]", out)

    def test_ai_tell_fails(self):
        self.write(draft=CLEAN_DRAFT.replace("## 2. Methods", "In recent years, X grew.\n\n## 2. Methods"))
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("[ai-tell]", out)

    # --- (d) checklist -----------------------------------------------------------------------

    def test_checklist_row_without_disposition_fails(self):
        self.write(checklist=CHECKLIST + "| 3. Data sources |  |\n")
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertRegex(out, r"FAIL \[checklist-undisposed\] checklist_claim\.md:\d+: .*3\. Data sources")

    def test_checklist_unchecked_box_tbd_and_missing_cell_fail(self):
        # 回归（对抗方 S1-5）
        for row, label in (("- [ ] 4. Reference standard", "unchecked box"),
                           ("| 5. Split unit | TBD |", "5. Split unit"),
                           ("| 6. External test |", "6. External test")):
            with self.subTest(row=row):
                self.write(checklist=CHECKLIST + row + "\n")
                code, out = self.run_gate()
                self.assertEqual(code, 1, out)
                self.assertRegex(out, r"FAIL \[checklist-undisposed\] .*" + re.escape(label))

    def test_missing_checklist_fails_unless_skipped(self):
        (self.dir / "checklist_claim.md").unlink()
        code, out = self.run_gate()
        self.assertEqual(code, 1, out)
        self.assertIn("[checklist-missing]", out)
        code, out = self.run_gate("--skip-checklist")
        self.assertEqual(code, 0, out)

    # --- usage -------------------------------------------------------------------------------

    def test_non_utf8_draft_is_usage_error(self):
        (self.dir / "paper_draft.md").write_bytes("灵敏度为0.912".encode("gbk"))
        code, _ = self.run_gate()
        self.assertEqual(code, 2)

    def test_missing_input_is_usage_error_not_pass(self):
        (self.dir / "references.bib").unlink()
        code, _ = self.run_gate()
        self.assertEqual(code, 2)


class GatePatternsMatchSkillDoc(unittest.TestCase):
    """脚本里的模式必须与 SKILL.md Phase 5 的 grep 逐字相同——两套门禁不许漂移。"""

    def test_placeholder_pattern_is_the_documented_grep(self):
        text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        documented = re.search(r'grep -nE "([^"]+)" paper_draft\.md', text).group(1)
        self.assertEqual(check_paper.PLACEHOLDER_PATTERN, documented)

    def test_ai_tell_pattern_is_the_documented_grep(self):
        text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        documented = re.search(r'grep -nEi "([^"]+)" paper_draft\.md', text).group(1)
        self.assertEqual(check_paper.AI_TELL_PATTERN, documented)


if __name__ == "__main__":
    unittest.main()
