#!/usr/bin/env node

import { copyFile, cp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const appName = process.argv[2] || 'LINE 日報控制台'
const distDirectory = resolve(scriptDirectory, 'dist')
const bundleDirectory = join(distDirectory, `${appName}.app`)
const contentsDirectory = join(bundleDirectory, 'Contents')
const macosDirectory = join(contentsDirectory, 'MacOS')
const resourcesDirectory = join(contentsDirectory, 'Resources')
const relayAppDirectory = join(resourcesDirectory, 'app')
const relayNodeModulesDirectory = join(relayAppDirectory, 'node_modules')
const nodeSource = process.execPath

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_TW</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundleExecutable</key>
  <string>start</string>
  <key>CFBundleIdentifier</key>
  <string>ai.moreu.daily-report-line-relay</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
`

const launcher = `#!/bin/zsh
set -e

APP_CONTENTS="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCES="$APP_CONTENTS/Resources"
NODE="$RESOURCES/node"
APP_DIR="$RESOURCES/app"
PORT="\${LINE_RELAY_APP_PORT:-8787}"
URL="http://127.0.0.1:$PORT"
LOG_DIR="$HOME/Library/Logs"
LOG_FILE="$LOG_DIR/LINE Daily Report Relay.log"

mkdir -p "$LOG_DIR"

if /usr/sbin/lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  /usr/bin/open "$URL"
  exit 0
fi

(
  sleep 1
  /usr/bin/open "$URL"
) >/dev/null 2>&1 &

cd "$APP_DIR"
exec "$NODE" "$APP_DIR/app.mjs" --port "$PORT" >> "$LOG_FILE" 2>&1
`

await rm(distDirectory, {
  force: true,
  recursive: true,
})
await mkdir(macosDirectory, {
  recursive: true,
})
await mkdir(relayAppDirectory, {
  recursive: true,
})

await writeFile(join(contentsDirectory, 'Info.plist'), plist)
await writeFile(join(macosDirectory, 'start'), launcher, {
  mode: 0o755,
})
await copyFile(nodeSource, join(resourcesDirectory, 'node'))

for (const filename of ['app.mjs', 'relay.mjs', 'schedule.mjs', 'package.json', '.env.example', 'README.md', 'TEAM_HANDOFF.md']) {
  await copyFile(join(scriptDirectory, filename), join(relayAppDirectory, filename))
}

await mkdir(relayNodeModulesDirectory, {
  recursive: true,
})

for (const packageName of ['dotenv']) {
  const packageSource = await realpath(join(projectDirectory, 'node_modules', packageName))
  await cp(packageSource, join(relayNodeModulesDirectory, packageName), {
    dereference: true,
    recursive: true,
  })
}

console.log(`Built: ${bundleDirectory}`)
console.log('Double-click the .app to open the local control panel.')
