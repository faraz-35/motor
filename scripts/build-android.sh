#!/bin/zsh
# Builds the signed release APK. Assumes expo prebuild already ran (android/ exists).
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
echo "sdk.dir=$ANDROID_HOME" > app/android/local.properties

[ -f keystore.env ] && source keystore.env
: "${MOTOR_KS_ALIAS:?set MOTOR_KS_ALIAS in keystore.env}"
: "${MOTOR_KS_PASS:?set MOTOR_KS_PASS in keystore.env}"

GRADLE_FILE=app/android/app/build.gradle
node - <<'EOF'
// Deterministic, idempotent signing fix: debug block -> debug keystore,
// release block -> motor.keystore. [^}]* stays inside each simple block.
const fs = require('fs');
const path = 'app/android/app/build.gradle';
let src = fs.readFileSync(path, 'utf8');
if (!src.includes('motor.keystore')) {
  src = src.replace(
    /signingConfigs \{/,
    `signingConfigs {
        release {
            storeFile file('../../../motor.keystore')
            storePassword "${MOTOR_KS_PASS}"
            keyAlias "${MOTOR_KS_ALIAS}"
            keyPassword "${MOTOR_KS_PASS}"
        }`
  );
}
src = src.replace(/(buildTypes \{\s*debug \{[^}]*?)signingConfig signingConfigs\.\w+/, '$1signingConfig signingConfigs.debug');
src = src.replace(/(buildTypes \{\s*debug \{[^}]*\}\s*release \{[^}]*?)signingConfig signingConfigs\.\w+/, '$1signingConfig signingConfigs.release');
fs.writeFileSync(path, src);
console.log('signing config ensured');
EOF

echo "$(date '+%F %T') gradle assembleRelease starting" >> PROGRESS.log
cd app/android
./gradlew assembleRelease -q --console=plain 2>&1 | tail -40
echo "$(date '+%F %T') gradle finished rc=$?" >> ../../PROGRESS.log
ls -la app/build/outputs/apk/release/ 2>/dev/null || ls -la ~/Programming/motor/app/android/app/build/outputs/apk/release/
