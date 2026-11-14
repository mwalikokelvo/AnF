"""Bundle third-party skill folders into vendor/<source>.md + vendor/CATALOG.md.

Manifest-driven: reads the `vendor` list from sources.json and the cloned repos
from <srcdir>/<repo-basename>. Reproduces the exact bundle format vendor.py reads,
so an unchanged upstream regenerates byte for byte.

    python3 pack_vendor.py <srcdir> <vendor_outdir> <sources.json>
"""
import json
import pathlib
import re
import subprocess
import sys

SRC = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(sys.argv[2])
MANIFEST = json.loads(pathlib.Path(sys.argv[3]).read_text(encoding="utf-8"))


def repodir(url):
    return url.rstrip("/").rsplit("/", 1)[-1]


def is_text(p):
    data = p.read_bytes()
    if b"\0" in data[:8192]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def description(text):
    m = re.match(r"---\n(.*?)\n---", text, re.S)
    if not m:
        return ""
    fm = m.group(1).splitlines()
    for i, line in enumerate(fm):
        if line.startswith("description:"):
            val = line.split(":", 1)[1].strip()
            if val in (">", ">-", "|", "|-", ""):
                parts = []
                for nxt in fm[i + 1:]:
                    if nxt and not nxt.startswith((" ", "\t")):
                        break
                    parts.append(nxt.strip())
                val = " ".join(parts)
            val = re.sub(r"\s+", " ", val.strip().strip('"').strip("'")).replace("|", "/")
            return val if len(val) <= 170 else val[:169].rsplit(" ", 1)[0] + "…"
    return ""


catalog = ["# Bundled skills catalog", "",
           "Every third-party skill bundled into build-loop, unchanged. Print one with "
           "`python3 scripts/vendor.py <source> <path>`; restore originals with "
           "`python3 scripts/vendor.py --export <dir> [--source <source>] [--skill <folder>]`. "
           "When and how build-loop uses each is in `references/vendored-skills.md`. Licences: `vendor/LICENSES.md`.", ""]
grand = 0
adopted = {}
for s in MANIFEST["vendor"]:
    name, url, root, prefix = s["name"], s["url"], s["root"], s.get("prefix", "")
    excluded, lic = set(s.get("exclude", [])), s["licence"]
    repo = SRC / repodir(url)
    base = repo / root
    commit = subprocess.run(["git", "-C", str(repo), "rev-parse", "--short", "HEAD"],
                            capture_output=True, text=True).stdout.strip()
    adopted[name] = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                                   capture_output=True, text=True).stdout.strip()
    kept, skipped = [], []
    for p in sorted(x for x in base.rglob("*") if x.is_file()):
        rel = p.relative_to(base).as_posix()
        if rel.split("/", 1)[0] in excluded:
            skipped.append(rel + " (excluded)")
            continue
        text = is_text(p)
        if text is None:
            skipped.append(rel + " (binary)")
            continue
        if "<!-- vendor-file" in text or "<!-- /vendor-file" in text:
            sys.exit("marker clash in " + str(p))
        kept.append((prefix + rel, text))
    head = [f"# {name} (bundled skills)", "",
            f"Source: {url} at commit `{commit}`, path `{root}/`. Licence: {lic} (see `vendor/LICENSES.md`).",
            f"{len(kept)} files bundled unchanged. Read one with `python3 scripts/vendor.py {name} <path>`; "
            f"restore them with `python3 scripts/vendor.py --export <dir> --source {name}`.", ""]
    if skipped:
        head += ["Not bundled: " + ", ".join(f"`{s}`" for s in skipped), ""]
    body = "".join(f"<!-- vendor-file: {rel} -->\n{text}\n<!-- /vendor-file -->\n\n" for rel, text in kept)
    (OUT / f"{name}.md").write_text("\n".join(head) + "\n" + body, encoding="utf-8")
    grand += len(kept)
    rows = [(rel.rsplit("/SKILL.md", 1)[0], rel, description(t)) for rel, t in kept if rel.endswith("SKILL.md")]
    catalog += [f"## {name} — {len(rows)} skills ({lic})", "", "| skill | read | what it does |", "|---|---|---|"]
    catalog += [f"| `{s}` | `vendor.py {name} {r}` | {d} |" for s, r, d in rows]
    catalog.append("")
    print(f"{name}: {len(kept)} files bundled, {len(rows)} skills, {len(skipped)} skipped")
(OUT / "CATALOG.md").write_text("\n".join(catalog) + "\n", encoding="utf-8")
print("total files bundled:", grand)
# Emit adopted commits as JSON on the last line for update.py to capture.
print("ADOPTED " + json.dumps(adopted))
