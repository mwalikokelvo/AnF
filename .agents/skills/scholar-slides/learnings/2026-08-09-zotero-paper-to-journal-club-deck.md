# Zotero 论文 → 20 页组会 deck

## 问题

把 Zotero 里的一篇 Science Advances 论文（医学影像 + SHAP）做成 20 页 journal-club deck，数字、图、引用全部可追溯到原文。

## 方法：怎么拆的

1. **定位**：`zotero_search_items` 找条目 → `zotero_get_attachment_path` 拿本地 PDF 绝对路径。不要用 `zotero_get_item_fulltext` 喂给下游脚本，它有 token 上限且会截断。
2. **摄入**：`prepare_source.py <pdf>` 产出 `ingest.json` / `figures.json` / `figures/*.png` / `manifest.json`。
3. **读全文**：`ingest.json` 的 `full_text` 是**单行**长字符串，`Read` 的 offset/limit 用不上。用 python 按字符切成 9~11k 的小块落盘再逐块 Read，直到 100% 覆盖。
4. **digest**：手写 `digest.json`，每个字段带 `source_ref`（页码/图号）。取不到就写 `null` + `[MISSING]`，绝不猜。
5. **deck.json**：20 页 = 封面 / 议程 / 动机 / gap / 贡献 / 方法图 / 公式 / 队列 / 基线表 / 证据×3 / 主结果表 / 外部验证 / SHAP / 机理 / 个案 / 批判 / 结论 / 讨论 / 参考。
6. **渲染 + QA**：`build_deck.mjs` → `render_deck.mjs png|pdf` → `qa_report.mjs` → 六维美学评分写 `aesthetics_report.json` → `export_pptx.mjs` + `verify_pptx_parity.py`。

## 五个把我绊倒的坑

1. **强调语法不是 Markdown**。这套模板用 `==文本==`（metric）、`==k|文本==`（key）、`==p|…==`、`==w|…==`。我全篇写了 `**bold**`，结果星号原样打印在幻灯片上。改法见 `scripts/lib/emphasis.mjs`。**动手前先读 emphasis.mjs，别假设是 Markdown。**
2. **切子图前必须先看整图**。figure 3 是「A–D 小提琴图排成上排 + E（PCA）在下方」的**行**布局，我按**列**切成左右两半，导致两页各混进半张 PCA。渲染出来才发现。
3. **整图缩到一页 = 不可读**。15 面板的 figure 6 缩进一页后最小字号投影到 0.7px（QA 的 `figure-text-illegible` 会算出来）。解法：只切需要的面板；若两个面板分属上下行而版面是横的，用 PIL 把两块横向拼成一张（不改数据，引用里写明「两面板并置，均未改动」）。
4. **摘要里的数字可能是最优的那个**。本文摘要写外部 AUC = 0.806，那是 SMOTE 类别平衡后的值；原始外部队列是 0.763，NPV 更是从 0.297 才升到 0.707。批判页必须两个都列。同类信号：正文 P 值是四舍五入的（0.024），图注才是原始值（0.0245）——**以图注为准**。
5. **脚本参数容易记错**：`qa_report.mjs <deckDir> [sourceDir]` 要的是 **deck 目录**不是 deck.json；`export_pptx.mjs` 把 pptx 写在 **deck.json 同级**，不是 `deck/` 里。

## 判断取舍：什么故意没做

- **没有重画任何数据图**。全部用原文 bbox 裁剪 + 出处标注。重画有改动数据的风险，fidelity 优先于配色统一——代价是导入图的粉/蓝配色和 deck 的学术蓝对不上，美学评分 color 维度我诚实地封在 3 分。
- **slide 6（流程总览）的 space 维度接受 2 分**。它的职责是四阶段的整体形状，切成单面板就没有意义了；图里的数字我在讲者备注里全部复述。
- **slide 12 的表格上方空档没修**。那是 `results-table` 布局垂直居中造成的，改它要动 registered-layout，超出了布局锁的边界。
- **补充材料（figs S1–S4 / tables S1–S7）没拿到**，全部标 `[MISSING]` 留在页面上，而不是悄悄略过。

## 可复用规则

**渲染之前先证伪三件事：强调语法是什么、这张图是行布局还是列布局、这个数字是不是作者挑出来的最优版本。** 三件都便宜，任何一件错了都要推倒重来一遍全流程。

推论：**任何 QA 报的 P2「图太小/字不可读」都不是审美问题，是「你切错了图」的信号**——先回去看原图，不要靠放大解决。
