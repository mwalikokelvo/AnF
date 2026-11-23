#!/usr/bin/env bash
# Sets up jotter with an "origin" remote holding main plus another assistant's unfinished branch.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
cp -R "$here/files/jotter" ./jotter
git_c() { git -c user.name=test -c user.email=test@example.com "$@"; }
git init -q --bare origin.git
cd jotter
git init -q -b main && git add -A && git_c commit -qm "Initial jotter app with agent guide and handoff"
git remote add origin ../origin.git && git push -q origin main
git checkout -q -b codex/csv-export-wip
cp -R "$here/files/codex-wip/." .
git add -A && git_c commit -qm "feat(export): start CSV export (notesToCsv)"
git push -q origin codex/csv-export-wip
git checkout -q main && git branch -q -D codex/csv-export-wip
