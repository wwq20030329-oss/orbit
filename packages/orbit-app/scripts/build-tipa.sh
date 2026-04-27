#!/usr/bin/env bash
# Build a TrollStore-compatible .tipa for the Orbit app.
#
# TrollStore can install unsigned IPAs as long as the binary has the proper
# Mach-O structure and the bundle layout is `Payload/<App>.app`. We therefore
# build with CODE_SIGNING_ALLOWED=NO and skip the provisioning step.
set -euo pipefail

cd "$(dirname "$0")/.."

SCHEME="Orbitdev"
WORKSPACE="ios/Orbitdev.xcworkspace"
CONFIG="Release"
DERIVED="build/tipa"
OUT_DIR="$DERIVED/Build/Products/${CONFIG}-iphoneos"
DESKTOP_OUT="$HOME/Desktop/Orbit.tipa"

echo "==> xcodebuild ($CONFIG / iphoneos, unsigned)"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -sdk iphoneos \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  ENABLE_BITCODE=NO \
  build | tail -40

APP_PATH="$(find "$OUT_DIR" -maxdepth 1 -name '*.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "ERROR: .app bundle not found in $OUT_DIR" >&2
  exit 1
fi
echo "==> Found app: $APP_PATH"

# Strip embedded provisioning + signature — TrollStore handles entitlements.
rm -f "$APP_PATH/embedded.mobileprovision"
rm -rf "$APP_PATH/_CodeSignature"

STAGE="$DERIVED/stage"
rm -rf "$STAGE"
mkdir -p "$STAGE/Payload"
cp -R "$APP_PATH" "$STAGE/Payload/"

TIPA_PATH="$(pwd)/$DERIVED/Orbit.tipa"
rm -f "$TIPA_PATH"
( cd "$STAGE" && zip -qr "$TIPA_PATH" Payload )

echo "==> Wrote $(du -h "$TIPA_PATH" | cut -f1) → $TIPA_PATH"

# Replace the desktop copy.
mv -f "$TIPA_PATH" "$DESKTOP_OUT"
echo "==> Installed: $DESKTOP_OUT"
ls -lh "$DESKTOP_OUT"
