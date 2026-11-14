#!/usr/bin/env python3
"""Read the third-party skills bundled into build-loop. Standard library only.

Each source's skills ship unchanged as one file, vendor/<source>.md, so the whole
umbrella stays under the skill-upload file limit. This tool gets them back out.

    python3 vendor.py --list                                  # sources and their files
    python3 vendor.py --list strix
    python3 vendor.py strix penetration-testing-with-strix/SKILL.md      # print one file
    python3 vendor.py --export ./restored                     # every source, original layout
    python3 vendor.py --export ~/.claude/skills --source strix --skill penetration-testing-with-strix

--export writes files byte for byte as published upstream, under <dir>/<path>. It never
overwrites an existing file unless you pass --force. Binary files (fonts, images, PDFs)
were not bundled; each bundle's header lists what was left out.
"""

import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.join(os.path.dirname(HERE), "vendor")
START = re.compile(r"^<!-- vendor-file: (?P<path>[^\n]+?) -->\n", re.M)
END = "\n<!-- /vendor-file -->\n"


def bundles(vendor_dir, source=None):
    for name in sorted(os.listdir(vendor_dir)):
        if not name.endswith(".md") or name in ("CATALOG.md", "LICENSES.md"):
            continue
        if source and name[:-3] != source:
            continue
        yield name[:-3], os.path.join(vendor_dir, name)


def files(path):
    """Yield (relative path, exact original text) for every file in a bundle."""
    with open(path, encoding="utf-8", newline="") as fh:
        text = fh.read()
    for m in START.finditer(text):
        end = text.find(END, m.end())
        if end < 0:
            raise ValueError("%s: %s has no closing marker" % (path, m.group("path")))
        yield m.group("path"), text[m.end():end]


def safe_target(root, rel):
    target = os.path.normpath(os.path.join(root, rel))
    if os.path.isabs(rel) or not target.startswith(os.path.normpath(root) + os.sep):
        raise ValueError("refusing path outside the export folder: %s" % rel)
    return target


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", nargs="?", help="bundle name, e.g. strix")
    ap.add_argument("path", nargs="?", help="file inside the bundle, e.g. some-skill/SKILL.md")
    ap.add_argument("--dir", default=DEFAULT_DIR, help="folder holding the bundles")
    ap.add_argument("--list", action="store_true", help="list sources and their files")
    ap.add_argument("--export", metavar="DIR", help="write the original files under DIR")
    ap.add_argument("--source", dest="only_source", help="limit --export to one source")
    ap.add_argument("--skill", help="limit --export to one top-level skill folder")
    ap.add_argument("--force", action="store_true", help="let --export overwrite files")
    args = ap.parse_args(argv)

    try:
        if args.list:
            for src, path in bundles(args.dir, args.source):
                entries = list(files(path))
                print("%s (%d files)" % (src, len(entries)))
                for rel, _ in entries:
                    print("  %s" % rel)
            return 0

        if args.export:
            out = os.path.expanduser(args.export)
            written = skipped = 0
            for src, path in bundles(args.dir, args.only_source):
                for rel, body in files(path):
                    if args.skill and rel.split("/", 1)[0] != args.skill:
                        continue
                    target = safe_target(out, rel)
                    if os.path.exists(target) and not args.force:
                        skipped += 1
                        continue
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with open(target, "w", encoding="utf-8", newline="") as fh:
                        fh.write(body)
                    written += 1
            print("wrote %d files to %s%s" % (
                written, out, ", skipped %d that already exist (use --force)" % skipped if skipped else ""))
            return 0 if written or skipped else 1

        if not (args.source and args.path):
            ap.print_help()
            return 2
        for _src, path in bundles(args.dir, args.source):
            for rel, body in files(path):
                if rel == args.path:
                    sys.stdout.write(body)
                    return 0
        print("vendor: %s has no file %r. Try --list %s." % (args.source, args.path, args.source),
              file=sys.stderr)
        return 1
    except (OSError, ValueError) as exc:
        print("vendor: %s" % exc, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
