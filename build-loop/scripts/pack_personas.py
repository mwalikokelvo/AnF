"""Pack the agency-agents persona library into agents/<division>.md bundles.

    python3 pack_personas.py <agency_agents_clone> <agents_outdir>

Reads divisions.json and the per-division persona files from the clone, writes one
bundle per division into <agents_outdir>. Reproduces the committed bundles byte for
byte when the clone is unchanged. persona.py --export restores the originals.
"""
import json
import pathlib
import sys

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
labels = {k: v["label"] for k, v in json.loads((src / "divisions.json").read_text())["divisions"].items()}
seen = {}
total = 0
for div in sorted(labels):
    files = sorted((src / div).rglob("*.md"))
    parts = [
        f"# {labels[div]} specialists ({len(files)})\n\n"
        "Bundled unchanged from agency-agents (MIT, https://github.com/msitarzewski/agency-agents); "
        "one persona per block below. Find ids in `agents/ROSTER.md`, read one with "
        "`python3 scripts/persona.py <id>`, or restore the original files with "
        "`python3 scripts/persona.py --export <dir> --division " + div + "`.\n\n"
    ]
    for f in files:
        if f.stem in seen:
            sys.exit(f"duplicate id {f.stem}: {seen[f.stem]} and {f}")
        rel = f.relative_to(src).as_posix()
        seen[f.stem] = rel
        body = f.read_bytes().decode("utf-8")
        if "<!-- persona:" in body or "<!-- /persona -->" in body:
            sys.exit(f"persona marker collision in {rel} — refusing to write an ambiguous bundle "
                     "that persona.py --export could not restore byte-for-byte")
        parts.append(f"<!-- persona: {f.stem} | source: {rel} -->\n{body}\n<!-- /persona -->\n\n")
    (out / f"{div}.md").write_bytes("".join(parts).encode("utf-8"))
    total += len(files)
print("packed", total, "personas into", len(labels), "bundles")
