#!/usr/bin/env bash
# emulator-runner executes each script line in a separate /bin/sh process.
# Keep shell variables and Bash arrays in one explicitly invoked Bash script.
set -euo pipefail
version=$(node -p "require('./windows/src-tauri/tauri.conf.json').version")
baseline=$(python3 scripts/app-qa/android_archive_baseline.py select)
python3 scripts/app-qa/android-upgrade.py \
  --baseline "$baseline" \
  --candidate "releases/AnF-Android-$version-unsigned.apk" \
  --test android/gradle-build/outputs/apk/androidTest/release/CoucouAndroid-release-androidTest.apk \
  --output "$RUNNER_TEMP/anf-android-qa"
