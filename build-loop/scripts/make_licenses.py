"""Write vendor/LICENSES.md from the manifest and the upstream licence files.

    python3 make_licenses.py <srcdir> <vendor_outdir> <sources.json>

Driven by the `vendor` list in sources.json: the table and the quoted licence
blocks are generated from each source's metadata, so a skill added to the
manifest is attributed automatically. Every vendor entry must carry a
`licence_file` (a path under <srcdir>, quoted verbatim) or a `licence_note`
(explaining where its licence lives) — update fails loudly otherwise, so a new
source can't be distributed without attribution.
"""
import json
import pathlib
import sys

SRC = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
vendors = json.loads(pathlib.Path(sys.argv[3]).read_text(encoding="utf-8"))["vendor"]

missing = [v["name"] for v in vendors if not v.get("licence_file") and not v.get("licence_note")]
if missing:
    sys.exit("make_licenses: no licence_file or licence_note in sources.json for: " + ", ".join(missing))


def quote(path):
    return "```text\n" + (SRC / path).read_text(encoding="utf-8").strip("\n") + "\n```\n"


rows = [f"| `{v['name']}.md` | {v['url'].split('://', 1)[-1]} | {v['licence']} | {v.get('copyright', '')} |"
        for v in vendors]

parts = [
    "# Licences for the bundled skills\n",
    "The files in `vendor/` are third-party skills, bundled unchanged. Each keeps its own licence, reproduced here "
    "from the upstream repository. Anything you export with `scripts/vendor.py --export` stays under these terms. "
    "This file is generated from `sources.json` by `scripts/make_licenses.py`.\n",
    "| bundle | upstream | licence | copyright |\n|---|---|---|---|\n" + "\n".join(rows) + "\n",
    "Not bundled: the `docx`, `pdf`, `pptx` and `xlsx` skills from anthropics/skills, whose licence reserves all rights "
    "(they are already built into Claude), and binary files (fonts, a sample PDF, a .gz archive) listed in each bundle's header. "
    "From `rea`, only the agent skill folder is bundled; REA's own code and its third-party components are not, so its "
    "THIRD_PARTY_NOTICES do not apply here.\n",
    "Changes: none to file contents. Files were concatenated into one Markdown file per source, wrapped in "
    "`<!-- vendor-file: path -->` markers; `scripts/vendor.py --export` restores them byte for byte.\n",
]
for v in vendors:
    heading = f"## {v['licence']} — {v['name']}"
    if v.get("licence_file"):
        parts.append(f"{heading}\n\n" + quote(v["licence_file"]))
    else:
        parts.append(f"{heading}\n\n{v['licence_note']}\n")
(out / "LICENSES.md").write_text("\n".join(parts), encoding="utf-8")
print("wrote", out / "LICENSES.md")
