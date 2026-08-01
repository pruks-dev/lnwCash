#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# LnwCash — Environment Check Script
# ตรวจสอบ environment สำหรับ Capacitor Android build
# ──────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARN=$((WARN + 1)); }

echo "╔══════════════════════════════════════════════════════╗"
echo "║   LnwCash — Capacitor Android Build Env Check        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── Node.js ───────────────────────────────────────────────
echo "── Node.js ──"
NODE_VERSION=$(node --version 2>/dev/null || echo "")
if [ -n "$NODE_VERSION" ]; then
	NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d'.' -f1)
	if [ "$NODE_MAJOR" -ge 18 ]; then
		pass "Node.js $NODE_VERSION (>=18)"
	else
		fail "Node.js $NODE_VERSION — requires >=18"
	fi
else
	fail "Node.js not found"
fi

# ─── npm ───────────────────────────────────────────────────
echo "── npm ──"
NPM_VERSION=$(npm --version 2>/dev/null || echo "")
if [ -n "$NPM_VERSION" ]; then
	pass "npm $NPM_VERSION"
else
	fail "npm not found"
fi

# ─── Java JDK ──────────────────────────────────────────────
echo "── Java JDK ──"
JAVA_VERSION=$(java -version 2>&1 | head -1 || echo "")
if echo "$JAVA_VERSION" | grep -q "version"; then
	JAVA_MAJOR=$(echo "$JAVA_VERSION" | grep -oP 'version "\K[0-9]+' || echo "0")
	if [ "$JAVA_MAJOR" -ge 17 ]; then
		pass "Java $JAVA_MAJOR (>=17): $JAVA_VERSION"
	else
		fail "Java $JAVA_MAJOR — requires >=17: $JAVA_VERSION"
	fi
else
	fail "Java JDK not found"

	echo ""
	echo "  ─── apt install instructions ───"
	echo "  sudo apt update && sudo apt install openjdk-17-jdk"
	echo "  export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64"
	echo ""
fi

echo "  JAVA_HOME=${JAVA_HOME:-<not set>}"
if [ -n "${JAVA_HOME:-}" ] && [ -d "$JAVA_HOME" ]; then
	pass "JAVA_HOME=$JAVA_HOME"
elif [ -n "${JAVA_HOME:-}" ]; then
	warn "JAVA_HOME=$JAVA_HOME (directory not found)"
else
	fail "JAVA_HOME not set"
fi

# ─── Android SDK ───────────────────────────────────────────
echo "── Android SDK ──"
echo "  ANDROID_HOME=${ANDROID_HOME:-<not set>}"
echo "  ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-<not set>}"

ANDROID_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -n "$ANDROID_ROOT" ] && [ -d "$ANDROID_ROOT" ]; then
	pass "ANDROID_HOME=$ANDROID_ROOT"

	if [ -f "$ANDROID_ROOT/platforms/android-35/build.prop" ] || \
	   [ -f "$ANDROID_ROOT/platforms/android-34/build.prop" ]; then
		pass "Android platform SDK installed"
	else
		warn "Android platform SDK not found — run: sdkmanager \"platforms;android-35\""
	fi

	if [ -d "$ANDROID_ROOT/build-tools" ]; then
		pass "Build tools found: $(ls "$ANDROID_ROOT/build-tools" 2>/dev/null | tr '\n' ' ')"
	else
		warn "Build tools not found — run: sdkmanager \"build-tools;35.0.0\""
	fi
else
	fail "Android SDK not found"

	echo ""
	echo "  ─── Install Android SDK ───"
	echo "  # Option 1: Install via apt (older version)"
	echo "  sudo apt install android-sdk"
	echo ""
	echo "  # Option 2: Install via commandlinetools (recommended)"
	echo "  mkdir -p ~/android-sdk/cmdline-tools"
	echo "  cd ~/android-sdk/cmdline-tools"
	echo "  wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
	echo "  unzip commandlinetools-linux-*.zip"
	echo "  export ANDROID_HOME=~/android-sdk"
	echo "  yes | \$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses"
	echo "  \$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \"platforms;android-35\" \"build-tools;35.0.0\""
	echo ""
fi

# ─── Gradle ─────────────────────────────────────────────────
echo "── Gradle ──"
GRADLE_VERSION=$(gradle --version 2>/dev/null | grep "Gradle" | head -1 || echo "")
if [ -n "$GRADLE_VERSION" ]; then
	pass "Gradle: $GRADLE_VERSION"
else
	warn "Gradle CLI not found — android/gradlew wrapper จะถูกใช้แทน"
fi

if [ -f "android/gradlew" ]; then
	pass "Gradle wrapper (android/gradlew) found"
else
	fail "Gradle wrapper not found — run: npx cap sync"
fi

# ─── Capacitor packages ─────────────────────────────────────
echo "── Capacitor packages ──"
for pkg in @capacitor/core @capacitor/cli; do
	if node -e "require('$pkg')" 2>/dev/null; then
		pass "$pkg installed"
	else
		fail "$pkg not installed — run: npm install"
	fi
done

# @capacitor/android is a platform package (no CJS entry), check via directory
if [ -d "node_modules/@capacitor/android" ]; then
	pass "@capacitor/android installed (platform)"
else
	fail "@capacitor/android not installed — run: npm install"
fi

for pkg in capacitor-barcode-scanner capacitor-secure-storage-plugin; do
	if node -e "require('$pkg')" 2>/dev/null; then
		pass "$pkg installed"
	else
		fail "$pkg not installed — run: npm install"
	fi
done

# ─── Dependencies ───────────────────────────────────────────
echo "── Dependencies ──"
if [ -d "node_modules" ]; then
	pass "node_modules/ exists"
else
	fail "node_modules/ missing — run: npm install"
fi

if [ -d "dist" ]; then
	pass "dist/ exists (web build)"
else
	warn "dist/ missing — run: npm run build"
fi

# ─── Summary ────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Summary                                           ║"
echo "╠══════════════════════════════════════════════════════╣"
printf "║   ${GREEN}Pass: %2d${NC}  ${RED}Fail: %2d${NC}  ${YELLOW}Warn: %2d${NC}                         ║\n" $PASS $FAIL $WARN
echo "╚══════════════════════════════════════════════════════╝"

if [ "$FAIL" -gt 0 ]; then
	echo ""
	echo "🔴 Environment is NOT READY for APK build."
	echo "   ติดตั้ง packages ที่ขาดด้านบน แล้ว re-run script นี้"
	exit 1
elif [ "$WARN" -gt 0 ]; then
	echo ""
	echo "🟡 Environment has warnings but may still build."
	exit 1
else
	echo ""
	echo "🟢 Environment is READY for APK build."
	exit 0
fi
