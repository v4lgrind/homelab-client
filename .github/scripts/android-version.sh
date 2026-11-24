#!/usr/bin/env bash
# Android versionCode and versionName of a CI build, as KEY=value lines for
# $GITHUB_ENV (build.gradle reads ANDROID_VERSION_CODE / ANDROID_VERSION_NAME).
#
#   android-version.sh release 2.1.0   # ANDROID_VERSION_CODE=2.1.000, NAME=2.1.0
#   android-version.sh nightly         # last release tag + commits since it
#
# Codes are MAJOR*1000000 + MINOR*10000 + PATCH*100, which leaves 99 slots for
# nightlies between two releases: a nightly built N commits after v2.1.0 gets
# 2010000+N, so it installs over v2.1.0 and v2.1.1 (2010100) installs over it.
# src/services/app-update.ts applies the same formula to release tags.
# Releases up to v2.0.0 used MAJOR*10000 + MINOR*100 + PATCH (v2.0.0 = 20000);
# every new code is above them.

set -euo pipefail

code_of() {
  local major minor patch
  IFS=. read -r major minor patch <<<"$1"
  if ((minor > 99 || patch > 99)); then
    echo "error: minor and patch must be at most 99 (got $1)" >&2
    exit 1
  fi
  echo $((major * 1000000 + minor * 10000 + patch * 100))
}

case "${1:-}" in
  release)
    version="${2:-}"
    version="${version#v}"
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "error: invalid version '$version', expected MAJOR.MINOR.PATCH" >&2
      exit 1
    fi
    code="$(code_of "$version")"
    echo "ANDROID_VERSION_CODE=$code"
    echo "ANDROID_VERSION_NAME=$version"
    ;;
  nightly)
    # Needs the history and tags (actions/checkout with fetch-depth: 0).
    tag="$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || echo v0.0.0)"
    if [[ "$tag" == v0.0.0 ]]; then
      commits="$(git rev-list --count HEAD)"
    else
      commits="$(git rev-list --count "$tag..HEAD")"
    fi
    # Past 99 commits, nightlies share a code: they still install over each
    # other (Android only refuses a lower code), the next release fixes it.
    nightly=$((commits > 99 ? 99 : commits))
    base="${tag#v}"
    code="$(code_of "$base")"
    echo "ANDROID_VERSION_CODE=$((code + nightly))"
    echo "ANDROID_VERSION_NAME=$base-nightly.$commits"
    ;;
  *)
    echo "usage: android-version.sh release X.Y.Z | nightly" >&2
    exit 1
    ;;
esac
