#!/usr/bin/env bash
# Installs the debug APK on the running emulator, launches it, and captures evidence.
# emulator-runner runs each script line in a separate shell, so this lives in one Bash script.
set -euo pipefail
version=$(node -p "require('./windows/src-tauri/tauri.conf.json').version")
apk="releases/AnF-Android-$version-debug.apk"
out="${RUNNER_TEMP:?}/anf-android-smoke"
mkdir -p "$out"
adb="$ANDROID_HOME/platform-tools/adb"
pkg=com.coucou.workspace
"$adb" wait-for-device
"$adb" logcat -c
"$adb" install --no-incremental -r "$apk"
"$adb" shell dumpsys package "$pkg" | grep -E 'versionName|versionCode' | tee "$out/installed-version.txt"
grep -q "versionName=$version" "$out/installed-version.txt"
"$adb" shell am start -W -n "$pkg/.MainActivity" | tee "$out/am-start.txt"
sleep 20
if ! "$adb" shell pidof "$pkg" > "$out/pid.txt" || [ ! -s "$out/pid.txt" ]; then
  echo "App process is not running after launch." >&2
  "$adb" logcat -d > "$out/logcat.txt" || true
  exit 1
fi
"$adb" exec-out screencap -p > "$out/launch.png"
"$adb" logcat -d > "$out/logcat.txt"
if grep -E "FATAL EXCEPTION|Process: $pkg.*died|ANR in $pkg" "$out/logcat.txt"; then
  echo "App crashed or stopped responding." >&2
  exit 1
fi
test -s "$out/launch.png"
echo "PASS: AnF $version debug APK installed, launched and stayed running on the emulator."
