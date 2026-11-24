#!/usr/bin/env bash
# Re-signs a Homelab APK with the release key, rotated from the legacy key.
#
#   scripts/sign-android-apk.sh [--require] path/to/app.apk
#
# Builds up to v2.0.0 were signed with android/app/debug.keystore, whose
# password is public. APK Signature Scheme v3 key rotation keeps updates
# working: android/signing/lineage.bin proves the legacy key authorised the
# release key, so Android 9+ installs the new build over an existing one and
# keeps its data. The legacy key has no rollback capability in the lineage, so
# once a rotated build is installed, an APK signed only with the legacy key is
# refused as an update. Older Android versions verify the v1/v2 signatures,
# which stay on the legacy key.
#
# The release key never enters the repository. It comes from the environment
# (CI secrets) or from $HOMELAB_SIGNING_ENV (default ~/.config/homelab-signing/signing.env):
#   HOMELAB_SIGNING_KEYSTORE  PKCS12 keystore path
#   HOMELAB_SIGNING_PASSWORD  keystore and key password
#   HOMELAB_SIGNING_ALIAS     key alias (default: homelab)
#
# Without the key the APK keeps its Gradle signature (legacy key only) and the
# script exits 0, unless --require is given (CI publishing jobs).

set -euo pipefail

# SHA-256 of the release certificate: guards against a wrong key in CI secrets.
readonly RELEASE_CERT_SHA256="6214176a2b5a3fb4a53ee5159ce2f581ad0c2f06752f9dfb241960506f141a5a"
readonly LEGACY_KEYSTORE_PASS="android"

require=false
if [[ "${1:-}" == "--require" ]]; then
  require=true
  shift
fi
apk="${1:?usage: sign-android-apk.sh [--require] path/to/app.apk}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${HOMELAB_SIGNING_ENV:-$HOME/.config/homelab-signing/signing.env}"
if [[ -z "${HOMELAB_SIGNING_KEYSTORE:-}" && -f "$env_file" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$env_file"
  set +a
fi

if [[ -z "${HOMELAB_SIGNING_KEYSTORE:-}" || -z "${HOMELAB_SIGNING_PASSWORD:-}" ]]; then
  if $require; then
    echo "error: release signing key not configured (HOMELAB_SIGNING_KEYSTORE / HOMELAB_SIGNING_PASSWORD)" >&2
    exit 1
  fi
  echo "warning: no release signing key, $apk keeps the legacy signature" >&2
  exit 0
fi

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
apksigner="$(find "$sdk/build-tools" -maxdepth 2 -name apksigner | sort -V | tail -1)"
if [[ -z "$apksigner" ]]; then
  echo "error: apksigner not found under $sdk/build-tools" >&2
  exit 1
fi

export HOMELAB_SIGNING_PASSWORD
"$apksigner" sign \
  --ks "$root/android/app/debug.keystore" --ks-key-alias androiddebugkey \
  --ks-pass "pass:$LEGACY_KEYSTORE_PASS" --key-pass "pass:$LEGACY_KEYSTORE_PASS" \
  --next-signer \
  --ks "$HOMELAB_SIGNING_KEYSTORE" --ks-key-alias "${HOMELAB_SIGNING_ALIAS:-homelab}" \
  --ks-pass env:HOMELAB_SIGNING_PASSWORD \
  --lineage "$root/android/signing/lineage.bin" \
  --rotation-min-sdk-version 28 \
  "$apk"

certs="$("$apksigner" verify --print-certs --min-sdk-version 28 "$apk")"
if ! grep -q "certificate SHA-256 digest: $RELEASE_CERT_SHA256" <<<"$certs"; then
  echo "error: $apk is not signed with the expected release certificate" >&2
  echo "$certs" >&2
  exit 1
fi
echo "Signed $apk with the release key (rotated from the legacy key)"
