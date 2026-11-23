"""Shared mechanical-gate core for the writing skills (citation-integrity core, executable form).

本文件在 research-paper/scripts/ 与 research-proposal/scripts/ 各有一份**逐字节相同**的副本
（skill 目录被单独复制安装，不能跨目录 import）。仓库级测试
tests/test_vendored_gate_core.py 在两份副本出现任何差异时变红——改一份就必须同步另一份。

只放与具体 skill 无关的机制：文本扫描、引用解析、对账、报告与退出码。
各 skill 的门禁模式（占位符、AI-tell 正则）留在各自的 check_*.py 里，并由文档契约测试
锁定为与 SKILL.md 中的 grep 模式逐字相同。
"""

from __future__ import annotations

import csv
import re
import sys
from dataclasses import dataclass
from pathlib import Path

#: 退出码：0 干净；1 有门禁失败；2 用法或输入文件错误（门禁没能运行，不是「通过」）
EXIT_CLEAN, EXIT_FINDINGS, EXIT_USAGE = 0, 1, 2

#: 参考文献节的标题——数字门禁与引文正文扫描到此为止（年份、卷期、页码不是结果数字）
REFERENCES_HEADING_RE = re.compile(
    r"^#{1,6}\s*(?:\d+[.、]?\s*)?(references|bibliography|参考文献)\s*$", re.I
)
FENCE_RE = re.compile(r"^\s*(```|~~~)")
HEADING_RE = re.compile(r"^#{1,6}\s")


@dataclass(frozen=True)
class Finding:
    kind: str
    location: str
    detail: str

    def render(self, level: str) -> str:
        return f"{level} [{self.kind}] {self.location}: {self.detail}"


class InputError(ValueError):
    """输入文件读不了——门禁没能运行（退出码 2），不能当作「有发现」，更不能当作「通过」。"""


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        raise InputError(f"{path.name} is not UTF-8 (convert it first, e.g. iconv -f GBK -t UTF-8)") from error
    except OSError as error:
        raise InputError(f"cannot read {path}: {error.strerror}") from error


def heading_level(line: str) -> int:
    return len(line) - len(line.lstrip("#"))


def split_body(text: str) -> tuple[list[tuple[int, str]], list[tuple[int, str]]]:
    """把文稿切成 (正文行, 参考文献节行)，跳过围栏代码块。行号从 1 开始。"""
    body: list[tuple[int, str]] = []
    refs: list[tuple[int, str]] = []
    in_fence = False
    refs_level = 0  # 参考文献标题的级别；0 = 不在参考文献节
    for number, line in enumerate(text.splitlines(), start=1):
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if REFERENCES_HEADING_RE.match(line.strip()):
            refs_level = heading_level(line)
            continue
        if refs_level and HEADING_RE.match(line) and heading_level(line) <= refs_level:
            # 「### 外文文献」这类子标题仍属参考文献节；同级或更高级的标题（附录等）才回到正文
            refs_level = 0
        (refs if refs_level else body).append((number, line))
    return body, refs


def pattern_hits(
    text: str, pattern: str, *, ignore_case: bool = False
) -> list[tuple[int, str, str]]:
    """逐行匹配门禁模式（与 SKILL.md 的 `grep -nE`/`-nEi` 同一模式），返回 (行号, 命中, 行)。"""
    compiled = re.compile(pattern, re.I if ignore_case else 0)
    hits: list[tuple[int, str, str]] = []
    for number, line in enumerate(text.splitlines(), start=1):
        for match in compiled.finditer(line):
            hits.append((number, match.group(0), line.strip()))
    return hits


# --- 引用解析 -------------------------------------------------------------------------------

#: pandoc citekey：`[@smith2024; @lee2023, p. 4]` 里的每个 `@key`，以及叙述式 `@smith2024 shows`
CITEKEY_RE = re.compile(r"(?<![\w.@/-])@([A-Za-z0-9_][A-Za-z0-9_:.#$%&+?<>~/-]*[A-Za-z0-9_])")
BIB_ENTRY_RE = re.compile(r"^\s*@(?!comment|string|preamble)\w+\s*\{\s*([^,\s]+)\s*,", re.I | re.M)


def citekeys_in(lines: list[tuple[int, str]]) -> dict[str, int]:
    """正文里出现的 citekey → 首次出现的行号。"""
    found: dict[str, int] = {}
    for number, line in lines:
        for match in CITEKEY_RE.finditer(line):
            found.setdefault(match.group(1), number)
    return found


def bib_keys(text: str) -> list[str]:
    return BIB_ENTRY_RE.findall(text)


#: 顺序编码制（GB/T 7714 / IEEE）行内引用：[1]、[2-4]、[1, 3–5]、[1，3]
NUMERIC_CITE_RE = re.compile(r"\[(\d+(?:\s*[-–—,，]\s*\d+)*)\](?!\()")
#: 文献表条目：`[1] …`，或 Markdown 有序列表 `1. …` / `1) …`
NUMERIC_ENTRY_RE = re.compile(r"^\s*(?:[-*]\s*)?(?:\[(\d+)\]|(\d+)[.)、]\s)")
#: 全角方括号与 Markdown 转义方括号在比对前统一成 ASCII
_BRACKETS = str.maketrans({"［": "[", "］": "]"})
#: 作者-年份制的姓氏与年份（可带 a/b 消歧后缀）。拉丁姓氏含变音字母（Müller、Çelik）；
#: 中文姓名取最短匹配，「张伟等, 2020」的键是「张伟」而不是「张伟等」。
_LATIN = r"[A-ZÀ-ÖØ-ÞĀ-Ž][A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’\-]+"
_SURNAME = rf"{_LATIN}|[一-鿿]{{1,4}}?"
_YEAR = r"\d{4}[a-z]?"
_YEARS = rf"{_YEAR}(?:\s*[,，]\s*{_YEAR})*"
_PARTICLES = r"(?:(?:van|von|de|der|den|la|le|da|di)\s+)*"
APA_PART_RE = re.compile(
    rf"^(?:(?:e\.g\.|see|cf\.|i\.e\.)[,\s]+)?{_PARTICLES}({_SURNAME})"
    rf"(?:\s+et al\.?|\s+(?:and|&)\s+(?:{_SURNAME})|\s*(?:、|和|等)\s*(?:{_SURNAME})?)?\s*[,，]?\s*({_YEARS})"
    rf"(?:\s*[,，]\s*(?:p|pp)\.\s*[\d\-–]+)?$"
)
#: 叙述式只认拉丁姓氏：中文没有词边界，「研究表明张伟（2020）」切不出姓名——中文稿用 GB/T 顺序编码制。
#: 边界只认 ASCII（\w 含汉字，「根据Smith (2020)」用 \w 作边界会漏检）。
APA_NARRATIVE_RE = re.compile(
    rf"(?<![A-Za-z0-9_(]){_PARTICLES}({_LATIN})(?:\s+et al\.?|\s+(?:and|&)\s+(?:{_LATIN}))?\s*[(（]({_YEARS})[)）]"
)
APA_ENTRY_RE = re.compile(
    rf"^\s*(?:[-*]\s*|\d+[.)]\s*)?{_PARTICLES}({_SURNAME})\s*[,，.].*?[(（]({_YEAR})[^)）]*[)）]"
)


def normalize_brackets(lines: list[tuple[int, str]]) -> list[tuple[int, str]]:
    return [(n, line.translate(_BRACKETS).replace(r"\[", "[").replace(r"\]", "]")) for n, line in lines]


def expand_numeric(group: str) -> list[int]:
    """'1, 3-5' → [1, 3, 4, 5]。倒序区间（5-3）原样当作两个端点，不静默吞掉。"""
    numbers: list[int] = []
    for piece in re.split(r"\s*[,，]\s*", group):
        bounds = [int(x) for x in re.split(r"\s*[-–—]\s*", piece) if x]
        if len(bounds) == 2 and bounds[0] <= bounds[1]:
            numbers.extend(range(bounds[0], bounds[1] + 1))
        else:
            numbers.extend(bounds)
    return numbers


def numeric_citations(lines: list[tuple[int, str]]) -> dict[str, int]:
    found: dict[str, int] = {}
    for number, line in lines:
        for match in NUMERIC_CITE_RE.finditer(line):
            for value in expand_numeric(match.group(1)):
                found.setdefault(str(value), number)
    return found


def numeric_entries(lines: list[tuple[int, str]]) -> dict[str, str]:
    return {
        m.group(1) or m.group(2): f"line {n}"
        for n, line in lines
        if (m := NUMERIC_ENTRY_RE.match(line))
    }


def apa_key(surname: str, year: str) -> str:
    return f"{surname.lower()}, {year}"


def apa_citations(lines: list[tuple[int, str]]) -> dict[str, int]:
    """(Smith, 2024)、(Smith & Lee, 2024; Wang et al., 2023a)、Smith et al. (2024) → 'smith, 2024'。"""
    found: dict[str, int] = {}
    for number, line in lines:
        for group in re.findall(r"[(（]([^()（）]*\d{4}[a-z]?[^()（）]*)[)）]", line):
            for part in re.split(r"\s*[;；]\s*", group.strip()):
                if match := APA_PART_RE.match(part.strip()):
                    for year in re.findall(_YEAR, match.group(2)):  # (Smith, 2020, 2022) 是两条
                        found.setdefault(apa_key(match.group(1), year), number)
        for match in APA_NARRATIVE_RE.finditer(line):
            for year in re.findall(_YEAR, match.group(2)):
                found.setdefault(apa_key(match.group(1), year), number)
    return found


def apa_entries(lines: list[tuple[int, str]]) -> dict[str, str]:
    return {apa_key(*m.groups()): f"line {n}" for n, line in lines if (m := APA_ENTRY_RE.match(line))}


def reconcile(cited: dict[str, int], listed: dict[str, str], where: str, listing: str) -> list[Finding]:
    """引用 ↔ 文献表双向对账。cited: key→行号；listed: key→位置描述。"""
    findings = [
        Finding("citation-without-entry", f"{where}:{line}", f"{key} has no entry in {listing}")
        for key, line in sorted(cited.items(), key=lambda item: item[1])
        if key not in listed
    ]
    findings += [
        Finding("entry-never-cited", position, f"{key} is listed but never cited in the text")
        for key, position in listed.items()
        if key not in cited
    ]
    return findings


# --- 数字对账 -------------------------------------------------------------------------------

#: 结果型数字：小数、百分数、样本量 n=/N=。整数年份、章节号、Table 1 不在此列。
#: 边界只认 ASCII——Python 的 \w 包含汉字，`AUC为0.912` 用 \w 作边界会整句漏检。
#: 小数与百分数后面可以紧跟单位（`12.5ms`、`2.5x`、`95%CI`），只排除再接数字的版本号
#: `2.0.1`；APA 省略前导零的 `r = .85`、`p < .001` 同样计入；中文输入法的全角 `％`、`＝` 与半角同等对待。
METRIC_RE = re.compile(
    r"(?<![A-Za-z0-9_.])(?:[nN]\s*[=＝]\s*(\d[\d,]*)(?![A-Za-z0-9_])|(\d+(?:\.\d+)?)\s*[%％]"
    r"|(\d*\.\d+)(?![0-9_]|\.\d))"
)
#: 只剥离「不是结果数字」的东西：旗标、引文、URL/DOI、行内代码。方括号里的置信区间
#: `[95% CI 0.71, 0.80]` 与链接文字 `[AUC 0.93](fig.png)` 仍要对账。
_STRIP_INLINE = (
    re.compile(r"\[(?:PENDING|UNVERIFIED)[^\]]*\]"),  # [PENDING: 0.91] 是已披露的待补数字
    re.compile(r"\[[^\]]*@[^\]]*\]"),  # [@smith2024; @lee2023, p. 4]
    re.compile(r"\[\d+(?:\s*[-–—,，]\s*\d+)*\]"),  # [1]、[2-4]
    re.compile(r"\]\([^)]*\)"),  # 链接目标，保留链接文字
    re.compile(r"https?://\S+"),
    re.compile(r"\b(?:doi:\s*)?10\.\d{4,9}/\S+", re.I),
    re.compile(r"`[^`]*`"),
)
#: 文献表/账本里的数字：千分位 1,204 是一个数，不是 1 和 204
NUMBER_RE = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.\d+|\d+")  # 台账里的 `.85` 与正文同样读作 0.85


def normalize_number(raw: str) -> str:
    value = raw.replace(",", "")
    if value.startswith("."):
        value = "0" + value
    if "." in value:
        value = value.rstrip("0").rstrip(".") or "0"
    return value


def metric_numbers(lines: list[tuple[int, str]]) -> list[tuple[int, str, str]]:
    """正文里的结果型数字 → (行号, 原文, 规范化值)。标题行不计。"""
    found: list[tuple[int, str, str]] = []
    for number, line in lines:
        if HEADING_RE.match(line):
            continue
        cleaned = line
        for pattern in _STRIP_INLINE:
            cleaned = pattern.sub(" ", cleaned)
        for match in METRIC_RE.finditer(cleaned):
            raw = next(group for group in match.groups() if group)
            found.append((number, match.group(0).strip(), normalize_number(raw)))
    return found


def ledger_numbers(path: Path, columns: tuple[str, ...]) -> set[str]:
    values: set[str] = set()
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [column for column in columns[:1] if column not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path.name} has no '{missing[0]}' column")
        for row in reader:
            for column in columns:
                for raw in NUMBER_RE.findall(row.get(column) or ""):
                    values.add(normalize_number(raw))
    return values


# --- 报告 -----------------------------------------------------------------------------------


def finish(findings: list[Finding], warnings: list[Finding], gate: str) -> int:
    for item in warnings:
        print(item.render("WARN"))
    for item in findings:
        print(item.render("FAIL"))
    if findings:
        print(f"{gate}: FAIL ({len(findings)} finding(s), {len(warnings)} warning(s))")
        return EXIT_FINDINGS
    # 零命中只说明这些机械检查没发现问题，不说明文稿正确
    print(f"{gate}: no mechanical findings ({len(warnings)} warning(s)) — judgment items still apply")
    return EXIT_CLEAN


def usage_error(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return EXIT_USAGE
