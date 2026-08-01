#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# LnwCash — APK Build Script (Capacitor Android)
# 
# Usage:
#   bash scripts/build-apk.sh [debug|release]
#
# Prerequisites (install if missing):
#   sudo apt install openjdk-17-jdk android-sdk
#   export ANDROID_HOME=$HOME/android-sdk
#   export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
#
# Output:
#   android/app/build/outputs/apk/debug/app-debug.apk     (debug)
#   android/app/build/outputs/apk/release/app-release-unsigned.apk  (release)
# ──────────────────────────────────────────────────────────
set -euo pipefail

BUILD_TYPE="${1:-debug}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   LnwCash — Capacitor Android APK Build              ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║   Build type: $BUILD_TYPE"
echo "║   Project dir: $PROJECT_DIR"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Check environment ──────────────────────────────
echo "── Step 1: Check environment ──"
bash "$SCRIPT_DIR/check-env.sh" || {
	echo ""
	echo "🔴 Environment check FAILED. ติดตั้ง dependencies ที่ขาดก่อน build."
	exit 1
}
echo ""

# ─── Step 2: Build web (Vite) ───────────────────────────────
echo "── Step 2: Build web app ──"
npm run build
echo "  ✓ Web build complete → dist/"
echo ""

# ─── Step 3: Sync Capacitor ─────────────────────────────────
echo "── Step 3: Copy web assets to Android ──"
npx cap copy
echo "  ✓ Web assets copied → android/app/src/main/assets/"
echo ""

# ─── Step 4: Sync Capacitor plugins ─────────────────────────
echo "── Step 4: Sync Capacitor plugins ──"
npx cap sync android
echo "  ✓ Capacitor synced"
echo ""

# ─── Step 5: Assemble APK ───────────────────────────────────
echo "── Step 5: Assemble APK ($BUILD_TYPE) ──"

GRADLEW="android/gradlew"
if [ ! -f "$GRADLEW" ]; then
	echo "🔴 gradlew not found at $GRADLEW. Run npx cap sync first."
	exit 1
fi

chmod +x "$GRADLEW"

if [ "$BUILD_TYPE" = "release" ]; then
	cd android
	./gradlew assembleRelease
	cd ..
	APK_PATH="android/app/build/outputs/apk/release/app-release-unsigned.apk"
else
	cd android
	./gradlew assembleDebug
	cd ..
	APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
fi

echo ""

# ─── Result ─────────────────────────────────────────────────
if [ -f "$APK_PATH" ]; then
	APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
	echo "╔══════════════════════════════════════════════════════╗"
	echo "║   ✅ APK BUILD SUCCESS                               ║"
	echo "╠══════════════════════════════════════════════════════╣"
	echo "║   Path: $APK_PATH"
	echo "║   Size: $APK_SIZE"
	echo "╚══════════════════════════════════════════════════════╝"
	exit 0
else
	echo "╔══════════════════════════════════════════════════════╗"
	echo "║   ❌ APK BUILD FAILED                                ║"
	echo "╠══════════════════════════════════════════════════════╣"
	echo "║   Expected: $APK_PATH"
	echo "║   Check Gradle output above for errors.              ║"
	echo "╚══════════════════════════════════════════════════════╝"
	exit 1
fi
