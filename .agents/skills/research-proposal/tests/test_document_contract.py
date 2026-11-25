r"""research-proposal 的文档契约测试。

沿用 medical-imaging-review 的 test_document_contract 模式（第三轮评审
XC-06）：把「文档声称的纪律」锁进 CI，漂移变红。覆盖第三轮评审的
RPROP-07/08——AI-tell 门禁此前放走自家禁用表列出的短语，占位符豁免
此前是英文专属。
"""

from re import findall, search
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

#: 门禁是 grep——测试也必须用真实 grep 执行（CB-1 教训：re/ugrep 与
#: BSD/POSIX grep 的括号类语义不同）。macOS 用 /usr/bin/grep，Linux 用 PATH 里的 GNU grep。
GREP = "/usr/bin/grep" if Path("/usr/bin/grep").exists() else shutil.which("grep")


def run_gate_grep(pattern: str, text: str, *, ignore_case: bool = True) -> bool:
    """用系统 grep -Ei 判断 pattern 是否命中 text。"""
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as handle:
        handle.write(text)
        name = handle.name
    try:
        result = subprocess.run(
            [GREP, "-nE" + ("i" if ignore_case else ""), pattern, name],
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        Path(name).unlink(missing_ok=True)
    return result.returncode == 0


def ai_tell_pattern() -> str:
    text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    match = search(r'grep -nEi "([^"]*over the past[^"]*)"', text)
    assert match, "SKILL.md Phase 5 应包含 AI-tell 门禁 grep"
    return match.group(1)


def placeholder_pattern() -> str:
    text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    match = search(r'grep -nE "([^"]*UNVERIFIED[^"]*)"', text)
    assert match, "SKILL.md Phase 5 应包含 canonical 占位符门禁"
    return match.group(1)


class AiTellGateContract(unittest.TestCase):
    def test_gate_covers_the_banned_family_from_the_style_guide(self):
        pattern = ai_tell_pattern()
        for phrase in (
            "plays a vital role in",
            "sheds light on",
            "paves the way for",
            "the ever-evolving landscape of",
            "Over the past three decades, scholarship has",
            "Over the past few years,",
        ):
            with self.subTest(phrase=phrase, engine=GREP):
                self.assertTrue(run_gate_grep(pattern, phrase), phrase)

    def test_gate_keeps_legitimate_numbered_spans_out(self):
        self.assertFalse(
            run_gate_grep(ai_tell_pattern(), "over the past 5 years, enrollment grew.")
        )

    def test_reference_files_do_not_recommend_banned_openings(self):
        for relative in ("references/DOMAIN_TEMPLATES.md", "references/STRUCTURE_GUIDE.md"):
            with self.subTest(file=relative):
                text = (ROOT / relative).read_text(encoding="utf-8")
                self.assertIsNone(
                    search(r"over the past\s*\[timeframe\]", text, re.I),
                    "模板句不得推荐门禁禁用的开头家族",
                )


class PlaceholderGateContract(unittest.TestCase):
    def test_canonical_regex_matches_colon_and_bare_flags_under_real_grep(self):
        """SKILL.md:170 自称 single canonical version——在真实 grep 下两种旗标
        形态都必须命中（CB-1：`[^\\]]` 写法在 BSD grep 下静默失配）。"""
        pattern = placeholder_pattern()
        with self.subTest(form="colon", engine=GREP):
            self.assertTrue(
                run_gate_grep(pattern, "Cite [UNVERIFIED: Smith et al. 2024] here."),
            )
        with self.subTest(form="bare", engine=GREP):
            self.assertTrue(run_gate_grep(pattern, "Entry [UNVERIFIED]."))


class PlaceholderExemptionContract(unittest.TestCase):
    def test_exemption_covers_the_chinese_scaffold_header_fields(self):
        text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("[所属学科]", text, "豁免清单应包含中文 scaffold 表头字段")
        self.assertIn("[年月]", text)


class LinkContract(unittest.TestCase):
    def test_relative_links_in_skill_md_resolve(self):
        text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        targets = findall(r"\]\(([^)#]+?)(?:#[^)]*)?\)", text)
        relative = [t for t in targets if not t.startswith(("http", "mailto"))]
        self.assertTrue(relative, "SKILL.md 应引用本地文件")
        for target in relative:
            with self.subTest(target=target):
                self.assertTrue(
                    (ROOT / target).exists(), f"失效引用：{target}"
                )


if __name__ == "__main__":
    unittest.main()
