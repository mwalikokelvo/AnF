#!/usr/bin/env bash
# emulator-runner executes each script line in a separate /bin/sh process.
# Keep shell variables and Bash arrays in one explicitly invoked Bash script.
set -euo pipefail
version=$(node -p "require('./windows/src-tauri/tauri.conf.json').version")
shopt -s nullglob
identity=${ANF_QA_ANDROID_ID:-com.coucou.workspace}
case "$identity" in
  com.coucou.workspace) prefix=AnF-Android-Legacy ;;
  com.anf.workspace) prefix=AnF-Android ;;
  *) echo 'Choose one of the two supported installed Android identities.' >&2; exit 1 ;;
esac
if [ -n "${ANF_QA_BASELINE_FILENAME:-}" ]; then
  if [[ ! "$ANF_QA_BASELINE_FILENAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$ ]]; then
    echo 'The baseline APK must be a plain APK basename.' >&2; exit 1
  fi
  baseline=("previous-android/$ANF_QA_BASELINE_FILENAME")
  if [ ! -f "${baseline[0]}" ]; then echo 'Selected baseline APK was not downloaded.' >&2; exit 1; fi
else
  baseline=(previous-android/*-unsigned.apk)
fi
if [ "${#baseline[@]}" -ne 1 ]; then
  echo "Expected exactly one selected baseline APK, found ${#baseline[@]}." >&2
  exit 1
fi
tests=(android/gradle-build/outputs/apk/androidTest/release/*.apk)
if [ "${#tests[@]}" -ne 1 ]; then echo 'Expected exactly one matching instrumentation APK.' >&2; exit 1; fi
python3 scripts/app-qa/android-upgrade.py \
  --baseline "${baseline[0]}" \
  --candidate "releases/$prefix-$version-unsigned.apk" \
  --test "${tests[0]}" \
  --application-id "$identity" \
  --output "$RUNNER_TEMP/anf-android-qa"
