#!/usr/bin/env python3
"""Read specialist personas out of build-loop's bundled roster. Standard library only.

The 283 agency-agents personas ship as one file per division (agents/<division>.md)
so the skill stays under the skill-upload file limit. This tool gets them back out.

    python3 persona.py engineering-desktop-app-engineer           # print one persona
    python3 persona.py --list                                     # every id, by division
    python3 persona.py --list --division engineering,testing
    python3 persona.py --export ~/.claude/agents --division engineering,testing
    python3 persona.py --export ./agents-out                      # all 283, original file names

--export writes each persona as <id>.md, byte for byte as published upstream, which is
the layout Claude Code reads from ~/.claude/agents/ or <project>/.claude/agents/.
It never overwrites an existing file unless you pass --force.
"""

import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.join(os.path.dirname(HERE), "agents")
START = re.compile(r"^<!-- persona: (?P<id>[A-Za-z0-9._-]+) \| source: (?P<src>[^ ]+) -->\n", re.M)
END = "\n<!-- /persona -->\n"


def bundles(agents_dir, divisions=None):
    for name in sorted(os.listdir(agents_dir)):
        if not name.endswith(".md") or name == "ROSTER.md":
            continue
        div = name[:-3]
        if divisions and div not in divisions:
            continue
        yield div, os.path.join(agents_dir, name)


def personas(path):
    """Yield (id, source path, exact original text) for every persona in a bundle."""
    with open(path, encoding="utf-8", newline="") as fh:
        text = fh.read()
    for m in START.finditer(text):
        end = text.find(END, m.end())
        if end < 0:
            raise ValueError("%s: persona %s has no closing marker" % (path, m.group("id")))
        yield m.group("id"), m.group("src"), text[m.end():end]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("id", nargs="?", help="persona id, e.g. engineering-desktop-app-engineer")
    ap.add_argument("--dir", default=DEFAULT_DIR, help="folder holding the division bundles")
    ap.add_argument("--division", help="comma-separated divisions to limit --list/--export")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--export", metavar="DIR", help="write original <id>.md files here")
    ap.add_argument("--force", action="store_true", help="let --export overwrite files")
    args = ap.parse_args(argv)
    divs = {d.strip() for d in args.division.split(",")} if args.division else None

    try:
        found = [(div, pid, src, body)
                 for div, path in bundles(args.dir, divs)
                 for pid, src, body in personas(path)]
    except (OSError, ValueError) as exc:
        print("persona: %s" % exc, file=sys.stderr)
        return 2
    if divs and not found:
        print("persona: no division named %s" % ", ".join(sorted(divs)), file=sys.stderr)
        return 2

    if args.list:
        current = None
        for div, pid, _src, _body in found:
            if div != current:
                print("%s:" % div)
                current = div
            print("  %s" % pid)
        return 0

    if args.export:
        out = os.path.expanduser(args.export)
        os.makedirs(out, exist_ok=True)
        written = skipped = 0
        for _div, pid, _src, body in found:
            target = os.path.join(out, pid + ".md")
            if os.path.exists(target) and not args.force:
                skipped += 1
                continue
            with open(target, "w", encoding="utf-8", newline="") as fh:
                fh.write(body)
            written += 1
        print("wrote %d persona files to %s%s" % (
            written, out, ", skipped %d that already exist (use --force)" % skipped if skipped else ""))
        return 0

    if not args.id:
        ap.print_help()
        return 2
    for _div, pid, _src, body in found:
        if pid == args.id:
            sys.stdout.write(body)
            return 0
    print("persona: no persona with id %r. Try --list, or search agents/ROSTER.md." % args.id,
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
