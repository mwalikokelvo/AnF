"""Generate agents/ROSTER.md from the agency-agents frontmatter.

    python3 make_roster.py <agency_agents_clone> <agents_outdir>

Personas and divisions.json come from the clone; the runbook index comes from
<agents_outdir>/strategy/runbooks.json (build-loop's own derivation). Writes
ROSTER.md into <agents_outdir>. Reproduces the committed ROSTER byte for byte when
the clone is unchanged.
"""
import json
import pathlib
import re
import sys

clone = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
divisions = json.loads((clone / "divisions.json").read_text())["divisions"]
runbooks = json.loads((out / "strategy" / "runbooks.json").read_text())["runbooks"]


def front(path):
    fm = re.match(r"---\n(.*?)\n---\n", path.read_text(encoding="utf-8"), re.S).group(1)
    get = lambda k: (re.search(rf"^{k}:\s*(.+)$", fm, re.M) or [None, ""])[1].strip().strip('"')
    return get("name"), get("description"), get("emoji")


def short(text, limit=150):
    text = re.sub(r"\s+", " ", text).replace("|", "/")
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


ids = {}
sections = []
total = 0
for div, meta in divisions.items():
    rows = []
    for f in sorted((clone / div).rglob("*.md")):
        name, desc, emoji = front(f)
        ids[f.stem] = f.relative_to(clone).as_posix()
        rows.append(f"| `{f.stem}` | {emoji} {name} | {short(desc)} |")
    total += len(rows)
    sections.append(f"## {meta['label']} ({len(rows)}) — `agents/{div}.md`\n\n| id | agent | use for |\n|---|---|---|\n" + "\n".join(rows))

missing = sorted({a for r in runbooks for g in r["roster"] for a in g["agents"] if a not in ids})

out_lines = [
    "# Specialist roster",
    "",
    f"{total} specialist personas from [agency-agents](https://github.com/msitarzewski/agency-agents) (MIT), generated from each file's frontmatter. "
    "Find the expert for a slice here, then print its persona with `python3 scripts/persona.py <id>` (each division is bundled in `agents/<division>.md`) and put it in the worker's brief — see `references/specialists.md` for how. "
    "The id is the file name without `.md`, the same id the runbooks use.",
    "",
    "## Team runbooks",
    "",
    "| runbook | mode, duration | team | doc |",
    "|---|---|---|---|",
]
for r in runbooks:
    n = sum(len(g["agents"]) for g in r["roster"])
    out_lines.append(f"| `{r['slug']}` {r['title']} | {r.get('mode','')}, {r.get('duration','')} | {n} agents | `agents/{r['doc']}` |")
out_lines += ["", "Rosters by group are in `agents/strategy/runbooks.json`.", ""]
if missing:
    out_lines += ["Runbook ids with no agent file here: " + ", ".join(f"`{m}`" for m in missing), ""]
out_lines += sections
(out / "ROSTER.md").write_text("\n".join(out_lines) + "\n", encoding="utf-8")
print("agents:", total, "| runbook ids missing:", missing)
