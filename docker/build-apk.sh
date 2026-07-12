#!/usr/bin/env bash
#
# Build the debug APK inside a reproducible Docker image (JDK 21 + Android SDK).
# Nothing but Docker is required on the host — no local JDK/SDK/Node needed.
#
# Usage:  ./docker/build-apk.sh [release]
#   (default target is the debug APK)
#
set -euo pipefail

TARGET="${1:-debug}"
case "$TARGET" in
  debug)   GRADLE_TASK="assembleDebug" ;;
  release) GRADLE_TASK="assembleRelease" ;;
  *) echo "Unknown target '$TARGET' (use: debug | release)"; exit 1 ;;
esac

IMAGE="homelab-apk-builder"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Windows/Git-Bash safe host path + stop MSYS from rewriting container paths.
HOST_PWD="$(cd "$PROJECT_DIR" && pwd -W 2>/dev/null || echo "$PROJECT_DIR")"
export MSYS_NO_PATHCONV=1

echo "==> Building image '$IMAGE' (first run downloads the SDK, be patient)…"
docker build -f "$SCRIPT_DIR/Dockerfile" -t "$IMAGE" "$SCRIPT_DIR"

echo "==> Building $TARGET APK inside the container…"
# node_modules is shadowed by a named volume so the host's (Windows) install is
# untouched and the container keeps its own Linux binaries. Gradle cache persists.
docker run --rm \
  -v "${HOST_PWD}:/workspace" \
  -v homelab_node_modules:/workspace/node_modules \
  -v homelab_gradle_cache:/root/.gradle \
  -w /workspace \
  "$IMAGE" \
  bash -lc "\
    npm ci && \
    npm run build:skip-types && \
    npx cap sync android && \
    cd android && chmod +x gradlew && \
    ./gradlew --no-daemon $GRADLE_TASK"

echo ""
echo "==> Done. APK(s):"
ls -1 "$PROJECT_DIR/android/app/build/outputs/apk/$TARGET/"*.apk 2>/dev/null || echo "  (no APK found — check the log above)"
