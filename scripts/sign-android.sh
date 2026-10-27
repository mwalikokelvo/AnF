#!/usr/bin/env bash
# Signs the unsigned release APK with the owner's Android key, then prints the certificate fingerprint.
# Usage: sign-android.sh <unsigned.apk> <signed.apk>
# Env: KEY_BASE64 (the keystore file as base64), KEY_PASSWORD; optional KEY_ALIAS, KEY_ENTRY_PASSWORD
# (the key's own password, when it differs from the keystore password).
set -euo pipefail
in=$1 out=$2
tools="$ANDROID_HOME/build-tools/36.0.0"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 077
if ! printf '%s' "$KEY_BASE64" | tr -d ' \r\n' | base64 -d > "$work/release.keystore" || [ ! -s "$work/release.keystore" ]; then
  echo "::error::ANDROID_KEYSTORE_BASE64 is not a valid key file. Copy it again with the PowerShell line in docs/RELEASE-BUILDS.md."
  exit 1
fi
export KEY_ENTRY_PASSWORD="${KEY_ENTRY_PASSWORD:-$KEY_PASSWORD}"
alias_args=()
if [ -n "${KEY_ALIAS:-}" ]; then alias_args=(--ks-key-alias "$KEY_ALIAS"); fi
"$tools/zipalign" -P 16 -f 4 "$in" "$work/aligned.apk"
if ! "$tools/apksigner" sign --ks "$work/release.keystore" --ks-pass env:KEY_PASSWORD --key-pass env:KEY_ENTRY_PASSWORD \
    "${alias_args[@]}" --out "$out" "$work/aligned.apk"; then
  echo "::error::The key could not be opened. Check ANDROID_KEYSTORE_PASSWORD, and set ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD if your key file holds several keys or a separate key password."
  exit 1
fi
"$tools/apksigner" verify --print-certs "$out" | grep -i 'SHA-256 digest'
