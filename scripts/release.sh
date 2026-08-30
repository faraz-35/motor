#!/bin/zsh
# Publishes a GitHub release with the signed APK. Usage: zsh scripts/release.sh v1.0.0
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:?usage: release.sh <tag>}"

APK=app/android/app/build/outputs/apk/release/app-release.apk
[ -f "$APK" ] || { echo "APK missing — run scripts/build-android.sh first"; exit 1; }

cp "$APK" "Motor-${TAG}.apk"
gh release create "$TAG" "Motor-${TAG}.apk" \
  --repo faraz-35/motor \
  --title "Motor ${TAG}" \
  --notes "Download Motor-${TAG}.apk on your phone and install it. First phone: create household, share the code. Others: join with it. Then Family tab → Make alarms reliable."
echo "released ${TAG}"
