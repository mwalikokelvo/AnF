"""试跑（``--limit``）取哪 N 条。

``head`` 取语料前 N 条——最先被采集、也最典型的记录。撑爆人工队列的永远是尾部那些
边缘记录（滚雪球与会议录追加的都排在尾部），所以前缀样本会系统性低估队列率：
实测前缀报 9%，同分布随机样本 18%（learnings/2026-09-21-前缀不是抽样.md）。
校准任务设计要用 ``random``：固定种子的无放回抽样，同一种子总是同一批记录。
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import TypeVar

SAMPLE_METHODS = ("head", "random")

T = TypeVar("T")


class SampleError(ValueError):
    pass


def select_trial(records: Sequence[T], limit: int | None, method: str, seed: int) -> list[T]:
    """按 ``method`` 从 ``records`` 取至多 ``limit`` 条；保持语料原有顺序。"""
    if method not in SAMPLE_METHODS:
        raise SampleError(f"--sample 只接受 {' / '.join(SAMPLE_METHODS)}，收到 {method!r}")
    if not limit:
        if method == "random":
            # 没有 --limit 就是全量，「随机抽全部」没有意义，更可能是忘了写 --limit
            raise SampleError("--sample random 必须配合 --limit N 使用")
        return list(records)
    if method == "head" or limit >= len(records):
        return list(records[:limit])
    chosen = sorted(random.Random(seed).sample(range(len(records)), limit))
    return [records[index] for index in chosen]


def sample_parameters(limit: int | None, method: str, seed: int, size: int) -> dict[str, object]:
    """写进试跑轮次 parameters 的抽样说明——全量轮次不记。"""
    if not limit:
        return {}
    detail: dict[str, object] = {"method": method, "size": size}
    if method == "random":
        detail["seed"] = seed
    return {"sample": detail}
