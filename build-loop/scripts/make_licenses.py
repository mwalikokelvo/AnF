"""Write vendor/LICENSES.md from the upstream licence and NOTICE files.

    python3 make_licenses.py <srcdir> <vendor_outdir>

<srcdir> holds the cloned repos (reverse-api-engineer, rea, fish-audio-plugin,
strix, claude-mem) by their repo-basename. Reproduces the committed LICENSES.md
byte for byte when the upstream licence files are unchanged.
"""
import pathlib
import sys

SRC = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])


def block(path):
    return "```text\n" + (SRC / path).read_text(encoding="utf-8").strip("\n") + "\n```\n"


parts = [
    "# Licences for the bundled skills\n",
    "The files in `vendor/` are third-party skills, bundled unchanged. Each keeps its own licence, reproduced here "
    "from the upstream repository. Anything you export with `scripts/vendor.py --export` stays under these terms.\n",
    "| bundle | upstream | licence | copyright |\n|---|---|---|---|\n"
    "| `reverse-api-engineer.md` | github.com/kalil0321/reverse-api-engineer | MIT | 2025 kalil0321 |\n"
    "| `rea.md` | github.com/morluto/rea | MIT | 2026 morluto |\n"
    "| `fish-audio.md` | github.com/fishaudio/fish-audio-plugin | MIT | 2026 Fish Audio |\n"
    "| `strix.md` | github.com/usestrix/strix | Apache-2.0 | 2025 OmniSecure Inc. |\n"
    "| `claude-mem.md` | github.com/thedotmack/claude-mem | Apache-2.0 | 2026 Alex Newman (NOTICE below) |\n"
    "| `anthropic-skills.md` | github.com/anthropics/skills | Apache-2.0, each skill's own `LICENSE.txt` is bundled with it | Anthropic, PBC |\n",
    "Not bundled: the `docx`, `pdf`, `pptx` and `xlsx` skills from anthropics/skills, whose licence reserves all rights "
    "(they are already built into Claude), and binary files (fonts, a sample PDF, a .gz archive) listed in each bundle's header. "
    "From `rea`, only the agent skill folder is bundled; REA's own code and its third-party components are not, so its "
    "THIRD_PARTY_NOTICES do not apply here.\n",
    "Changes: none to file contents. Files were concatenated into one Markdown file per source, wrapped in "
    "`<!-- vendor-file: path -->` markers; `scripts/vendor.py --export` restores them byte for byte.\n",
    "## MIT — reverse-api-engineer\n", block("reverse-api-engineer/LICENSE"),
    "## MIT — rea\n", block("rea/LICENSE"),
    "## MIT — fish-audio-plugin\n", block("fish-audio-plugin/LICENSE"),
    "## NOTICE — claude-mem\n", block("claude-mem/NOTICE"),
    "## Apache License 2.0 — strix (also the licence text for claude-mem and anthropics/skills)\n", block("strix/LICENSE"),
]
(out / "LICENSES.md").write_text("\n".join(parts), encoding="utf-8")
print("wrote", out / "LICENSES.md")
