#!/usr/bin/env bash
set -eu
cp -R "$(dirname "$0")/files/." .
cd jotter && git init -q -b main && git add -A && git -c user.name=test -c user.email=test@example.com commit -qm "Initial jotter app"
