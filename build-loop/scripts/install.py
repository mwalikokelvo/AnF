#!/usr/bin/env python3
"""Install everything build-loop takes up onto THIS machine, from sources.json.

Run this on the computer where you code (Windows Git Bash, macOS, or Linux) — it
does nothing useful in a cloud session. It registers the MCP servers (via the
`claude` CLI), installs the editor extensions (VS Code and/or Cursor, whichever
is on PATH), and lists the npm packages and the interactive plugin commands to
run by hand. Safe to re-run; it only adds.

    python3 install.py [--repo-dir DIR] [--manifest sources.json] [--dry-run]

--repo-dir fills the {REPO_DIR} placeholder in the git MCP server (default: cwd).
--dry-run prints every command without running it.
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent


def have(cmd):
    return shutil.which(cmd) is not None


def run(args, dry):
    print("  $ " + " ".join(args))
    if not dry:
        subprocess.run(args, check=False)


def resolve(args, repo_dir):
    home = os.path.expanduser("~")
    return [a.replace("{USER_HOME}", home).replace("{REPO_DIR}", repo_dir) for a in args]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--manifest", default=str(HERE.parent / "sources.json"))
    ap.add_argument("--repo-dir", default=os.getcwd())
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    m = json.loads(pathlib.Path(a.manifest).read_text(encoding="utf-8"))
    dry = a.dry_run

    print("== MCP servers ==")
    servers = m.get("mcp_servers", [])
    if have("claude"):
        for s in servers:
            run(["claude", "mcp", "add", "-s", "user", s["name"], "--", s["command"],
                 *resolve(s.get("args", []), a.repo_dir)], dry)
    else:
        print("  `claude` CLI not on PATH — paste this into ~/.claude/mcp_servers.json instead:")
        print(json.dumps({"mcpServers": {s["name"]: {"command": s["command"],
              "args": resolve(s.get("args", []), a.repo_dir)} for s in servers}}, indent=2))

    print("== Editor extensions ==")
    editors = [e for e in ("code", "cursor") if have(e)]
    exts = m.get("editor_extensions", [])
    if editors and exts:
        for ed in editors:
            for e in exts:
                run([ed, "--install-extension", e["id"]], dry)
    elif exts:
        print("  Neither `code` nor `cursor` on PATH. Install these in your editor:")
        for e in exts:
            print(f"    {e['name']}: {e['id']}")

    print("== npm packages (add to the project that needs them) ==")
    for p in m.get("packages", []):
        print(f"  {p['name']}  ({p.get('registry', 'npm')}) — {p.get('use', '')}")
        print(f"    cd <your project> && npm install {p['name']}")

    print("== Plugins (run these /plugin commands inside Claude Code) ==")
    for p in m.get("plugins", []):
        if p.get("marketplace"):
            print(f"  /plugin marketplace add {p['marketplace']}")
        print(f"  {p['install']}")

    print("\nDone." + ("  (dry run — nothing was executed)" if dry else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
