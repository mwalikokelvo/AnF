#!/usr/bin/env python3
"""Refresh build-loop's bundled skills from their upstreams (manifest-driven).

Reads sources.json, clones each source at latest (auto-adopt), regenerates the
vendor bundles, persona bundles, CATALOG/LICENSES/ROSTER, verifies every bundled
file still round-trips byte-for-byte, repackages build-loop.skill, checks the
skill limits, records which sources changed, and writes a JSON report. It never
touches git and never contacts the network except to clone/fetch the sources.

The weekly scheduled session wraps this: it scans the changed sources for malware
BEFORE committing, and discards the run (keeping last-good) on a bad verdict.

    python3 update.py --repo <build-loop dir> [--latest|--pin] [--use-src DIR]
                      [--work DIR] [--skill-out FILE] [--report FILE] [--keep-clones]

--latest  (default) clone each source's default-branch HEAD and adopt it.
--pin     clone the commit recorded in sources.json (used to prove reproducibility).
--use-src DIR  reuse existing clones under DIR/<repo-basename> instead of cloning.
Standard library only.
"""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
START = re.compile(r"^<!-- vendor-file: (?P<path>[^\n]+?) -->\n", re.M)
END = "\n<!-- /vendor-file -->\n"
EXCLUDE_DIRS = {"__pycache__", "node_modules", ".git", ".bl-update-work"}
EXCLUDE_GLOBS = (".pyc",)
ROOT_EXCLUDE_DIRS = {"evals"}


def sh(args, cwd=None):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(args)}\n{r.stderr.strip()}")
    return r.stdout.strip()


def repodir(url):
    return url.rstrip("/").rsplit("/", 1)[-1]


def owner_repo(url):
    parts = url.rstrip("/").split("/")
    return f"{parts[-2]}/{parts[-1]}"


def obtain(url, dest, commit, mode, use_src):
    """Put the source where it can be read and return its full HEAD commit and path."""
    if use_src:
        src = pathlib.Path(use_src) / repodir(url)
        if not src.exists():
            raise RuntimeError(f"--use-src given but {src} missing")
        return sh(["git", "-C", str(src), "rev-parse", "HEAD"]), src
    if dest.exists():
        import shutil
        shutil.rmtree(dest)
    if mode == "pin" and commit:
        sh(["git", "clone", "--quiet", url, str(dest)])
        sh(["git", "-C", str(dest), "checkout", "--quiet", commit])
    else:
        sh(["git", "clone", "--quiet", "--depth", "1", url, str(dest)])
    return sh(["git", "-C", str(dest), "rev-parse", "HEAD"]), dest


def roundtrip(repo, manifest, srcroot):
    """Every file in every vendor bundle must equal its upstream original, byte for byte."""
    compared = diffs = 0
    bad = []
    for s in manifest["vendor"]:
        bundle = repo / "vendor" / f"{s['name']}.md"
        base = pathlib.Path(srcroot) / repodir(s["url"]) / s["root"]
        prefix = s.get("prefix", "")
        text = bundle.read_text(encoding="utf-8", newline="")
        for m in START.finditer(text):
            end = text.find(END, m.end())
            rel = m.group("path")
            body = text[m.end():end]
            orig = base / rel[len(prefix):]
            compared += 1
            if not orig.exists() or orig.read_bytes() != body.encode("utf-8"):
                diffs += 1
                bad.append(f"{s['name']}:{rel}")
    # Persona bundles too — same byte-for-byte guarantee, so a marker collision or corruption is caught.
    pers = manifest["personas"]
    clone = pathlib.Path(srcroot) / repodir(pers["url"])
    pstart = re.compile(r"^<!-- persona: [^|]+ \| source: (?P<src>[^ ]+) -->\n", re.M)
    for bundle in sorted((repo / "agents").glob("*.md")):
        if bundle.name == "ROSTER.md":
            continue
        btext = bundle.read_text(encoding="utf-8", newline="")
        for m in pstart.finditer(btext):
            end = btext.find("\n<!-- /persona -->\n", m.end())
            body = btext[m.end():end]
            orig = clone / m.group("src")
            compared += 1
            if not orig.exists() or orig.read_bytes() != body.encode("utf-8"):
                diffs += 1
                bad.append("persona:" + m.group("src"))
    return {"compared": compared, "differing": diffs, "diffs": bad[:20]}


def package(repo, out):
    files = bytes_total = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, names in os.walk(repo):
            rel_root = pathlib.Path(root).relative_to(repo)
            top = rel_root.parts[0] if rel_root.parts else ""
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS
                       and not (rel_root == pathlib.Path(".") and d in ROOT_EXCLUDE_DIRS)]
            if top in ROOT_EXCLUDE_DIRS:
                continue
            for n in names:
                if (n.endswith(EXCLUDE_GLOBS) or n == ".DS_Store" or n.endswith(".skill")
                        or n == "build-loop-update-report.json"):
                    continue
                p = pathlib.Path(root) / n
                arc = pathlib.Path(repo.name) / p.relative_to(repo)
                z.write(p, arc.as_posix())
                files += 1
                bytes_total += p.stat().st_size
    return files, bytes_total


def description_len(repo):
    fm = re.match(r"---\n(.*?)\n---", (repo / "SKILL.md").read_text(encoding="utf-8"), re.S).group(1)
    m = re.search(r"^description:\s*(.+)$", fm, re.M)
    return len(m.group(1).strip()) if m else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--repo", default=str(HERE))
    ap.add_argument("--work", default=None)
    ap.add_argument("--use-src", default=None)
    ap.add_argument("--pin", action="store_true")
    ap.add_argument("--latest", action="store_true")
    ap.add_argument("--keep-clones", action="store_true")
    ap.add_argument("--skill-out", default=None)
    ap.add_argument("--report", default=None)
    ap.add_argument("--write-manifest", dest="write_manifest", action="store_true",
                    help="rewrite sources.json commits to the adopted ones (default on --latest)")
    args = ap.parse_args(argv)

    repo = pathlib.Path(args.repo).resolve()
    work = pathlib.Path(args.work).resolve() if args.work else repo / ".bl-update-work"
    work.mkdir(parents=True, exist_ok=True)
    mode = "pin" if args.pin else "latest"
    manifest_path = repo / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    report = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "mode": mode, "changed": [], "unchanged": [], "adapted_flags": [], "errors": []}
    srcroot = args.use_src or str(work)

    for s in manifest["vendor"]:
        try:
            head, _ = obtain(s["url"], work / repodir(s["url"]), s.get("commit"), mode, args.use_src)
            s["_new"] = head
            if head != s.get("commit"):
                report["changed"].append({"name": s["name"], "owner_repo": owner_repo(s["url"]),
                                          "old": s.get("commit"), "new": head})
            else:
                report["unchanged"].append(s["name"])
        except Exception as e:
            report["errors"].append(f"{s['name']}: {e}")
            s["_new"] = s.get("commit")
    pers = manifest["personas"]
    try:
        phead, _ = obtain(pers["url"], work / repodir(pers["url"]), pers.get("commit"), mode, args.use_src)
        pers["_new"] = phead
        if phead != pers.get("commit"):
            report["changed"].append({"name": pers["name"], "owner_repo": owner_repo(pers["url"]),
                                      "old": pers.get("commit"), "new": phead})
        else:
            report["unchanged"].append(pers["name"])
    except Exception as e:
        report["errors"].append(f"{pers['name']}: {e}")
        pers["_new"] = pers.get("commit")

    scripts = repo / "scripts"
    try:
        sh([sys.executable, str(scripts / "pack_vendor.py"), srcroot, str(repo / "vendor"), str(manifest_path)])
        sh([sys.executable, str(scripts / "make_licenses.py"), srcroot, str(repo / "vendor"), str(manifest_path)])
        clone_pers = pathlib.Path(srcroot) / repodir(pers["url"])
        sh([sys.executable, str(scripts / "pack_personas.py"), str(clone_pers), str(repo / "agents")])
        sh([sys.executable, str(scripts / "make_roster.py"), str(clone_pers), str(repo / "agents")])
    except Exception as e:
        report["errors"].append(f"regenerate: {e}")

    for a in manifest.get("adapted", []):
        try:
            ls = sh(["git", "ls-remote", a["url"], "HEAD"]).split()[0]
            if ls != a.get("commit"):
                report["adapted_flags"].append({"name": a["name"], "url": a["url"],
                                                "old": a.get("commit"), "new": ls})
                a["_new"] = ls
        except Exception as e:
            report["errors"].append(f"{a['name']} ls-remote: {e}")

    report["roundtrip"] = roundtrip(repo, manifest, srcroot)

    # Persist adopted commits BEFORE packaging, so the archived sources.json matches the bundles it
    # ships with (extract + --pin then reproduces exactly what was packaged). Adapted sources are
    # never auto-advanced — their recorded commit stays until a human completes the manual re-condense.
    if args.write_manifest or (mode == "latest" and not args.pin):
        for s in manifest["vendor"]:
            s["commit"] = s.pop("_new", s.get("commit"))
        pers["commit"] = pers.pop("_new", pers.get("commit"))
        for a in manifest.get("adapted", []):
            a.pop("_new", None)
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        for s in manifest["vendor"]:
            s.pop("_new", None)
        pers.pop("_new", None)
        for a in manifest.get("adapted", []):
            a.pop("_new", None)

    skill_out = pathlib.Path(args.skill_out) if args.skill_out else repo / "build-loop.skill"
    files, total = package(repo, skill_out)
    lim = manifest["skill"]["limits"]
    desc = description_len(repo)
    report["limits"] = {
        "files": files, "max_files": lim["max_files"],
        "bytes": total, "max_bytes": lim["max_bytes"],
        "description": desc, "max_description": lim["max_description"],
        "over": files > lim["max_files"] or total > lim["max_bytes"] or desc > lim["max_description"],
        "near": files >= lim["max_files"] - 10 or total >= lim["max_bytes"] * 0.9,
    }
    report["package"] = str(skill_out)

    if not args.keep_clones and not args.use_src:
        import shutil
        shutil.rmtree(work, ignore_errors=True)

    report_path = pathlib.Path(args.report) if args.report else repo / "build-loop-update-report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    changed_names = [c["name"] if isinstance(c, dict) else c for c in report["changed"]]
    print(f"changed: {changed_names or 'none'}")
    print(f"adapted flagged: {[a['name'] for a in report['adapted_flags']] or 'none'}")
    print(f"round-trip: compared {report['roundtrip']['compared']}, differing {report['roundtrip']['differing']}")
    print(f"limits: {files}/{lim['max_files']} files, {total} bytes, desc {desc}/{lim['max_description']}"
          f" {'OVER' if report['limits']['over'] else 'NEAR' if report['limits']['near'] else 'ok'}")
    print(f"package: {skill_out}")
    print(f"report: {report_path}")
    if report["errors"]:
        print("ERRORS:", *report["errors"], sep="\n  ")
    return 1 if report["errors"] or report["roundtrip"]["differing"] or report["limits"]["over"] else 0


if __name__ == "__main__":
    sys.exit(main())
