#!/usr/bin/env bash
# emulator-runner executes each script line in a separate /bin/sh process.
# Keep shell variables and Bash arrays in one explicitly invoked Bash script.
set -euo pipefail
version=$(node -p "require('./windows/src-tauri/tauri.conf.json').version")
shopt -s nullglob
baseline=(previous-android/*-unsigned.apk)
if [ "${#baseline[@]}" -ne 1 ]; then
  echo "Expected exactly one previous unsigned APK, found ${#baseline[@]}." >&2
  exit 1
fi
python3 scripts/app-qa/android-upgrade.py \
  --baseline "${baseline[0]}" \
  --candidate "releases/AnF-Android-$version-unsigned.apk" \
  --test android/gradle-build/outputs/apk/androidTest/release/CoucouAndroid-release-androidTest.apk \
  --output "$RUNNER_TEMP/anf-android-qa"
