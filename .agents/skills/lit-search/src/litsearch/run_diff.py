"""两次 run 之间的语料与判定差异——更新型综述（updated review）的地基。

检索是一次性快照；SLR 更新、开题后的年度进展、proposal 维护都要回答同一个
问题：「自上一次快照以来，语料变了什么、哪些人工裁定可以结转」。协议指纹
纪律（改窗口=新协议=新 run）使得**重开 run** 是正确姿势，而本模块让新 run
不必从零人筛：旧 run 的人工裁定按 key（DOI/标题派生、跨 run 稳定）过滤到
新语料仍存在的记录上，产出 `lit adjudicate` 可直接导入的 CSV。

机器裁定（判定器 triage）**不**结转——那是两个模型族当时的临时判断，
不是终审；只搬 `adjudicated_by` 非空的记录。
"""

from __future__ import annotations

import csv
import io
from pathlib import Path

from litsearch.run import Run


def load_corpus_keys(run_dir: Run) -> dict[str, dict]:
    """key → 记录（只留对账要用的字段，语料可能上万条）。"""
    return {row["key"]: row for row in run_dir.read_jsonl("corpus.jsonl")}


def corpus_diff(old: dict[str, dict], new: dict[str, dict]) -> dict[str, list[dict]]:
    """按 key 对账两次语料：新增 / 消失 / 仍在。"""
    added = [new[key] for key in sorted(new.keys() - old.keys())]
    removed = [old[key] for key in sorted(old.keys() - new.keys())]
    kept = [new[key] for key in sorted(new.keys() & old.keys())]
    return {"added": added, "removed": removed, "kept": kept}


def render_diff_markdown(
    *,
    old_id: str,
    new_id: str,
    diff: dict[str, list[dict]],
    retracted_new: list[dict],
) -> str:
    """人读的差异报告。新增/消失各列前 200 条——全量在语料文件里，报告管结论。"""
    added, removed, kept = diff["added"], diff["removed"], diff["kept"]
    lines = [
        f"# 语料差异：`{old_id}` → `{new_id}`",
        "",
        "| 对账项 | 数量 |",
        "|---|---:|",
        f"| 仍在语料 | {len(kept):,} |",
        f"| **新增** | {len(added):,} |",
        f"| **消失** | {len(removed):,} |",
        "",
        "> key 由 DOI/标题派生，跨 run 稳定；「消失」通常是窗口前移或源侧变动，",
        "> 不是上次检索错了。消失记录若曾被纳入，更新报告需说明其退出原因。",
        "",
    ]

    def _section(title: str, rows: list[dict], limit: int = 200) -> None:
        lines.extend([f"## {title}（{len(rows):,}）", ""])
        if not rows:
            lines.extend(["_无。_", ""])
            return
        lines.extend(["| 标题 | DOI | 日期 |", "|---|---|---|"])
        for row in rows[:limit]:
            doi = row.get("identifiers", {}).get("doi") or "—"
            dates = row.get("dates") or {}
            date_text = next((v for v in dates.values() if v), "—")
            title = str(row.get("title", ""))[:110].replace("|", r"\|")
            lines.append(f"| {title} | `{doi}` | {date_text} |")
        if len(rows) > limit:
            lines.extend(["", f"_仅列前 {limit:,} 条，全量见 corpus.jsonl。_"])
        lines.append("")

    _section("新增", added)
    _section("消失", removed)
    if retracted_new:
        lines.extend(
            [
                f"## ⚠️ 新语料中已被撤稿（{len(retracted_new)}）",
                "",
                "OpenAlex 标记 retracted。更新综述时逐一核验，不要静默沿用旧纳入结论。",
                "",
            ]
        )
    return "\n".join(lines)


def carry_adjudications_csv(
    *, old_decisions: dict, new_corpus: dict[str, dict]
) -> str:
    """旧 run 的人工裁定 → 新语料仍存在记录上的 `lit adjudicate` 导入 CSV。

    只搬人工终审（adjudicated_by 非空）；机器 triage 判断不结转。
    列契约：record_key,decision,reviewer,reason（adjudicate.load_rows 的要求）。
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["record_key", "decision", "reviewer", "reason"])
    carried = 0
    for key, decision in sorted(old_decisions.items()):
        if key not in new_corpus:
            continue
        adjudicator = getattr(decision, "adjudicated_by", None)
        if not adjudicator:
            continue
        reason = getattr(decision, "adjudication_reason", None) or decision.reason
        writer.writerow(
            [key, decision.decision.value, adjudicator, f"结转自旧 run：{reason}"]
        )
        carried += 1
    if carried == 0:
        # 空数据行会让 adjudicate 拒绝导入；这里返回仅表头的 CSV 由调用方提示
        pass
    return buffer.getvalue()


def count_carriable(old_decisions: dict, new_corpus: dict[str, dict]) -> tuple[int, int]:
    """(可结转的人工裁定数, 旧 run 人工裁定总数)——给 CLI 提前报数。"""
    total = sum(1 for d in old_decisions.values() if getattr(d, "adjudicated_by", None))
    carriable = sum(
        1
        for key, d in old_decisions.items()
        if getattr(d, "adjudicated_by", None) and key in new_corpus
    )
    return carriable, total


def write_text_file(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
