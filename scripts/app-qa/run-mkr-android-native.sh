#!/usr/bin/env bash
set -euo pipefail
serial=emulator-5554
package=com.anf.mkr.catalog.test
qa_dir="$RUNNER_TEMP/mkr-native-qa"
apk=integrations/mkr-music/android-catalog/build/outputs/apk/androidTest/debug/anf-mkr-android-catalog-debug-androidTest.apk
mkdir -p "$qa_dir"
avd=$(adb -s "$serial" emu avd name | tr -d '\r' | head -n1)
test "$avd" = anf-mkr-native-qa
test "$(adb -s "$serial" shell getprop ro.build.version.sdk | tr -d '\r')" = 35
test -f "$apk"
actual=$("$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging "$apk" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")
test "$actual" = "$package"
# This fresh emulator has no AnF library/data or production signing identity.
adb -s "$serial" install -t "$apk"
adb -s "$serial" shell am instrument -w -r \
  -e class com.anf.mkr.android.MkrNativePlaybackTest \
  "$package/androidx.test.runner.AndroidJUnitRunner" | tee "$qa_dir/instrumentation.txt"
grep -Fq 'OK (3 tests)' "$qa_dir/instrumentation.txt"
! grep -Eq 'FAILURES|INSTRUMENTATION_FAILED|Process crashed' "$qa_dir/instrumentation.txt"
adb -s "$serial" logcat -d -s TestRunner:I AndroidRuntime:E ExoPlayerImplInternal:E > "$qa_dir/native-logcat.txt"
printf '%s\n' 'Generated transport/AAC only. Actual Media3 decoder tests; no provider or production app/upgrade verification.' > "$qa_dir/scope.txt"
