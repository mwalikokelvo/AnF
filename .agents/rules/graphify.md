---
trigger: always_on
description: Consult the graphify knowledge graph at graphify-out/ for codebase and architecture questions in AnF.
---

## Graphify in AnF

This project uses Graphify for codebase and architectural intelligence:
- For codebase or architecture questions, when `graphify-out/graph.json` exists, first run `graphify query "<question>"` (CLI). Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts.
- If `graphify-out/wiki/index.md` exists, navigate it before reading raw files.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, zero LLM API cost).
