# TASK-008: Packaging — Capacitor APK — DevOps Evidence

## Build Status: 🔴 BLOCKED
- APK build not possible on current environment
- All preparatory work completed (plugins, code, scripts, config)

## Environment Check Summary
| Resource | Status | Details |
|----------|--------|---------|
| Node.js | ✅ v22.22.1 | >=18 |
| npm | ✅ 10.9.4 | |
| Java JDK 17+ | ❌ NOT FOUND | `java: command not found` |
| JAVA_HOME | ❌ NOT SET | |
| Android SDK | ❌ NOT FOUND | ANDROID_HOME not set |
| Gradle CLI | ⚠️ not found | gradlew wrapper exists |
| @capacitor/core | ✅ installed | |
| @capacitor/cli | ✅ installed | |
| @capacitor/android | ✅ installed | |
| capacitor-barcode-scanner | ✅ installed | v8.0.0 |
| capacitor-secure-storage-plugin | ✅ installed | v0.13.0 |
| Capacitor Sync | ✅ PASS | 2 plugins detected |

## What's Needed to Unblock

### 1. Install Java JDK 17+
```bash
sudo apt update
sudo apt install openjdk-17-jdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
```

### 2. Install Android SDK + Build Tools
```bash
# Option A) Via apt (simpler, may be older)
sudo apt install android-sdk

# Option B) Via commandlinetools (recommended)
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk/cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip
export ANDROID_HOME=~/android-sdk
echo 'export ANDROID_HOME=~/android-sdk' >> ~/.bashrc
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-35" "build-tools;35.0.0"
```

### 3. Then Build
```bash
cd /home/debian/arx-projects/lnw-cash
bash scripts/build-apk.sh debug
```

## File Tree — Created / Modified

### Created (5 files)
```
capacitor.config.ts          — TypeScript Capacitor config with plugin declarations
scripts/
├── check-env.sh             — Environment validation script
└── build-apk.sh             — End-to-end APK build script
src/lib/
├── platform.ts              — Capacitor/platform detection utilities
└── storage/secure-native.ts — Capacitor secure storage adapter (Keystore/Keychain)
```

### Modified (3 files)
```
package.json                 — Added cap:apk:debug, cap:apk:release, apk:build, env:check scripts
src/screens/F007-QRScan.svelte — Native QR scanner bridge (Capacitor + BarcodeDetector API)
src/lib/wallet/storage.ts    — Mirrors sensitive keys to native secure storage
```

### Packages Added (2)
```
capacitor-barcode-scanner@8.0.0        — Native QR/barcode scanner (MLKit on Android)
capacitor-secure-storage-plugin@0.13.0 — Android Keystore / iOS Keychain storage
```

## Plugin Configuration Summary

### capacitor-barcode-scanner (v8.0.0)
- **On native (Capacitor):** Launches full-screen native barcode scanning UI
- **On web (PWA):** Uses browser `BarcodeDetector` API (Chrome/Edge) + getUserMedia camera
- **Fallback:** Manual text input (existing — unchanged)
- **Registered in:** `capacitor.config.ts` (plugins section)
- **Capacitor sync:** ✅ Detected as capacitor-barcode-scanner@8.0.0

### capacitor-secure-storage-plugin (v0.13.0)
- **On native (Capacitor):** Uses Android Keystore / iOS Keychain
- **On web (PWA):** Falls back to localStorage (keys already AES-GCM encrypted)
- **Integration:** Fire-and-forget mirroring from wallet/storage.ts
- **Stack:** localStorage (primary, sync) → Keystore (mirror, async)
- **Registered in:** `capacitor.config.ts` (plugins section)
- **Capacitor sync:** ✅ Detected as capacitor-secure-storage-plugin@0.13.0

## Capacitor Sync Output
```
✔ Copying web assets from dist to android/app/src/main/assets/public
✔ Creating capacitor.config.json in android/app/src/main/assets
✔ copy android
✔ Updating Android plugins
[info] Found 2 Capacitor plugins for android:
       capacitor-barcode-scanner@8.0.0
       capacitor-secure-storage-plugin@0.13.0
✔ update android
[info] Sync finished in 0.308s
```

## Test Results
```
 Test Files  37 passed (37)
      Tests  341 passed (341)
```
No regression. All existing tests pass.

## Architecture Notes

### QR Scanner Flow
```
User taps scan
  ├─ isNativePlatform()?
  │   ├─ YES → import('capacitor-barcode-scanner').BarcodeScanner.scan()
  │   │        → Native full-screen MLKit barcode scanner
  │   │        → Returns ScanResult { result, code }
  │   └─ NO  → startWebScan()
  │            ├─ 'BarcodeDetector' in window?
  │            │   ├─ YES → BarcodeDetector.detect(videoElement)
  │            │   └─ NO  → camera preview only (user uses manual input)
  │            └─ Fallback: manual text input always available
```

### Secure Storage Flow
```
setEncryptedKey(encryptedKey)
  ├─ localStorage.setItem(...)   [sync, primary]
  └─ _mirrorToSecure(...)        [async, fire-and-forget]
       └─ SecureStoragePlugin.set({ key, value })
            └─ Android Keystore / iOS Keychain (defense-in-depth)

getEncryptedKey()
  ├─ localStorage.getItem(...)   [sync, primary]
  └─ If null && isNativePlatform():
       └─ Try SecureStoragePlugin.get({ key })
            └─ Restore to localStorage if found
```
