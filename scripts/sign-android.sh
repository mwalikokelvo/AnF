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
ks="$work/release.keystore"
if ! printf '%s' "$KEY_BASE64" | tr -d ' \r\n' | base64 -d > "$ks" || [ ! -s "$ks" ]; then
  echo "::error::ANDROID_KEYSTORE_BASE64 is not a valid key file. Copy it again with the PowerShell line in docs/RELEASE-BUILDS.md."
  exit 1
fi
# Older Android keys are JKS files (they start with FE ED FE ED); newer ones are PKCS12. Name the type so nothing guesses.
type=PKCS12
if [ "$(head -c 4 "$ks" | od -An -tx1 | tr -d ' \n')" = feedfeed ]; then type=JKS; fi
# Open the file with the keystore password alone first, so a wrong password is told apart from a key-password problem.
if ! listing=$(keytool -list -keystore "$ks" -storetype "$type" -storepass:env KEY_PASSWORD 2>&1); then
  echo "::error::ANDROID_KEYSTORE_PASSWORD does not open the $type key file. Copy password.txt into that secret again (no extra spaces or lines)."
  exit 1
fi
mapfile -t aliases < <(printf '%s\n' "$listing" | grep 'PrivateKeyEntry' | cut -d, -f1)
if [ "${#aliases[@]}" -eq 0 ]; then
  echo "::error::The key file opened but holds no signing key."
  exit 1
fi
if [ -z "${KEY_ALIAS:-}" ]; then
  if [ "${#aliases[@]}" -gt 1 ]; then
    echo "::error::The key file holds several keys (${aliases[*]}). Add the one to use as the ANDROID_KEY_ALIAS secret."
    exit 1
  fi
  KEY_ALIAS=${aliases[0]}
fi
echo "::notice::Key file: $type, key \"$KEY_ALIAS\"."
export KEY_ENTRY_PASSWORD="${KEY_ENTRY_PASSWORD:-$KEY_PASSWORD}"
"$tools/zipalign" -P 16 -f 4 "$in" "$work/aligned.apk"
if ! "$tools/apksigner" sign --ks "$ks" --ks-type "$type" --ks-pass env:KEY_PASSWORD --ks-key-alias "$KEY_ALIAS" \
    --key-pass env:KEY_ENTRY_PASSWORD --out "$out" "$work/aligned.apk"; then
  echo "::error::The key file opened, but key \"$KEY_ALIAS\" could not be used. If it has its own password, add it as the ANDROID_KEY_PASSWORD secret."
  exit 1
fi
"$tools/apksigner" verify --print-certs "$out" | grep -i 'SHA-256 digest'
