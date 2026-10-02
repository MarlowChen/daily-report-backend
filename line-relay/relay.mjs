#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { config as loadDotenv } from 'dotenv'

const execFileAsync = promisify(execFile)
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')

const placeholderEnvKeys = [
  'DAILY_REPORT_SHARED_SECRET',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'LINE_RELAY_VISION_API_KEY',
]

const clearPlaceholderEnv = () => {
  for (const key of placeholderEnvKeys) {
    const value = process.env[key] || ''
    if (!value || /^(REPLACE_|REPLACE_WITH_|OPTIONAL_|YOUR_|<YOUR)/i.test(value)) {
      delete process.env[key]
    }
  }
}

const loadEnvFiles = () => {
  const seen = new Set()
  const envPaths = [
    join(projectDirectory, '.env'),
    join(scriptDirectory, '.env'),
    resolve(process.cwd(), '.env'),
  ]

  for (const path of envPaths) {
    if (seen.has(path) || !existsSync(path)) continue
    seen.add(path)
    clearPlaceholderEnv()
    loadDotenv({
      override: false,
      path,
    })
  }

  clearPlaceholderEnv()
}

loadEnvFiles()

const DEFAULT_API_URL = 'http://localhost:3000/api/daily-report/package'
const DEFAULT_GENERATE_MODE = 'missing'
const DEFAULT_LINE_APP = 'LINE'
const DEFAULT_DELAY_MS = 1400
const DEFAULT_PASTE_DELAY_MS = 2200
const DEFAULT_FOCUS_DELAY_MS = 5000
const DEFAULT_PASTE_METHOD = 'keycode'
const DEFAULT_TARGET = 'LINE OpenChat'
const DEFAULT_OPERATOR = 'macOS relay'
const DEFAULT_CLICK_DELAY_MS = 800
const DEFAULT_SEARCH_DELAY_MS = 1200
const DEFAULT_SEARCH_SHORTCUT = 'cmd-shift-f'
const DEFAULT_MOUSE_POSITION_DELAY_MS = 0
const DEFAULT_SEARCH_MODE = 'keyboard'
const DEFAULT_SEARCH_TAB_COUNT = 0
const DEFAULT_SEARCH_RESULT_STEPS = 2
const DEFAULT_SEARCH_RESULT_MODE = 'keyboard'
const DEFAULT_SEARCH_OPEN_KEY = 'down-enter'
const DEFAULT_SEARCH_RESULT_OFFSET = 132
const DEFAULT_SEARCH_RESULT_FALLBACK_X = 100
const DEFAULT_SEARCH_RESULT_FALLBACK_Y = 169
const DEFAULT_SEARCH_RESULT_X_RATIO = 0.22
const DEFAULT_SEARCH_RESULT_Y_RATIO = 0.2
const DEFAULT_SMART_ROOM_STEPS = '2,1,3,0,4'
const DEFAULT_VERIFY_DELAY_MS = 1800
const DEFAULT_VERIFY_THRESHOLD = 0.85
const DEFAULT_VISION_PROVIDER = String(process.env.LINE_RELAY_VISION_PROVIDER || 'proxy').toLowerCase()
const DEFAULT_VISION_MODEL = DEFAULT_VISION_PROVIDER === 'openai' ? 'gpt-4.1-mini' : 'openai/gpt-4.1-mini'
const DEFAULT_OPENROUTER_SITE_URL = 'http://localhost'
const DEFAULT_OPENROUTER_APP_NAME = 'daily-report-line-relay'
const DEFAULT_HTTP_TIMEOUT_MS = 45000

const usage = `
Usage:
  node line-relay/relay.mjs --send

Options:
  --api-url <url>       Daily report package API. Default: ${DEFAULT_API_URL}
  --mark-sent-url <url> Sent callback API. Default: api-url with /mark-sent
  --date <YYYY-MM-DD>   Report date. Default: backend uses Taiwan today
  --generate <mode>     none, missing, or all. Default: ${DEFAULT_GENERATE_MODE}
  --secret <secret>     DAILY_REPORT_SHARED_SECRET. Env var also works
  --target <name>       Delivery target label for server records. Default: ${DEFAULT_TARGET}
  --operator <name>     Operator label for server records. Default: ${DEFAULT_OPERATOR}
  --line-app <name>     macOS app name. Default: ${DEFAULT_LINE_APP}
  --delay <ms>          Delay after each paste/send. Default: ${DEFAULT_DELAY_MS}
  --paste-delay <ms>    Delay between paste and Return. Default: ${DEFAULT_PASTE_DELAY_MS}
  --focus-delay <ms>    Time to click the LINE input after LINE activates. Default: ${DEFAULT_FOCUS_DELAY_MS}
  --paste-method <name> keycode, menu, or keystroke. Default: ${DEFAULT_PASTE_METHOD}
  --send-key <key>      enter, cmd-enter, or option-enter. Default: enter
  --send                Actually paste and press Return in LINE
  --item-ids <csv>      Only send selected package item ids. Default: all
  --combine-images      Queue selected images in one LINE message, then send once
  --draft               Paste selected package items without pressing Return
  --allow-resend        Send even if the server report status is already sent
  --auto                Fully automatic mode using fixed window/click coordinates
  --window-bounds x,y,w,h
                         Move LINE window before sending
  --room-click x,y      Optional click position for the target room
  --room-name <name>    Search and open a LINE room/community by name
  --no-open-room        Do not search/open room; only verify current room before pasting
  --search-mode <mode>  global-click, ax, keyboard, or click. Default: ${DEFAULT_SEARCH_MODE}
  --search-shortcut <s> cmd-shift-f, cmd-f, or cmd-k. Default: ${DEFAULT_SEARCH_SHORTCUT}
  --search-tab-count <n>
                         Press Tab n times after opening search. Default: ${DEFAULT_SEARCH_TAB_COUNT}
  --search-delay <ms>   Delay after typing room search. Default: ${DEFAULT_SEARCH_DELAY_MS}
  --search-box-click x,y
                         Optional click position for the search input
  --search-result-click x,y
                         Optional click position for the first search result
  --search-result-mode <mode>
                         field-click, ax, keyboard, or click. Default: ${DEFAULT_SEARCH_RESULT_MODE}
  --search-open-key <k> Keyboard result opener: enter, down-only, down-enter,
                         tab-enter, shift-tab-enter, tab-space, or cmd-down-enter.
                         Default: ${DEFAULT_SEARCH_OPEN_KEY}
  --search-result-offset <px>
                         Click this many pixels below the active search field.
                         Default: ${DEFAULT_SEARCH_RESULT_OFFSET}
  --search-result-layout x,y
                         Window-relative fallback point for first result.
                         Default: ${DEFAULT_SEARCH_RESULT_FALLBACK_X},${DEFAULT_SEARCH_RESULT_FALLBACK_Y}
  --search-result-steps <n>
                         Keyboard steps before opening result. Default: ${DEFAULT_SEARCH_RESULT_STEPS}
  --search-result-ratio x,y
                         Window-relative click ratio for first result. Default: ${DEFAULT_SEARCH_RESULT_X_RATIO},${DEFAULT_SEARCH_RESULT_Y_RATIO}
  --smart-room           Search candidates and use vision LLM to verify target room
  --smart-room-steps <n> Comma-separated Down-arrow counts. Default: ${DEFAULT_SMART_ROOM_STEPS}
  --verify-room          Verify current LINE room with vision LLM and exit
  --verify-before-send   Screenshot + vision guard before sending. Enabled by --smart-room
  --verify-delay <ms>    Delay before each verification screenshot. Default: ${DEFAULT_VERIFY_DELAY_MS}
  --verify-threshold <n> Minimum confidence 0-1. Default: ${DEFAULT_VERIFY_THRESHOLD}
  --vision-provider <p>  proxy, openrouter, or openai. Default: ${DEFAULT_VISION_PROVIDER}
  --vision-proxy-url <u> Vision proxy API. Default: api-url with /vision-verify
  --vision-model <model> Vision model. Default: ${DEFAULT_VISION_MODEL}
  --input-click x,y     Required by --auto. Click position for the message input
  --click-delay <ms>    Delay after coordinate clicks. Default: ${DEFAULT_CLICK_DELAY_MS}
  --no-mark-sent        Do not call mark-sent after a successful send
  --keep-files          Keep temporary downloaded image files
  --mouse-position      Print current mouse position for coordinate setup
  --mouse-position-delay <ms>
                         Wait before reading mouse position. Default: ${DEFAULT_MOUSE_POSITION_DELAY_MS}
  --dump-ui             Print LINE accessibility text fields/search fields
  --dump-ui-all         Print LINE accessibility roles with positions
  --test-room           Open search and paste the room name without pressing Enter
  --test-search-focus   Only open/focus LINE search. No paste, no Enter
  --test-room-open      Explicitly press Enter/click result after test-room search
  --test-message <text> Open the room and paste text without pressing Enter
  --test-send-message <text>
                         Smart-open verified room and actually send one test text
  --test-room-paste-only
                         Open search and paste the room name without pressing Enter
  --test-clicks         Move LINE/click configured coordinates without sending
  --test-paste          Paste one test message into LINE without pressing Return
  --dry-run             Fetch and download only. This is the default
  --help                Show this help

Before --send:
  1. Open LINE desktop on this Mac
  2. Click into the target LINE OpenChat/community room
  3. Put the cursor in the message input box
  4. Keep the Mac awake until the script finishes
`

const parseArgs = (argv) => {
  const options = {
    apiUrl: process.env.DAILY_REPORT_PACKAGE_URL || DEFAULT_API_URL,
    allowResend: process.env.LINE_RELAY_ALLOW_RESEND === '1' || process.env.LINE_RELAY_ALLOW_RESEND === 'true',
    auto: process.env.LINE_RELAY_AUTO === '1' || process.env.LINE_RELAY_AUTO === 'true',
    clickDelayMs: Number(process.env.LINE_RELAY_CLICK_DELAY_MS || DEFAULT_CLICK_DELAY_MS),
    combineImages: process.env.LINE_RELAY_COMBINE_IMAGES === '1' || process.env.LINE_RELAY_COMBINE_IMAGES === 'true',
    date: process.env.DAILY_REPORT_DATE || '',
    delayMs: Number(process.env.LINE_RELAY_DELAY_MS || DEFAULT_DELAY_MS),
    draft: process.env.LINE_RELAY_DRAFT === '1' || process.env.LINE_RELAY_DRAFT === 'true',
    dryRun: true,
    focusDelayMs: Number(process.env.LINE_RELAY_FOCUS_DELAY_MS || DEFAULT_FOCUS_DELAY_MS),
    generate: process.env.DAILY_REPORT_GENERATE || DEFAULT_GENERATE_MODE,
    keepFiles: process.env.LINE_RELAY_KEEP_FILES === '1' || process.env.LINE_RELAY_KEEP_FILES === 'true',
    lineApp: process.env.LINE_APP_NAME || DEFAULT_LINE_APP,
    markSent: process.env.LINE_RELAY_MARK_SENT !== '0' && process.env.LINE_RELAY_MARK_SENT !== 'false',
    markSentUrl: process.env.DAILY_REPORT_MARK_SENT_URL || '',
    mousePosition: false,
    mousePositionDelayMs: Number(process.env.LINE_RELAY_MOUSE_POSITION_DELAY_MS || DEFAULT_MOUSE_POSITION_DELAY_MS),
    openRouterAppName: process.env.OPENROUTER_APP_NAME || process.env.SITE_NAME || DEFAULT_OPENROUTER_APP_NAME,
    openRouterSiteUrl: process.env.OPENROUTER_SITE_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || DEFAULT_OPENROUTER_SITE_URL,
    operator: process.env.LINE_RELAY_OPERATOR || DEFAULT_OPERATOR,
    openRoom: process.env.LINE_RELAY_OPEN_ROOM !== '0' && process.env.LINE_RELAY_OPEN_ROOM !== 'false',
    pasteMethod: process.env.LINE_RELAY_PASTE_METHOD || DEFAULT_PASTE_METHOD,
    pasteDelayMs: Number(process.env.LINE_RELAY_PASTE_DELAY_MS || DEFAULT_PASTE_DELAY_MS),
    inputClick: process.env.LINE_RELAY_INPUT_CLICK || '',
    itemIds: process.env.LINE_RELAY_ITEM_IDS || '',
    roomClick: process.env.LINE_RELAY_ROOM_CLICK || '',
    roomName: process.env.LINE_RELAY_ROOM_NAME || '',
    searchBoxClick: process.env.LINE_RELAY_SEARCH_BOX_CLICK || '',
    secret: process.env.DAILY_REPORT_SHARED_SECRET || '',
    searchDelayMs: Number(process.env.LINE_RELAY_SEARCH_DELAY_MS || DEFAULT_SEARCH_DELAY_MS),
    searchMode: process.env.LINE_RELAY_SEARCH_MODE || DEFAULT_SEARCH_MODE,
    searchResultClick: process.env.LINE_RELAY_SEARCH_RESULT_CLICK || '',
    searchResultMode: process.env.LINE_RELAY_SEARCH_RESULT_MODE || DEFAULT_SEARCH_RESULT_MODE,
    searchOpenKey: process.env.LINE_RELAY_SEARCH_OPEN_KEY || DEFAULT_SEARCH_OPEN_KEY,
    searchResultOffset: Number(process.env.LINE_RELAY_SEARCH_RESULT_OFFSET || DEFAULT_SEARCH_RESULT_OFFSET),
    searchResultLayout: process.env.LINE_RELAY_SEARCH_RESULT_LAYOUT || `${DEFAULT_SEARCH_RESULT_FALLBACK_X},${DEFAULT_SEARCH_RESULT_FALLBACK_Y}`,
    searchResultRatio: process.env.LINE_RELAY_SEARCH_RESULT_RATIO || `${DEFAULT_SEARCH_RESULT_X_RATIO},${DEFAULT_SEARCH_RESULT_Y_RATIO}`,
    searchResultSteps: Number(process.env.LINE_RELAY_SEARCH_RESULT_STEPS || DEFAULT_SEARCH_RESULT_STEPS),
    searchShortcut: process.env.LINE_RELAY_SEARCH_SHORTCUT || DEFAULT_SEARCH_SHORTCUT,
    searchTabCount: Number(process.env.LINE_RELAY_SEARCH_TAB_COUNT || DEFAULT_SEARCH_TAB_COUNT),
    sendKey: process.env.LINE_RELAY_SEND_KEY || 'enter',
    smartRoom: process.env.LINE_RELAY_SMART_ROOM === '1' || process.env.LINE_RELAY_SMART_ROOM === 'true',
    smartRoomSteps: process.env.LINE_RELAY_SMART_ROOM_STEPS || DEFAULT_SMART_ROOM_STEPS,
    target: process.env.LINE_RELAY_TARGET || DEFAULT_TARGET,
    testClicks: false,
    dumpUi: false,
    dumpUiAll: false,
    testPaste: false,
    testMessage: '',
    testSendMessage: '',
    testRoomOpen: false,
    testRoomPasteOnly: false,
    testRoom: false,
    testSearchFocus: false,
    verifyBeforeSend: process.env.LINE_RELAY_VERIFY_BEFORE_SEND === '1' || process.env.LINE_RELAY_VERIFY_BEFORE_SEND === 'true',
    verifyDelayMs: Number(process.env.LINE_RELAY_VERIFY_DELAY_MS || DEFAULT_VERIFY_DELAY_MS),
    verifyRoom: false,
    verifyThreshold: Number(process.env.LINE_RELAY_VERIFY_THRESHOLD || DEFAULT_VERIFY_THRESHOLD),
    visionApiKey: process.env.LINE_RELAY_VISION_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    visionModel: process.env.LINE_RELAY_VISION_MODEL || DEFAULT_VISION_MODEL,
    visionProxyUrl: process.env.LINE_RELAY_VISION_PROXY_URL || '',
    visionProvider: String(process.env.LINE_RELAY_VISION_PROVIDER || DEFAULT_VISION_PROVIDER).toLowerCase(),
    windowBounds: process.env.LINE_RELAY_WINDOW_BOUNDS || '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--send') {
      options.dryRun = false
      continue
    }

    if (arg === '--draft') {
      options.draft = true
      options.dryRun = false
      options.markSent = false
      continue
    }

    if (arg === '--item-ids' && next) {
      options.itemIds = next
      index += 1
      continue
    }

    if (arg === '--combine-images') {
      options.combineImages = true
      continue
    }

    if (arg === '--allow-resend') {
      options.allowResend = true
      continue
    }

    if (arg === '--auto') {
      options.auto = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--mouse-position') {
      options.mousePosition = true
      continue
    }

    if (arg === '--dump-ui') {
      options.dumpUi = true
      continue
    }

    if (arg === '--dump-ui-all') {
      options.dumpUiAll = true
      continue
    }

    if (arg === '--mouse-position-delay' && next) {
      options.mousePositionDelayMs = Number(next)
      index += 1
      continue
    }

    if (arg === '--test-clicks') {
      options.testClicks = true
      continue
    }

    if (arg === '--no-open-room') {
      options.openRoom = false
      continue
    }

    if (arg === '--test-room') {
      options.testRoom = true
      continue
    }

    if (arg === '--test-search-focus') {
      options.testSearchFocus = true
      continue
    }

    if (arg === '--test-room-open') {
      options.testRoom = true
      options.testRoomOpen = true
      continue
    }

    if (arg === '--test-message' && next) {
      options.testMessage = next
      index += 1
      continue
    }

    if (arg === '--test-send-message' && next) {
      options.testSendMessage = next
      index += 1
      continue
    }

    if (arg === '--test-room-paste-only') {
      options.testRoom = true
      options.testRoomPasteOnly = true
      continue
    }

    if (arg === '--test-paste') {
      options.testPaste = true
      continue
    }

    if (arg === '--verify-room') {
      options.verifyRoom = true
      continue
    }

    if (arg === '--verify-before-send') {
      options.verifyBeforeSend = true
      continue
    }

    if (arg === '--smart-room') {
      options.smartRoom = true
      options.verifyBeforeSend = true
      continue
    }

    if (arg === '--no-mark-sent') {
      options.markSent = false
      continue
    }

    if (arg === '--keep-files') {
      options.keepFiles = true
      continue
    }

    if (arg === '--api-url' && next) {
      options.apiUrl = next
      index += 1
      continue
    }

    if (arg === '--mark-sent-url' && next) {
      options.markSentUrl = next
      index += 1
      continue
    }

    if (arg === '--date' && next) {
      options.date = next
      index += 1
      continue
    }

    if (arg === '--generate' && next) {
      options.generate = next
      index += 1
      continue
    }

    if (arg === '--secret' && next) {
      options.secret = next
      index += 1
      continue
    }

    if (arg === '--target' && next) {
      options.target = next
      index += 1
      continue
    }

    if (arg === '--operator' && next) {
      options.operator = next
      index += 1
      continue
    }

    if (arg === '--line-app' && next) {
      options.lineApp = next
      index += 1
      continue
    }

    if (arg === '--delay' && next) {
      options.delayMs = Number(next)
      index += 1
      continue
    }

    if (arg === '--click-delay' && next) {
      options.clickDelayMs = Number(next)
      index += 1
      continue
    }

    if (arg === '--paste-delay' && next) {
      options.pasteDelayMs = Number(next)
      index += 1
      continue
    }

    if (arg === '--paste-method' && next) {
      options.pasteMethod = next
      index += 1
      continue
    }

    if (arg === '--focus-delay' && next) {
      options.focusDelayMs = Number(next)
      index += 1
      continue
    }

    if (arg === '--send-key' && next) {
      options.sendKey = next
      index += 1
      continue
    }

    if (arg === '--smart-room-steps' && next) {
      options.smartRoomSteps = next
      index += 1
      continue
    }

    if (arg === '--verify-delay' && next) {
      options.verifyDelayMs = Number(next)
      index += 1
      continue
    }

    if (arg === '--verify-threshold' && next) {
      options.verifyThreshold = Number(next)
      index += 1
      continue
    }

    if (arg === '--vision-model' && next) {
      options.visionModel = next
      index += 1
      continue
    }

    if (arg === '--vision-proxy-url' && next) {
      options.visionProxyUrl = next
      index += 1
      continue
    }

    if (arg === '--vision-provider' && next) {
      options.visionProvider = String(next).toLowerCase()
      index += 1
      continue
    }

    if (arg === '--window-bounds' && next) {
      options.windowBounds = next
      index += 1
      continue
    }

    if (arg === '--room-click' && next) {
      options.roomClick = next
      index += 1
      continue
    }

    if (arg === '--room-name' && next) {
      options.roomName = next
      index += 1
      continue
    }

    if (arg === '--search-shortcut' && next) {
      options.searchShortcut = next
      index += 1
      continue
    }

    if (arg === '--search-tab-count' && next) {
      options.searchTabCount = Number(next)
      index += 1
      continue
    }

    if (arg === '--search-mode' && next) {
      options.searchMode = next
      index += 1
      continue
    }

    if (arg === '--search-delay' && next) {
      options.searchDelayMs = Number(next)
      index += 1
      continue
    }

    if (arg === '--search-box-click' && next) {
      options.searchBoxClick = next
      index += 1
      continue
    }

    if (arg === '--search-result-click' && next) {
      options.searchResultClick = next
      index += 1
      continue
    }

    if (arg === '--search-result-mode' && next) {
      options.searchResultMode = next
      index += 1
      continue
    }

    if (arg === '--search-open-key' && next) {
      options.searchOpenKey = next
      index += 1
      continue
    }

    if (arg === '--search-result-offset' && next) {
      options.searchResultOffset = Number(next)
      index += 1
      continue
    }

    if (arg === '--search-result-layout' && next) {
      options.searchResultLayout = next
      index += 1
      continue
    }

    if (arg === '--search-result-ratio' && next) {
      options.searchResultRatio = next
      index += 1
      continue
    }

    if (arg === '--search-result-steps' && next) {
      options.searchResultSteps = Number(next)
      index += 1
      continue
    }

    if (arg === '--input-click' && next) {
      options.inputClick = next
      index += 1
      continue
    }

    throw new Error(`Unknown or incomplete option: ${arg}`)
  }

  if (!['none', 'missing', 'all'].includes(options.generate)) {
    throw new Error('--generate must be one of: none, missing, all')
  }

  if (!Number.isFinite(options.delayMs) || options.delayMs < 300) {
    throw new Error('--delay must be a number greater than or equal to 300')
  }

  if (!Number.isFinite(options.clickDelayMs) || options.clickDelayMs < 100) {
    throw new Error('--click-delay must be a number greater than or equal to 100')
  }

  if (!Number.isFinite(options.searchDelayMs) || options.searchDelayMs < 300) {
    throw new Error('--search-delay must be a number greater than or equal to 300')
  }

  if (!Number.isInteger(options.searchTabCount) || options.searchTabCount < 0 || options.searchTabCount > 20) {
    throw new Error('--search-tab-count must be an integer between 0 and 20')
  }

  if (!Number.isInteger(options.searchResultSteps) || options.searchResultSteps < 0 || options.searchResultSteps > 20) {
    throw new Error('--search-result-steps must be an integer between 0 and 20')
  }

  if (!['field-click', 'ax', 'click', 'keyboard'].includes(options.searchResultMode)) {
    throw new Error('--search-result-mode must be one of: field-click, ax, click, keyboard')
  }

  if (!['enter', 'down-only', 'down-enter', 'tab-enter', 'shift-tab-enter', 'tab-space', 'cmd-down-enter'].includes(options.searchOpenKey)) {
    throw new Error('--search-open-key must be one of: enter, down-only, down-enter, tab-enter, shift-tab-enter, tab-space, cmd-down-enter')
  }

  if (!Number.isFinite(options.searchResultOffset) || options.searchResultOffset < 10 || options.searchResultOffset > 300) {
    throw new Error('--search-result-offset must be a number between 10 and 300')
  }

  if (!Number.isFinite(options.verifyDelayMs) || options.verifyDelayMs < 300) {
    throw new Error('--verify-delay must be a number greater than or equal to 300')
  }

  if (!Number.isFinite(options.verifyThreshold) || options.verifyThreshold < 0 || options.verifyThreshold > 1) {
    throw new Error('--verify-threshold must be a number between 0 and 1')
  }

  if (!['proxy', 'openrouter', 'openai'].includes(options.visionProvider)) {
    throw new Error('--vision-provider must be one of: proxy, openrouter, openai')
  }

  if (!Number.isFinite(options.mousePositionDelayMs) || options.mousePositionDelayMs < 0) {
    throw new Error('--mouse-position-delay must be a number greater than or equal to 0')
  }

  if (!Number.isFinite(options.pasteDelayMs) || options.pasteDelayMs < 100) {
    throw new Error('--paste-delay must be a number greater than or equal to 100')
  }

  if (!['keycode', 'menu', 'keystroke'].includes(options.pasteMethod)) {
    throw new Error('--paste-method must be one of: keycode, menu, keystroke')
  }

  if (!Number.isFinite(options.focusDelayMs) || options.focusDelayMs < 0) {
    throw new Error('--focus-delay must be a number greater than or equal to 0')
  }

  if (!['enter', 'cmd-enter', 'option-enter'].includes(options.sendKey)) {
    throw new Error('--send-key must be one of: enter, cmd-enter, option-enter')
  }

  if (!['global-click', 'ax', 'keyboard', 'click'].includes(options.searchMode)) {
    throw new Error('--search-mode must be one of: global-click, ax, keyboard, click')
  }

  if (!['cmd-shift-f', 'cmd-f', 'cmd-k'].includes(options.searchShortcut)) {
    throw new Error('--search-shortcut must be one of: cmd-shift-f, cmd-f, cmd-k')
  }

  if ((options.testRoom || options.testMessage || options.testSendMessage) && !options.roomName) {
    throw new Error('--test-room/--test-message/--test-send-message requires --room-name or LINE_RELAY_ROOM_NAME')
  }

  if ((options.verifyRoom || options.smartRoom || options.verifyBeforeSend || options.testSendMessage) && !options.roomName) {
    throw new Error('--verify-room/--smart-room/--verify-before-send/--test-send-message requires --room-name or LINE_RELAY_ROOM_NAME')
  }

  if (
    (options.verifyRoom || options.smartRoom || options.verifyBeforeSend || options.testSendMessage) &&
    options.visionProvider !== 'proxy' &&
    !options.visionApiKey
  ) {
    throw new Error('--verify-room/--smart-room/--test-send-message requires OPENROUTER_API_KEY, OPENAI_API_KEY, or LINE_RELAY_VISION_API_KEY')
  }

  return options
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const parseNumberList = ({ label, length, value }) => {
  const parts = String(value)
    .split(',')
    .map((part) => Number(part.trim()))

  if (parts.length !== length || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`${label} must use ${length === 2 ? 'x,y' : 'x,y,w,h'} format`)
  }

  return parts
}

const parsePoint = (value, label) => {
  if (!value) return null
  const [x, y] = parseNumberList({
    label,
    length: 2,
    value,
  })

  return {
    x,
    y,
  }
}

const parseRatio = (value, label) => {
  const [xRatio, yRatio] = parseNumberList({
    label,
    length: 2,
    value,
  })

  if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) {
    throw new Error(`${label} values must be between 0 and 1`)
  }

  return {
    xRatio,
    yRatio,
  }
}

const parseBounds = (value) => {
  if (!value) return null
  const [x, y, width, height] = parseNumberList({
    label: '--window-bounds',
    length: 4,
    value,
  })

  return {
    height,
    width,
    x,
    y,
  }
}

const parseIntegerSequence = (value, label) => {
  const steps = String(value)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part))

  if (!steps.length || steps.some((step) => !Number.isInteger(step) || step < 0 || step > 20)) {
    throw new Error(`${label} must be a comma-separated list of integers between 0 and 20`)
  }

  return [...new Set(steps)]
}

const parseCsvSet = (value) => {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return new Set(items)
}

const filterPackageItems = ({ itemIds, sharePackage }) => {
  if (!itemIds.size) return sharePackage

  const filteredItems = sharePackage.items.filter((item) => itemIds.has(item.id))
  const missing = [...itemIds].filter((id) => !sharePackage.items.some((item) => item.id === id))

  if (missing.length) {
    throw new Error(`Selected package item id not found: ${missing.join(', ')}`)
  }

  if (!filteredItems.length) {
    throw new Error('No package items selected')
  }

  return {
    ...sharePackage,
    errorLogs: [],
    items: filteredItems,
    missing: [],
    missingItemIds: [],
    ready: true,
    status: sharePackage.status === 'sent' ? 'sent' : 'generated',
  }
}

const getPackageUrl = ({ apiUrl, date, generate }) => {
  const url = new URL(apiUrl)
  url.searchParams.set('generate', generate)
  if (date) url.searchParams.set('date', date)

  return url
}

const loadSharePackage = async ({ itemIds, options }) => {
  const packageUrl = getPackageUrl(options)
  const body = await fetchJson({
    secret: options.secret,
    url: packageUrl,
  })
  if (!body.package?.items?.length) {
    throw new Error('Package API response is missing package.items')
  }

  return filterPackageItems({
    itemIds,
    sharePackage: body.package,
  })
}

const describePackageFailure = (sharePackage) => {
  const lines = []
  if (!sharePackage.ready) lines.push('Package is not ready.')
  if (sharePackage.status === 'failed') lines.push('Package status is failed.')
  if (sharePackage.missing?.length) lines.push(`Missing: ${sharePackage.missing.join(', ')}`)
  if (sharePackage.errorLogs?.length) {
    for (const errorLog of sharePackage.errorLogs) {
      lines.push(`${errorLog.scope || 'error'}: ${errorLog.message || 'unknown error'}`)
    }
  }

  return lines.join('\n') || 'Package is not ready.'
}

const getMarkSentUrl = ({ apiUrl, markSentUrl }) => {
  if (markSentUrl) return new URL(markSentUrl)

  const url = new URL(apiUrl)
  url.pathname = url.pathname.replace(/\/package\/?$/, '/mark-sent')

  return url
}

const getVisionProxyUrl = ({ apiUrl, visionProxyUrl }) => {
  if (visionProxyUrl) return new URL(visionProxyUrl)

  const url = new URL(apiUrl || DEFAULT_API_URL)
  url.pathname = url.pathname.replace(/\/package\/?$/, '/vision-verify')
  url.search = ''

  return url
}

const requestBuffer = ({ body, headers = {}, method = 'GET', timeoutMs = DEFAULT_HTTP_TIMEOUT_MS, url }) => {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : http
    const requestHeaders = {
      ...headers,
    }

    if (body) requestHeaders['content-length'] = Buffer.byteLength(body)

    const request = client.request(
      parsedUrl,
      {
        headers: requestHeaders,
        method,
      },
      (response) => {
        const chunks = []

        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: response.headers,
            statusCode: response.statusCode || 0,
          })
        })
      },
    )

    request.on('error', reject)
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`))
    })
    request.end(body)
  })
}

const fetchJson = async ({ secret, url }) => {
  const headers = {}
  if (secret) headers['x-daily-report-secret'] = secret
  if (isLocalUrl(url)) headers['x-daily-report-dev-relay'] = '1'

  const response = await requestBuffer({
    headers,
    url,
  })
  const bodyText = response.body.toString('utf8')
  let body

  try {
    body = JSON.parse(bodyText)
  } catch {
    throw new Error(`Package API returned non-JSON response (${response.status}): ${bodyText.slice(0, 240)}`)
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401) {
      throw new Error(
        'Package API returned Unauthorized. For localhost, restart the Next dev server so it picks up the latest route. For production, pass --secret or set DAILY_REPORT_SHARED_SECRET.',
      )
    }

    throw new Error(body?.error || `Package API failed with status ${response.statusCode}`)
  }

  return body
}

const postJson = async ({ body, secret, url }) => {
  const headers = {
    'content-type': 'application/json',
  }
  if (secret) headers['x-daily-report-secret'] = secret
  if (isLocalUrl(url)) headers['x-daily-report-dev-relay'] = '1'

  const response = await requestBuffer({
    body: JSON.stringify(body),
    headers,
    method: 'POST',
    url,
  })
  const bodyText = response.body.toString('utf8')
  let responseBody = {}

  if (bodyText) {
    try {
      responseBody = JSON.parse(bodyText)
    } catch {
      throw new Error(`API returned non-JSON response (${response.statusCode}): ${bodyText.slice(0, 240)}`)
    }
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(responseBody?.error || `API failed with status ${response.statusCode}`)
  }

  return responseBody
}

const postOpenAiJson = async ({ apiKey, body }) => {
  const response = await requestBuffer({
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    url: 'https://api.openai.com/v1/responses',
  })
  const bodyText = response.body.toString('utf8')
  let responseBody = {}

  try {
    responseBody = JSON.parse(bodyText)
  } catch {
    throw new Error(`OpenAI returned non-JSON response (${response.statusCode}): ${bodyText.slice(0, 240)}`)
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(responseBody?.error?.message || `OpenAI API failed with status ${response.statusCode}`)
  }

  return responseBody
}

const postOpenRouterJson = async ({ apiKey, appName, body, siteUrl }) => {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  if (siteUrl) headers['HTTP-Referer'] = siteUrl
  if (appName) headers['X-Title'] = appName

  const response = await requestBuffer({
    body: JSON.stringify(body),
    headers,
    method: 'POST',
    url: 'https://openrouter.ai/api/v1/chat/completions',
  })
  const bodyText = response.body.toString('utf8')
  let responseBody = {}

  try {
    responseBody = JSON.parse(bodyText)
  } catch {
    throw new Error(`OpenRouter returned non-JSON response (${response.statusCode}): ${bodyText.slice(0, 240)}`)
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(responseBody?.error?.message || `OpenRouter API failed with status ${response.statusCode}`)
  }

  return responseBody
}

const extractOpenAiText = (responseBody) => {
  if (typeof responseBody.output_text === 'string') return responseBody.output_text

  const chunks = []
  for (const output of responseBody.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text)
    }
  }

  return chunks.join('\n')
}

const extractOpenRouterText = (responseBody) => {
  const content = responseBody?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || '')
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

const stripJsonFence = (text) => {
  const trimmed = String(text || '').trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : trimmed
}

const roomVerificationSchema = {
  additionalProperties: false,
  properties: {
    confidence: {
      maximum: 1,
      minimum: 0,
      type: 'number',
    },
    isTargetRoomOpen: {
      type: 'boolean',
    },
    reason: {
      type: 'string',
    },
    screenState: {
      enum: ['target_room', 'wrong_room', 'search_results', 'unknown'],
      type: 'string',
    },
    visibleRoomName: {
      type: 'string',
    },
  },
  required: ['isTargetRoomOpen', 'visibleRoomName', 'confidence', 'reason', 'screenState'],
  type: 'object',
}

const normalizeRoomName = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .replace(/[()（）,，]/g, '')
    .trim()

const visibleRoomNameMatchesTarget = ({ roomName, visibleRoomName }) => {
  const target = normalizeRoomName(roomName)
  const visible = normalizeRoomName(visibleRoomName)

  return Boolean(target && visible && visible.includes(target))
}

const captureScreenshot = async ({ directory, label = 'line-room' }) => {
  await mkdir(directory, {
    recursive: true,
  })

  const path = join(directory, `${safeFilename(label)}-${Date.now()}.png`)
  await execFileAsync('screencapture', ['-x', path])

  return path
}

const verifyCurrentRoom = async ({
  apiUrl,
  directory,
  lineApp,
  openRouterAppName,
  openRouterSiteUrl,
  roomName,
  secret,
  threshold,
  verifyDelayMs,
  visionApiKey,
  visionModel,
  visionProvider,
  visionProxyUrl,
}) => {
  await activateLine(lineApp)
  await sleep(verifyDelayMs)

  const accessibilityVerification = await detectTargetRoomByAccessibility({
    lineApp,
    roomName,
  })
  if (accessibilityVerification) {
    return {
      ...accessibilityVerification,
      screenshotPath: '',
    }
  }

  const screenshotPath = await captureScreenshot({
    directory,
    label: 'line-room-verify',
  })
  const imageBytes = await readFile(screenshotPath)
  const imageBase64 = imageBytes.toString('base64')
  const prompt = [
    `Target LINE room/community name: ${roomName}`,
    '',
    'Look only at the current LINE desktop screenshot.',
    'Return isTargetRoomOpen=true only when the RIGHT chat panel is open to the target room/community.',
    'The strongest evidence is the right panel header/title matching the target room name.',
    'Do not mark true only because the target appears in the left search field or left search results.',
    'If the app is still showing search results, a wrong chat, or anything ambiguous, return false.',
    '',
    'Return only JSON with this exact shape:',
    '{"isTargetRoomOpen":boolean,"visibleRoomName":string,"confidence":number,"reason":string,"screenState":"target_room|wrong_room|search_results|unknown"}',
  ].join('\n')

  let verification
  let responseText = ''

  if (visionProvider === 'proxy') {
    const responseBody = await postJson({
      body: {
        imageBase64,
        model: visionModel,
        roomName,
      },
      secret,
      url: getVisionProxyUrl({
        apiUrl,
        visionProxyUrl,
      }),
    })
    verification = responseBody.verification || responseBody
  } else if (visionProvider === 'openrouter') {
    const responseBody = await postOpenRouterJson({
      apiKey: visionApiKey,
      appName: openRouterAppName,
      siteUrl: openRouterSiteUrl,
      body: {
        messages: [
          {
            content: [
              {
                text: prompt,
                type: 'text',
              },
              {
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                },
                type: 'image_url',
              },
            ],
            role: 'user',
          },
        ],
        model: visionModel,
        response_format: {
          type: 'json_object',
        },
        temperature: 0,
      },
    })
    responseText = extractOpenRouterText(responseBody)
  } else {
    const responseBody = await postOpenAiJson({
      apiKey: visionApiKey,
      body: {
        input: [
          {
            content: [
              {
                text: prompt,
                type: 'input_text',
              },
              {
                detail: 'low',
                image_url: `data:image/png;base64,${imageBase64}`,
                type: 'input_image',
              },
            ],
            role: 'user',
          },
        ],
        model: visionModel,
        text: {
          format: {
            name: 'line_room_verification',
            schema: roomVerificationSchema,
            strict: true,
            type: 'json_schema',
          },
        },
      },
    })
    responseText = extractOpenAiText(responseBody)
  }

  if (!verification) {
    try {
      verification = JSON.parse(stripJsonFence(responseText))
    } catch {
      throw new Error(`${visionProvider} room verification returned non-JSON text: ${responseText.slice(0, 240)}`)
    }
  }

  const confidence = Number(verification.confidence || 0)
  const matchedVisibleRoomName = visibleRoomNameMatchesTarget({
    roomName,
    visibleRoomName: verification.visibleRoomName,
  })
  const screenState = String(verification.screenState || '')
  const passed =
    Boolean(verification.isTargetRoomOpen) &&
    confidence >= threshold &&
    matchedVisibleRoomName &&
    screenState === 'target_room'

  return {
    ...verification,
    isTargetRoomOpen: Boolean(verification.isTargetRoomOpen),
    passed,
    reason: verification.reason,
    screenshotPath,
  }
}

const isLocalUrl = (url) => {
  const hostname = new URL(url).hostname

  return ['localhost', '127.0.0.1', '::1'].includes(hostname)
}

const safeFilename = (value) => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')

const extensionFor = ({ item, response }) => {
  const fromUrl = extname(new URL(item.url).pathname)
  if (fromUrl) return fromUrl

  const contentType = String(response.headers['content-type'] || item.mimeType || '')
  if (contentType.includes('jpeg')) return '.jpg'
  if (contentType.includes('png')) return '.png'

  return '.img'
}

const downloadImage = async ({ directory, item }) => {
  const response = await requestBuffer({
    url: item.url,
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Failed to download ${item.label}: ${response.statusCode}`)
  }

  const bytes = response.body
  const extension = extensionFor({
    item,
    response,
  })
  const filename = `${safeFilename(item.id || item.label)}${extension}`
  const path = join(directory, filename)

  await writeFile(path, bytes)

  const clipboardPath = join(directory, `${safeFilename(`${item.id || item.label}-clipboard`)}.png`)
  let clipboardMimeType = 'image/png'
  let effectiveClipboardPath = path

  try {
    await execFileAsync('/usr/bin/sips', ['-s', 'format', 'png', path, '--out', clipboardPath])
    effectiveClipboardPath = clipboardPath
  } catch {
    clipboardMimeType = item.mimeType || String(response.headers['content-type'] || '')
  }

  return {
    ...item,
    clipboardMimeType,
    clipboardPath: effectiveClipboardPath,
    path,
    size: bytes.length,
  }
}

const downloadImages = async ({ directory, imageItems }) => {
  const downloadedImages = []

  for (const [index, item] of imageItems.entries()) {
    console.log(`Downloading image ${index + 1}/${imageItems.length}: ${item.label}`)
    downloadedImages.push(await downloadImage({
      directory,
      item,
    }))
  }

  return downloadedImages
}

const osascript = async (script) => {
  await execFileAsync('osascript', ['-e', script])
}

const writeToCommandStdin = (command, args, input) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr}` : ''}`))
    })
    child.stdin.end(input)
  })
}

const setTextClipboard = async (text) => {
  await writeToCommandStdin('pbcopy', [], text)
}

const setImageClipboard = async (path, mimeType = '') => {
  const escapedPath = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const clipboardClass = mimeType.includes('jpeg') || path.toLowerCase().endsWith('.jpg') ? 'JPEG picture' : '«class PNGf»'

  await osascript(`
set the clipboard to ""
delay 0.2
set the clipboard to (read (POSIX file "${escapedPath}") as ${clipboardClass})
`)
}

const activateLine = async (lineApp) => {
  const escapedApp = lineApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escapedProcess = processName(lineApp)

  await osascript(`
tell application "${escapedApp}" to activate
delay 0.3
tell application "System Events"
  tell process "${escapedProcess}"
    set frontmost to true
    try
      set visible to true
    end try
    try
      repeat with windowRef in windows
        try
          set value of attribute "AXMinimized" of windowRef to false
        end try
        try
          perform action "AXRaise" of windowRef
        end try
        exit repeat
      end repeat
    end try
  end tell
end tell
delay 0.2
`)
}

const processName = (lineApp) => lineApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const detectTargetRoomByAccessibility = async ({ lineApp, roomName }) => {
  if (!roomName) return null

  const escapedApp = lineApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escapedProcess = processName(lineApp)
  const escapedRoomName = escapeAppleScriptText(roomName)

  try {
    const { stdout } = await execFileAsync('osascript', [
      '-e',
      `tell application "${escapedApp}" to activate`,
      '-e',
      'delay 0.2',
      '-e',
      `tell application "System Events" to tell process "${escapedProcess}"`,
      '-e',
      'set frontmost to true',
      '-e',
      `set targetText to "${escapedRoomName}"`,
      '-e',
      'set windowPosition to position of window 1',
      '-e',
      'set windowSize to size of window 1',
      '-e',
      'set minRightX to (item 1 of windowPosition) + ((item 1 of windowSize) * 0.35)',
      '-e',
      'set maxHeaderY to (item 2 of windowPosition) + 190',
      '-e',
      'repeat with itemRef in entire contents of window 1',
      '-e',
      'try',
      '-e',
      'set itemRole to role of itemRef as text',
      '-e',
      'set itemName to ""',
      '-e',
      'set itemDescription to ""',
      '-e',
      'set itemTitle to ""',
      '-e',
      'set itemValue to ""',
      '-e',
      'try',
      '-e',
      'set itemName to name of itemRef as text',
      '-e',
      'end try',
      '-e',
      'try',
      '-e',
      'set itemDescription to description of itemRef as text',
      '-e',
      'end try',
      '-e',
      'try',
      '-e',
      'set itemTitle to title of itemRef as text',
      '-e',
      'end try',
      '-e',
      'try',
      '-e',
      'set itemValue to value of itemRef as text',
      '-e',
      'end try',
      '-e',
      'set combinedText to itemName & " " & itemDescription & " " & itemTitle & " " & itemValue',
      '-e',
      'if combinedText contains targetText then',
      '-e',
      'set itemPosition to position of itemRef',
      '-e',
      'set itemSize to size of itemRef',
      '-e',
      'set itemX to item 1 of itemPosition',
      '-e',
      'set itemY to item 2 of itemPosition',
      '-e',
      'set itemW to item 1 of itemSize',
      '-e',
      'if itemX > minRightX and itemY < maxHeaderY and itemW > 30 then return "MATCH|" & combinedText',
      '-e',
      'end if',
      '-e',
      'end try',
      '-e',
      'end repeat',
      '-e',
      'return "MISS|"',
      '-e',
      'end tell',
    ])

    const result = stdout.trim()
    if (!result.startsWith('MATCH|')) return null

    return {
      confidence: 1,
      isTargetRoomOpen: true,
      passed: true,
      reason: 'Accessibility matched the target room name in the right chat header.',
      screenState: 'target_room',
      visibleRoomName: roomName,
    }
  } catch {
    return null
  }
}

const printMousePosition = async () => {
  const { stdout } = await execFileAsync('osascript', [
    '-e',
    'use framework "AppKit"',
    '-e',
    "set p to current application's NSEvent's mouseLocation()",
    '-e',
    "set screens to current application's NSScreen's screens()",
    '-e',
    "if (screens's |count|()) is greater than 0 then set screenFrame to (screens's objectAtIndex:0)'s frame()",
    '-e',
    "if (screens's |count|()) is greater than 0 then set screenHeight to current application's NSHeight(screenFrame)",
    '-e',
    "if (screens's |count|()) is greater than 0 then return (((p's x) as integer) as text) & \",\" & (((screenHeight - (p's y)) as integer) as text)",
    '-e',
    "return (((p's x) as integer) as text) & \",\" & (((p's y) as integer) as text)",
  ])

  console.log(stdout.trim())
}

const dumpLineUi = async (lineApp) => {
  const escapedProcess = processName(lineApp)

  const { stdout } = await execFileAsync('osascript', [
    '-e',
    `tell application "${lineApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" to activate`,
    '-e',
    'delay 0.5',
    '-e',
    `tell application "System Events" to tell process "${escapedProcess}"`,
    '-e',
    'set output to ""',
    '-e',
    'repeat with itemRef in entire contents of window 1',
    '-e',
    'try',
    '-e',
    'set itemRole to role of itemRef as text',
    '-e',
    'if itemRole is "AXTextField" or itemRole is "AXSearchField" or itemRole is "AXTextArea" or itemRole is "AXButton" then',
    '-e',
    'set itemDescription to ""',
    '-e',
    'set itemTitle to ""',
    '-e',
    'set itemValue to ""',
    '-e',
    'try',
    '-e',
    'set itemDescription to description of itemRef as text',
    '-e',
    'end try',
    '-e',
    'try',
    '-e',
    'set itemTitle to title of itemRef as text',
    '-e',
    'end try',
    '-e',
    'try',
    '-e',
    'set itemValue to value of itemRef as text',
    '-e',
    'end try',
    '-e',
    'set output to output & itemRole & " | title=" & itemTitle & " | description=" & itemDescription & " | value=" & itemValue & linefeed',
    '-e',
    'end if',
    '-e',
    'end try',
    '-e',
    'end repeat',
    '-e',
    'return output',
    '-e',
    'end tell',
  ])

  console.log(stdout.trim() || 'No text/search fields exposed by LINE accessibility tree.')
}

const dumpLineUiAll = async (lineApp) => {
  const escapedProcess = processName(lineApp)

  const { stdout } = await execFileAsync('osascript', [
    '-e',
    `tell application "${lineApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" to activate`,
    '-e',
    'delay 0.5',
    '-e',
    `tell application "System Events" to tell process "${escapedProcess}"`,
    '-e',
    'set output to ""',
    '-e',
    'set counter to 0',
    '-e',
    'repeat with itemRef in entire contents of window 1',
    '-e',
    'try',
    '-e',
    'set counter to counter + 1',
    '-e',
    'if counter is greater than 260 then exit repeat',
    '-e',
    'set itemRole to role of itemRef as text',
    '-e',
    'set itemDescription to ""',
    '-e',
    'set itemTitle to ""',
    '-e',
    'set itemValue to ""',
    '-e',
    'set itemPosition to ""',
    '-e',
    'set itemSize to ""',
    '-e',
    'try',
    '-e',
    'set itemDescription to description of itemRef as text',
    '-e',
    'end try',
    '-e',
    'try',
    '-e',
    'set itemTitle to title of itemRef as text',
    '-e',
    'end try',
    '-e',
    'try',
    '-e',
    'set itemValue to value of itemRef as text',
    '-e',
    'end try',
    '-e',
    'try',
    '-e',
    'set p to position of itemRef',
    '-e',
    'set itemPosition to ((item 1 of p) as integer as text) & "," & ((item 2 of p) as integer as text)',
    '-e',
    'end try',
    '-e',
    'try',
    '-e',
    'set s to size of itemRef',
    '-e',
    'set itemSize to ((item 1 of s) as integer as text) & "x" & ((item 2 of s) as integer as text)',
    '-e',
    'end try',
    '-e',
    'set output to output & counter & " | " & itemRole & " | pos=" & itemPosition & " | size=" & itemSize & " | title=" & itemTitle & " | description=" & itemDescription & " | value=" & itemValue & linefeed',
    '-e',
    'end try',
    '-e',
    'end repeat',
    '-e',
    'return output',
    '-e',
    'end tell',
  ])

  console.log(stdout.trim() || 'No LINE accessibility elements found.')
}

const setLineWindowBounds = async ({ bounds, lineApp }) => {
  if (!bounds) return

  const escapedProcess = processName(lineApp)

  await osascript(`
tell application "System Events"
  tell process "${escapedProcess}"
    set frontmost to true
    try
      set value of attribute "AXMinimized" of window 1 to false
    end try
    set position of window 1 to {${bounds.x}, ${bounds.y}}
    set size of window 1 to {${bounds.width}, ${bounds.height}}
    try
      perform action "AXRaise" of window 1
    end try
  end tell
end tell
`)
}

const clickAt = async ({ label, lineApp, point }) => {
  if (!point) return

  const escapedProcess = processName(lineApp)

  await osascript(`
tell application "System Events"
  tell process "${escapedProcess}" to set frontmost to true
  click at {${point.x}, ${point.y}}
end tell
`)
  console.log(`Clicked ${label} at ${point.x},${point.y}`)
}

const focusLineMessageInput = async ({ lineApp }) => {
  const escapedProcess = processName(lineApp)

  await osascript(`
tell application "System Events"
  tell process "${escapedProcess}"
    set frontmost to true
    set targetField to missing value
    set bestY to 0
    try
      set windowPosition to position of window 1
      set windowSize to size of window 1
      set minX to (item 1 of windowPosition) + ((item 1 of windowSize) * 0.35)
      set minY to (item 2 of windowPosition) + ((item 2 of windowSize) * 0.55)
      repeat with itemRef in entire contents of window 1
        try
          set itemRole to role of itemRef as text
          if itemRole is "AXTextArea" or itemRole is "AXTextField" then
            set itemPosition to position of itemRef
            set itemSize to size of itemRef
            set itemX to item 1 of itemPosition
            set itemY to item 2 of itemPosition
            set itemW to item 1 of itemSize
            set itemH to item 2 of itemSize
            if itemX > minX and itemY > minY and itemW > 80 and itemH > 18 and itemY > bestY then
              set targetField to itemRef
              set bestY to itemY
            end if
          end if
        end try
      end repeat
      if targetField is not missing value then
        try
          set focused of targetField to true
        end try
        set itemPosition to position of targetField
        set itemSize to size of targetField
        set clickX to ((item 1 of itemPosition) + ((item 1 of itemSize) / 2)) as integer
        set clickY to ((item 2 of itemPosition) + ((item 2 of itemSize) / 2)) as integer
        click at {clickX, clickY}
        return
      end if
      set fallbackX to ((item 1 of windowPosition) + ((item 1 of windowSize) * 0.62)) as integer
      set fallbackY to ((item 2 of windowPosition) + ((item 2 of windowSize) * 0.94)) as integer
      click at {fallbackX, fallbackY}
      return
    end try
    key code 53
  end tell
end tell
`)
  await sleep(300)
}

const clickWindowRelative = async ({ label, lineApp, xRatio, yRatio }) => {
  const escapedProcess = processName(lineApp)

  await osascript(`
tell application "System Events"
  tell process "${escapedProcess}"
    set frontmost to true
    set windowPosition to position of window 1
    set windowSize to size of window 1
    set clickX to ((item 1 of windowPosition) + ((item 1 of windowSize) * ${xRatio})) as integer
    set clickY to ((item 2 of windowPosition) + ((item 2 of windowSize) * ${yRatio})) as integer
    click at {clickX, clickY}
  end tell
end tell
`)
  console.log(`Clicked ${label} by window ratio ${xRatio},${yRatio}`)
}

const escapeAppleScriptText = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const clickSearchResultByAccessibility = async ({ lineApp, roomName }) => {
  const escapedProcess = processName(lineApp)
  const escapedRoomName = escapeAppleScriptText(roomName)

  await osascript(`
tell application "System Events"
  tell process "${escapedProcess}"
    set frontmost to true
    set targetItem to missing value
    set targetText to "${escapedRoomName}"
    repeat with itemRef in entire contents of window 1
      try
        set itemRole to role of itemRef as text
        set itemName to ""
        set itemDescription to ""
        set itemTitle to ""
        set itemValue to ""
        try
          set itemName to name of itemRef as text
        end try
        try
          set itemDescription to description of itemRef as text
        end try
        try
          set itemTitle to title of itemRef as text
        end try
        try
          set itemValue to value of itemRef as text
        end try
        set combinedText to itemName & " " & itemDescription & " " & itemTitle & " " & itemValue
        if combinedText contains targetText and itemRole is not "AXSearchField" and itemRole is not "AXTextField" then
          set targetItem to itemRef
          if itemRole is "AXButton" or itemRole is "AXRow" or itemRole is "AXGroup" or itemRole is "AXStaticText" then exit repeat
        end if
      end try
    end repeat
    if targetItem is missing value then error "No LINE search result found through Accessibility for: ${escapedRoomName}"
    try
      perform action "AXPress" of targetItem
    on error
      try
        click targetItem
      on error
        set itemPosition to position of targetItem
        set itemSize to size of targetItem
        set clickX to ((item 1 of itemPosition) + ((item 1 of itemSize) / 2)) as integer
        set clickY to ((item 2 of itemPosition) + ((item 2 of itemSize) / 2)) as integer
        click at {clickX, clickY}
      end try
    end try
  end tell
end tell
`)
  console.log(`Opened search result through Accessibility: ${roomName}`)
}

const clickSearchResultBelowField = async ({ lineApp, roomName, searchResultLayout, searchResultOffset }) => {
  const escapedProcess = processName(lineApp)
  const escapedRoomName = escapeAppleScriptText(roomName)

  await osascript(`
tell application "System Events"
  tell process "${escapedProcess}"
    set frontmost to true
    set targetField to missing value
    set targetText to "${escapedRoomName}"
    repeat with itemRef in entire contents of window 1
      try
        set itemRole to role of itemRef as text
        if itemRole is "AXSearchField" or itemRole is "AXTextField" then
          set itemValue to ""
          set itemName to ""
          try
            set itemValue to value of itemRef as text
          end try
          try
            set itemName to name of itemRef as text
          end try
          if itemValue contains targetText or itemName contains targetText then
            set targetField to itemRef
            exit repeat
          end if
          if targetField is missing value then set targetField to itemRef
        end if
      end try
    end repeat
    if targetField is missing value then
      set windowPosition to position of window 1
      set clickX to ((item 1 of windowPosition) + ${searchResultLayout.x}) as integer
      set clickY to ((item 2 of windowPosition) + ${searchResultLayout.y}) as integer
    else
      set fieldPosition to position of targetField
      set fieldSize to size of targetField
      set clickX to ((item 1 of fieldPosition) + ((item 1 of fieldSize) / 2)) as integer
      set clickY to ((item 2 of fieldPosition) + (item 2 of fieldSize) + ${searchResultOffset}) as integer
    end if
    click at {clickX, clickY}
  end tell
end tell
`)
  console.log(`Clicked first visible LINE search result: ${roomName}`)
}

const keyboardOpenSearchResultScript = ({ searchOpenKey, searchResultSteps }) => {
  const repeatCount = Math.max(1, searchResultSteps || 1)

  if (searchOpenKey === 'down-enter') {
    return `
repeat ${searchResultSteps} times
  key code 125
  delay 0.1
end repeat
key code 36`
  }

  if (searchOpenKey === 'down-only') {
    return `
repeat ${searchResultSteps} times
  key code 125
  delay 0.1
end repeat`
  }

  if (searchOpenKey === 'tab-enter') {
    return `
repeat ${repeatCount} times
  key code 48
  delay 0.1
end repeat
key code 36`
  }

  if (searchOpenKey === 'shift-tab-enter') {
    return `
repeat ${repeatCount} times
  key code 48 using shift down
  delay 0.1
end repeat
key code 36`
  }

  if (searchOpenKey === 'tab-space') {
    return `
repeat ${repeatCount} times
  key code 48
  delay 0.1
end repeat
key code 49`
  }

  if (searchOpenKey === 'cmd-down-enter') {
    return `
key code 125 using command down
delay 0.1
key code 36`
  }

  return 'key code 36'
}

const openSearchResult = async ({
  lineApp,
  roomName,
  searchOpenKey,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
}) => {
  if (searchResultClick) {
    await clickAt({
      label: 'search result',
      lineApp,
      point: searchResultClick,
    })
    return
  }

  if (searchResultMode === 'ax') {
    await clickSearchResultByAccessibility({
      lineApp,
      roomName,
    })
    return
  }

  if (searchResultMode === 'field-click') {
    await clickSearchResultBelowField({
      lineApp,
      roomName,
      searchResultLayout,
      searchResultOffset,
    })
    return
  }

  if (searchResultMode === 'click') {
    await clickWindowRelative({
      label: 'first search result',
      lineApp,
      xRatio: searchResultRatio.xRatio,
      yRatio: searchResultRatio.yRatio,
    })
    return
  }

  await osascript(`
tell application "System Events"
  ${keyboardOpenSearchResultScript({
    searchOpenKey,
    searchResultSteps,
  })}
end tell
`)
}

const pressTab = async (count) => {
  if (!count) return

  await osascript(`
tell application "System Events"
  repeat ${count} times
    key code 48
    delay 0.1
  end repeat
end tell
`)
}

const pressDown = async (count) => {
  if (!count) return

  await osascript(`
tell application "System Events"
  repeat ${count} times
    key code 125
    delay 0.1
  end repeat
end tell
`)
}

const searchShortcutKey = (searchShortcut) => {
  if (searchShortcut === 'cmd-k') return 'k'

  return 'f'
}

const searchShortcutScript = (searchShortcut) => {
  if (searchShortcut === 'cmd-shift-f') return 'key code 3 using {command down, shift down}'
  if (searchShortcut === 'cmd-k') return 'key code 40 using command down'

  return 'key code 3 using command down'
}

const searchRoomByAccessibility = async ({
  clickDelayMs,
  lineApp,
  roomName,
  searchDelayMs,
  searchOpenKey,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
  searchShortcut,
  submitSearch = true,
}) => {
  const escapedApp = lineApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escapedProcess = processName(lineApp)
  const escapedRoomName = escapeAppleScriptText(roomName)

  await setTextClipboard(roomName)
  await osascript(`
tell application "${escapedApp}" to activate
delay 0.3
tell application "System Events"
  tell process "${escapedProcess}" to set frontmost to true
  ${searchShortcutScript(searchShortcut)}
  delay ${clickDelayMs / 1000}
  tell process "${escapedProcess}"
    set targetText to "${escapedRoomName}"
    set targetField to missing value
    set windowPosition to position of window 1
    set windowSize to size of window 1
    set maxSearchX to (item 1 of windowPosition) + ((item 1 of windowSize) * 0.45)
    set maxSearchY to (item 2 of windowPosition) + 240
    repeat with itemRef in entire contents of window 1
      try
        set itemRole to role of itemRef as text
        set itemPosition to position of itemRef
        set itemSize to size of itemRef
        set itemX to item 1 of itemPosition
        set itemY to item 2 of itemPosition
        set itemW to item 1 of itemSize
        if (itemRole is "AXSearchField" or itemRole is "AXTextField") and itemX < maxSearchX and itemY < maxSearchY and itemW > 120 then
          set targetField to itemRef
          exit repeat
        end if
      end try
    end repeat
    if targetField is missing value then
      repeat with itemRef in entire contents of window 1
        try
          set itemRole to role of itemRef as text
          set itemName to ""
          set itemDescription to ""
          set itemHelp to ""
          try
            set itemName to name of itemRef as text
          end try
          try
            set itemDescription to description of itemRef as text
          end try
          try
            set itemHelp to help of itemRef as text
          end try
          set combinedText to itemName & " " & itemDescription & " " & itemHelp
          if itemRole is "AXButton" and (combinedText contains "Search" or combinedText contains "search" or combinedText contains "搜尋" or combinedText contains "搜索") then
            click itemRef
            exit repeat
          end if
        end try
      end repeat
      delay ${clickDelayMs / 1000}
      repeat with itemRef in entire contents of window 1
        try
          set itemRole to role of itemRef as text
          set itemPosition to position of itemRef
          set itemSize to size of itemRef
          set itemX to item 1 of itemPosition
          set itemY to item 2 of itemPosition
          set itemW to item 1 of itemSize
          if (itemRole is "AXSearchField" or itemRole is "AXTextField") and itemX < maxSearchX and itemY < maxSearchY and itemW > 120 then
            set targetField to itemRef
            exit repeat
          end if
        end try
      end repeat
    end if
    if targetField is missing value then
      ${searchShortcutScript(searchShortcut)}
      delay ${clickDelayMs / 1000}
      repeat with itemRef in entire contents of window 1
        try
          set itemRole to role of itemRef as text
          set itemPosition to position of itemRef
          set itemSize to size of itemRef
          set itemX to item 1 of itemPosition
          set itemY to item 2 of itemPosition
          set itemW to item 1 of itemSize
          if (itemRole is "AXSearchField" or itemRole is "AXTextField") and itemX < maxSearchX and itemY < maxSearchY and itemW > 120 then
            set targetField to itemRef
            exit repeat
          end if
        end try
      end repeat
    end if
    if targetField is missing value then error "Could not find LINE global search field"
    try
      set focused of targetField to true
    end try
    try
      perform action "AXPress" of targetField
    end try
    try
      click targetField
    end try
  end tell
  key code 0 using command down
  key code 9 using command down
  delay 0.2
  tell process "${escapedProcess}"
    set pastedValue to ""
    try
      set pastedValue to value of targetField as text
    end try
    if pastedValue does not contain targetText then error "LINE global search did not receive room name. Current value: " & pastedValue
  end tell
  delay ${searchDelayMs / 1000}
end tell
`)
  if (submitSearch) {
    await openSearchResult({
      lineApp,
      roomName,
      searchOpenKey,
      searchResultClick,
      searchResultLayout,
      searchResultMode,
      searchResultOffset,
      searchResultRatio,
      searchResultSteps,
    })
  }
}

const focusSearchFieldByAccessibility = async ({ clickDelayMs, lineApp, searchShortcut }) => {
  const escapedApp = lineApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escapedProcess = processName(lineApp)

  await osascript(`
tell application "${escapedApp}" to activate
delay 0.3
tell application "System Events"
  tell process "${escapedProcess}" to set frontmost to true
  tell process "${escapedProcess}"
    set targetField to missing value
    repeat with itemRef in entire contents of window 1
      try
        set itemRole to role of itemRef as text
        if itemRole is "AXSearchField" or itemRole is "AXTextField" then
          set targetField to itemRef
          exit repeat
        end if
      end try
    end repeat
    if targetField is missing value then
      repeat with itemRef in entire contents of window 1
        try
          set itemRole to role of itemRef as text
          set itemName to ""
          set itemDescription to ""
          set itemHelp to ""
          try
            set itemName to name of itemRef as text
          end try
          try
            set itemDescription to description of itemRef as text
          end try
          try
            set itemHelp to help of itemRef as text
          end try
          set combinedText to itemName & " " & itemDescription & " " & itemHelp
          if itemRole is "AXButton" and (combinedText contains "Search" or combinedText contains "search" or combinedText contains "搜尋" or combinedText contains "搜索") then
            click itemRef
            exit repeat
          end if
        end try
      end repeat
      delay ${clickDelayMs / 1000}
      repeat with itemRef in entire contents of window 1
        try
          set itemRole to role of itemRef as text
          if itemRole is "AXSearchField" or itemRole is "AXTextField" then
            set targetField to itemRef
            exit repeat
          end if
        end try
      end repeat
    end if
    if targetField is missing value then
      ${searchShortcutScript(searchShortcut)}
      delay ${clickDelayMs / 1000}
      repeat with itemRef in entire contents of window 1
        try
          set itemRole to role of itemRef as text
          if itemRole is "AXSearchField" or itemRole is "AXTextField" then
            set targetField to itemRef
            exit repeat
          end if
        end try
      end repeat
    end if
    if targetField is missing value then error "Could not focus LINE search field"
    try
      set focused of targetField to true
    end try
  end tell
end tell
`)
}

const focusLineSearch = async ({
  clickDelayMs,
  lineApp,
  searchBoxClick,
  searchMode,
  searchShortcut,
  searchTabCount,
  windowBounds,
}) => {
  await activateLine(lineApp)
  await setLineWindowBounds({
    bounds: windowBounds,
    lineApp,
  })

  if (searchMode === 'global-click') {
    if (searchBoxClick) {
      await clickAt({
        label: 'global search box',
        lineApp,
        point: searchBoxClick,
      })
    } else {
      await clickWindowRelative({
        label: 'probable global search box',
        lineApp,
        xRatio: 0.14,
        yRatio: 0.095,
      })
    }
    await sleep(clickDelayMs)
    await pressTab(searchTabCount)
    return
  }

  if (searchMode === 'ax') {
    await focusSearchFieldByAccessibility({
      clickDelayMs,
      lineApp,
      searchShortcut,
    })
    await pressTab(searchTabCount)
    return
  }

  await osascript(`
tell application "System Events"
  ${searchShortcutScript(searchShortcut)}
end tell
`)
  await sleep(clickDelayMs)

  if (searchMode === 'click') {
    if (searchBoxClick) {
      await clickAt({
        label: 'search box',
        lineApp,
        point: searchBoxClick,
      })
    } else {
      await clickWindowRelative({
        label: 'probable search box',
        lineApp,
        xRatio: 0.16,
        yRatio: 0.075,
      })
    }
  }

  await pressTab(searchTabCount)
}

const searchRoomByKeyboard = async ({
  clickDelayMs,
  lineApp,
  pasteMethod,
  roomName,
  searchDelayMs,
  searchOpenKey,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
  searchShortcut,
  submitSearch = true,
}) => {
  await activateLine(lineApp)
  await osascript(`
tell application "System Events"
  ${searchShortcutScript(searchShortcut)}
end tell
`)
  await sleep(clickDelayMs)
  await setTextClipboard(roomName)
  await osascript(`
tell application "System Events"
  tell process "${processName(lineApp)}" to set frontmost to true
  key code 0 using command down
  key code 51
end tell
`)
  await sleep(150)
  await pasteClipboard({
    lineApp,
    pasteMethod,
  })
  await sleep(searchDelayMs)
  if (submitSearch) {
    await openSearchResult({
      lineApp,
      roomName,
      searchOpenKey,
      searchResultClick,
      searchResultLayout,
      searchResultMode,
      searchResultOffset,
      searchResultRatio,
      searchResultSteps,
    })
  }
}

const openRoomByName = async ({
  clickDelayMs,
  lineApp,
  pasteMethod,
  roomName,
  searchBoxClick,
  searchDelayMs,
  searchMode,
  searchOpenKey,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
  searchShortcut,
  submitSearch = true,
}) => {
  if (searchMode === 'global-click') {
    await focusLineSearch({
      clickDelayMs,
      lineApp,
      searchBoxClick,
      searchMode,
      searchShortcut,
      searchTabCount: 0,
      windowBounds: null,
    })
    await setTextClipboard(roomName)
    await osascript(`
tell application "System Events"
  key code 0 using command down
end tell
`)
    await pasteClipboard({
      lineApp,
      pasteMethod,
    })
    await sleep(searchDelayMs)
    if (submitSearch) {
      await openSearchResult({
        lineApp,
        roomName,
        searchOpenKey,
        searchResultClick,
        searchResultLayout,
        searchResultMode,
        searchResultOffset,
        searchResultRatio,
        searchResultSteps,
      })
    }
    await sleep(clickDelayMs)
    console.log(`Room search finished for: ${roomName}`)
    return
  }

  if (searchMode === 'ax') {
    await searchRoomByAccessibility({
      clickDelayMs,
      lineApp,
      roomName,
      searchDelayMs,
      searchOpenKey,
      searchResultClick,
      searchResultLayout,
      searchResultMode,
      searchResultOffset,
      searchResultRatio,
      searchResultSteps,
      searchShortcut,
      submitSearch,
    })
    await sleep(clickDelayMs)
    console.log(`Room search finished for: ${roomName}`)
    return
  }

  if (searchMode === 'keyboard') {
    await searchRoomByKeyboard({
      clickDelayMs,
      lineApp,
      pasteMethod,
      roomName,
      searchDelayMs,
      searchOpenKey,
      searchResultClick,
      searchResultLayout,
      searchResultMode,
      searchResultOffset,
      searchResultRatio,
      searchResultSteps,
      searchShortcut,
      submitSearch,
    })
    await sleep(clickDelayMs)
    console.log(`Room search finished for: ${roomName}`)
    return
  }

  await activateLine(lineApp)
  await osascript(`
tell application "System Events"
  ${searchShortcutScript(searchShortcut)}
end tell
`)
  await sleep(clickDelayMs)

  if (searchBoxClick) {
    await clickAt({
      label: 'search box',
      lineApp,
      point: searchBoxClick,
    })
    await sleep(clickDelayMs)
  } else {
    await clickWindowRelative({
      label: 'probable search box',
      lineApp,
      xRatio: 0.16,
      yRatio: 0.075,
    })
    await sleep(clickDelayMs)
  }

  await setTextClipboard(roomName)
  await osascript(`
tell application "System Events"
  key code 0 using command down
end tell
`)
  await pasteClipboard({
    lineApp,
    pasteMethod,
  })
  await sleep(searchDelayMs)

  if (submitSearch) {
    await openSearchResult({
      lineApp,
      roomName,
      searchOpenKey,
      searchResultClick,
      searchResultLayout,
      searchResultMode,
      searchResultOffset,
      searchResultRatio,
      searchResultSteps,
    })
  }

  await sleep(clickDelayMs)
  console.log(`Room search finished for: ${roomName}`)
}

const smartOpenRoomByName = async ({
  apiUrl,
  clickDelayMs,
  directory,
  lineApp,
  openRouterAppName,
  openRouterSiteUrl,
  visionApiKey,
  openRoom,
  pasteMethod,
  roomName,
  secret,
  searchBoxClick,
  searchDelayMs,
  searchMode,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchShortcut,
  smartRoomSteps,
  verifyDelayMs,
  verifyThreshold,
  visionModel,
  visionProvider,
  visionProxyUrl,
}) => {
  const initialVerification = await verifyCurrentRoom({
    apiUrl,
    directory,
    lineApp,
    openRouterAppName,
    openRouterSiteUrl,
    visionApiKey,
    roomName,
    secret,
    threshold: verifyThreshold,
    verifyDelayMs,
    visionModel,
    visionProvider,
    visionProxyUrl,
  })

  console.log(
    `Room verify before search: ${initialVerification.passed ? 'pass' : 'fail'} (${initialVerification.screenState}, ${initialVerification.confidence}) ${initialVerification.visibleRoomName}`,
  )

  if (initialVerification.passed) return initialVerification

  let lastVerification = initialVerification

  for (const steps of smartRoomSteps) {
    console.log(`Trying LINE search candidate: Down x ${steps}, Enter`)
    await openRoomByName({
      clickDelayMs,
      lineApp,
      pasteMethod,
      roomName,
      searchBoxClick,
      searchDelayMs,
      searchMode,
      searchOpenKey: 'down-enter',
      searchResultClick,
      searchResultLayout,
      searchResultMode: 'keyboard',
      searchResultOffset,
      searchResultRatio,
      searchResultSteps: steps,
      searchShortcut,
      submitSearch: true,
    })

    lastVerification = await verifyCurrentRoom({
      apiUrl,
      directory,
      lineApp,
      openRouterAppName,
      openRouterSiteUrl,
      visionApiKey,
      roomName,
      secret,
      threshold: verifyThreshold,
      verifyDelayMs,
      visionModel,
      visionProvider,
      visionProxyUrl,
    })

    console.log(
      `Room verify after Down x ${steps}: ${lastVerification.passed ? 'pass' : 'fail'} (${lastVerification.screenState}, ${lastVerification.confidence}) ${lastVerification.visibleRoomName}`,
    )

    if (lastVerification.passed) return lastVerification
  }

  throw new Error(
    `Could not verify target LINE room "${roomName}". Last state: ${lastVerification.screenState}, visible="${lastVerification.visibleRoomName}", confidence=${lastVerification.confidence}. Screenshot: ${lastVerification.screenshotPath}`,
  )
}

const prepareLineTarget = async ({
  apiUrl,
  auto,
  clickDelayMs,
  directory,
  focusDelayMs,
  inputClick,
  lineApp,
  openRouterAppName,
  openRouterSiteUrl,
  visionApiKey,
  openRoom,
  pasteMethod,
  roomClick,
  roomName,
  secret,
  searchBoxClick,
  searchDelayMs,
  searchMode,
  searchOpenKey,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
  searchShortcut,
  smartRoom,
  smartRoomSteps,
  verifyDelayMs,
  verifyThreshold,
  visionModel,
  visionProvider,
  visionProxyUrl,
  windowBounds,
  linePrepared = false,
}) => {
  await activateLine(lineApp)
  await setLineWindowBounds({
    bounds: windowBounds,
    lineApp,
  })

  if (roomName) {
    if (smartRoom) {
      await smartOpenRoomByName({
        apiUrl,
        clickDelayMs,
        directory,
        lineApp,
        openRouterAppName,
        openRouterSiteUrl,
        visionApiKey,
        pasteMethod,
        roomName,
        secret,
        searchBoxClick,
        searchDelayMs,
        searchMode,
        searchResultClick,
        searchResultLayout,
        searchResultMode,
        searchResultOffset,
        searchResultRatio,
        searchShortcut,
        smartRoomSteps,
        verifyDelayMs,
        verifyThreshold,
        visionModel,
        visionProvider,
        visionProxyUrl,
      })
    } else if (openRoom) {
      await openRoomByName({
        clickDelayMs,
        lineApp,
        pasteMethod,
        roomName,
        searchBoxClick,
        searchDelayMs,
        searchMode,
        searchOpenKey,
        searchResultClick,
        searchResultLayout,
        searchResultMode,
        searchResultOffset,
        searchResultRatio,
        searchResultSteps,
        searchShortcut,
      })
    }
  }

  if (!auto) {
    if (focusDelayMs > 0) {
      console.log(`\nLINE is active. Click the target room message input within ${focusDelayMs / 1000} seconds...`)
      await sleep(focusDelayMs)
    }

    return
  }

  if (roomClick) {
    await clickAt({
      label: 'room',
      lineApp,
      point: roomClick,
    })
    await sleep(clickDelayMs)
  }

  if (inputClick) {
    await clickAt({
      label: 'input',
      lineApp,
      point: inputClick,
    })
  } else {
    await focusLineMessageInput({
      lineApp,
    })
  }
  await sleep(clickDelayMs)
}

const runTestClicks = async ({ clickDelayMs, inputClick, lineApp, roomClick, windowBounds }) => {
  await prepareLineTarget({
    auto: true,
    clickDelayMs,
    focusDelayMs: 0,
    inputClick,
    lineApp,
    roomClick,
    windowBounds,
  })
  console.log('Click test finished. If the cursor is in the LINE input box, these coordinates are ready for --auto.')
}

const runTestSearchFocus = async ({
  clickDelayMs,
  lineApp,
  searchBoxClick,
  searchMode,
  searchShortcut,
  searchTabCount,
  windowBounds,
}) => {
  await focusLineSearch({
    clickDelayMs,
    lineApp,
    searchBoxClick,
    searchMode,
    searchShortcut,
    searchTabCount,
    windowBounds,
  })
  console.log('Search focus test finished. Check whether the cursor is in the LINE search box.')
}

const runTestRoom = async ({
  clickDelayMs,
  lineApp,
  pasteMethod,
  roomName,
  searchBoxClick,
  searchDelayMs,
  searchMode,
  searchOpenKey,
  pasteOnly,
  testRoomOpen,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
  searchShortcut,
  windowBounds,
}) => {
  await activateLine(lineApp)
  await setLineWindowBounds({
    bounds: windowBounds,
    lineApp,
  })

  if (pasteOnly) {
    if (searchMode !== 'ax') {
      throw new Error('--test-room-paste-only currently supports --search-mode ax only')
    }

    await focusSearchFieldByAccessibility({
      clickDelayMs,
      lineApp,
      searchShortcut,
    })
    await setTextClipboard(roomName)
    await pasteClipboard({
      lineApp,
      pasteMethod,
    })
    console.log('Room name pasted into LINE search field. No Enter was pressed.')
    return
  }

  await openRoomByName({
    clickDelayMs,
    lineApp,
    pasteMethod,
    roomName,
    searchBoxClick,
    searchDelayMs,
    searchMode,
    searchOpenKey,
    searchResultClick,
    searchResultLayout,
    searchResultMode,
    searchResultOffset,
    searchResultRatio,
    searchResultSteps,
    searchShortcut,
    submitSearch: testRoomOpen,
  })

  if (testRoomOpen) {
    console.log('Room open/select action attempted. No message input click, paste, or send was performed after this step.')
  } else {
    console.log('Room search test finished. No Enter was pressed. Confirm the room name is in LINE search, then use --test-room-open to test opening it.')
  }
}

const runSmartRoom = async ({
  apiUrl,
  clickDelayMs,
  directory,
  lineApp,
  openRouterAppName,
  openRouterSiteUrl,
  visionApiKey,
  pasteMethod,
  roomName,
  secret,
  searchBoxClick,
  searchDelayMs,
  searchMode,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchShortcut,
  smartRoomSteps,
  verifyDelayMs,
  verifyThreshold,
  visionModel,
  visionProvider,
  visionProxyUrl,
  windowBounds,
  linePrepared = false,
}) => {
  await activateLine(lineApp)
  await setLineWindowBounds({
    bounds: windowBounds,
    lineApp,
  })
  const verification = await smartOpenRoomByName({
    apiUrl,
    clickDelayMs,
    directory,
    lineApp,
    openRouterAppName,
    openRouterSiteUrl,
    visionApiKey,
    pasteMethod,
    roomName,
    secret,
    searchBoxClick,
    searchDelayMs,
    searchMode,
    searchResultClick,
    searchResultLayout,
    searchResultMode,
    searchResultOffset,
    searchResultRatio,
    searchShortcut,
    smartRoomSteps,
    verifyDelayMs,
    verifyThreshold,
    visionModel,
    visionProvider,
    visionProxyUrl,
  })

  console.log(`Smart room open verified: ${verification.visibleRoomName} (${verification.confidence})`)
}

const runTestMessage = async ({
  clickDelayMs,
  inputClick,
  lineApp,
  message,
  pasteMethod,
  roomName,
  searchBoxClick,
  searchDelayMs,
  searchMode,
  searchOpenKey,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
  searchShortcut,
  windowBounds,
}) => {
  await activateLine(lineApp)
  await setLineWindowBounds({
    bounds: windowBounds,
    lineApp,
  })
  await openRoomByName({
    clickDelayMs,
    lineApp,
    pasteMethod,
    roomName,
    searchBoxClick,
    searchDelayMs,
    searchMode,
    searchOpenKey,
    searchResultClick,
    searchResultLayout,
    searchResultMode,
    searchResultOffset,
    searchResultRatio,
    searchResultSteps,
    searchShortcut,
    submitSearch: true,
  })
  await sleep(clickDelayMs)

  if (inputClick) {
    await clickAt({
      label: 'input',
      lineApp,
      point: inputClick,
    })
  } else {
    await focusLineMessageInput({
      lineApp,
    })
  }

  await setTextClipboard(message)
  await pasteClipboard({
    lineApp,
    pasteMethod,
  })
  console.log(`Test message pasted without Enter: ${message}`)
}

const runTestSendMessage = async ({
  apiUrl,
  clickDelayMs,
  directory,
  focusDelayMs,
  inputClick,
  lineApp,
  message,
  openRouterAppName,
  openRouterSiteUrl,
  pasteDelayMs,
  pasteMethod,
  roomName,
  secret,
  searchBoxClick,
  searchDelayMs,
  searchMode,
  searchOpenKey,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
  searchShortcut,
  sendKey,
  smartRoomSteps,
  verifyDelayMs,
  verifyThreshold,
  visionApiKey,
  visionModel,
  visionProvider,
  visionProxyUrl,
  windowBounds,
  linePrepared = false,
}) => {
  await prepareLineTarget({
    apiUrl,
    auto: true,
    clickDelayMs,
    directory,
    focusDelayMs,
    inputClick,
    lineApp,
    openRouterAppName,
    openRouterSiteUrl,
    pasteMethod,
    roomClick: null,
    roomName,
    secret,
    searchBoxClick,
    searchDelayMs,
    searchMode,
    searchOpenKey,
    searchResultClick,
    searchResultLayout,
    searchResultMode,
    searchResultOffset,
    searchResultRatio,
    searchResultSteps,
    searchShortcut,
    smartRoom: true,
    smartRoomSteps,
    verifyDelayMs,
    verifyThreshold,
    visionApiKey,
    visionModel,
    visionProvider,
    visionProxyUrl,
    windowBounds,
  })

  const verification = await verifyCurrentRoom({
    apiUrl,
    directory,
    lineApp,
    openRouterAppName,
    openRouterSiteUrl,
    roomName,
    secret,
    threshold: verifyThreshold,
    verifyDelayMs,
    visionApiKey,
    visionModel,
    visionProvider,
    visionProxyUrl,
  })

  console.log(
    `Test send room verify: ${verification.passed ? 'pass' : 'fail'} (${verification.screenState}, ${verification.confidence}) ${verification.visibleRoomName}`,
  )

  if (!verification.passed) {
    throw new Error(
      `Abort test send: current LINE room is not verified as "${roomName}". visible="${verification.visibleRoomName}", state=${verification.screenState}, confidence=${verification.confidence}. Screenshot: ${verification.screenshotPath}`,
    )
  }

  await setTextClipboard(message)
  await pasteAndMaybeSend({
    delayMs: clickDelayMs,
    lineApp,
    pasteDelayMs,
    pasteMethod,
    sendKey,
  })
  console.log(`Test message sent: ${message}`)
}

const sendKeystroke = (sendKey) => {
  if (sendKey === 'cmd-enter') return 'key code 36 using command down'
  if (sendKey === 'option-enter') return 'key code 36 using option down'

  return 'key code 36'
}

const pasteClipboard = async ({ lineApp, pasteMethod }) => {
  const escapedProcess = processName(lineApp)

  if (pasteMethod === 'menu') {
    await osascript(`
tell application "System Events"
  tell process "${escapedProcess}"
    set frontmost to true
    try
      click menu item "Paste" of menu "Edit" of menu bar 1
    on error
      click menu item "貼上" of menu "編輯" of menu bar 1
    end try
  end tell
end tell
`)
    return
  }

  if (pasteMethod === 'keystroke') {
    await osascript(`
tell application "System Events"
  tell process "${escapedProcess}" to set frontmost to true
  keystroke "v" using command down
end tell
`)
    return
  }

  await osascript(`
tell application "System Events"
  tell process "${escapedProcess}" to set frontmost to true
  key code 9 using command down
end tell
`)
}

const pasteAndMaybeSend = async ({ delayMs, lineApp, pasteDelayMs, pasteMethod, sendKey, shouldSend = true }) => {
  await pasteClipboard({
    lineApp,
    pasteMethod,
  })
  await osascript(`
tell application "System Events"
  delay ${pasteDelayMs / 1000}
  ${shouldSend ? sendKeystroke(sendKey) : ''}
end tell
`)
  await sleep(delayMs)
}

const sendCurrentLineDraft = async ({ delayMs, lineApp, sendKey }) => {
  const escapedProcess = processName(lineApp)

  await osascript(`
tell application "System Events"
  tell process "${escapedProcess}" to set frontmost to true
  ${sendKeystroke(sendKey)}
end tell
`)
  await sleep(delayMs)
}

const runTestPaste = async ({ focusDelayMs, lineApp, pasteDelayMs, pasteMethod }) => {
  await activateLine(lineApp)
  if (focusDelayMs > 0) {
    console.log(`LINE is active. Click the message input within ${focusDelayMs / 1000} seconds...`)
    await sleep(focusDelayMs)
  }

  const text = `LINE relay paste test ${new Date().toISOString()}`
  await setTextClipboard(text)
  await pasteAndMaybeSend({
    delayMs: 500,
    lineApp,
    pasteDelayMs,
    pasteMethod,
    sendKey: 'enter',
    shouldSend: false,
  })
  console.log(`Pasted test text to clipboard target: ${text}`)
}

const relayPackage = async ({
  apiUrl,
  allowResend,
  auto,
  clickDelayMs,
  combineImages,
  delayMs,
  directory,
  downloadedImages,
  draft,
  dryRun,
  focusDelayMs,
  inputClick,
  lineApp,
  openRouterAppName,
  openRouterSiteUrl,
  visionApiKey,
  pasteMethod,
  pasteDelayMs,
  roomClick,
  roomName,
  secret,
  searchBoxClick,
  searchDelayMs,
  searchMode,
  searchOpenKey,
  searchResultClick,
  searchResultLayout,
  searchResultMode,
  searchResultOffset,
  searchResultRatio,
  searchResultSteps,
  searchShortcut,
  sendKey,
  sharePackage,
  smartRoom,
  smartRoomSteps,
  verifyBeforeSend,
  verifyDelayMs,
  verifyThreshold,
  visionModel,
  visionProvider,
  visionProxyUrl,
  windowBounds,
  linePrepared = false,
}) => {
  const textItem = sharePackage.items.find((item) => item.kind === 'text')

  if (!textItem && !downloadedImages.length) {
    throw new Error('Selected package has no sendable text or image items')
  }

  console.log(`Report date: ${sharePackage.reportDate}`)
  console.log(`Ready: ${sharePackage.ready}`)
  console.log(`Items: ${sharePackage.items.length}`)
  console.log(`Paste method: ${pasteMethod}`)
  console.log(`Queue images in one message: ${combineImages ? 'yes' : 'no'}`)
  console.log(`Generated parts: ${sharePackage.generatedParts?.join(', ') || 'none'}`)
  const imagesToSend = downloadedImages

  if (sharePackage.missing?.length) {
    console.log(`Missing: ${sharePackage.missing.join(', ')}`)
  }

  if (dryRun) {
    console.log('\nDry run only. Use --send after opening the target LINE room.')
    if (textItem) {
      console.log('\nText preview:\n')
      console.log(textItem.text)
    }
    console.log('\nDownloaded images:')
    imagesToSend.forEach((item, index) => {
      console.log(`${index + 1}. ${item.label}: ${item.path}`)
    })
    return
  }

  if (!sharePackage.ready) {
    throw new Error('Package is not ready. Fix missing items or rerun with --generate missing.')
  }

  if (sharePackage.status === 'sent' && !allowResend) {
    throw new Error('Report is already marked as sent. Use --allow-resend if you really want to send it again.')
  }

  if (!linePrepared) {
    await prepareLineTarget({
      apiUrl,
      auto,
      clickDelayMs,
      directory,
      focusDelayMs,
      inputClick,
      lineApp,
      openRouterAppName,
      openRouterSiteUrl,
      visionApiKey,
      pasteMethod,
      roomClick,
      roomName,
      secret,
      searchBoxClick,
      searchDelayMs,
      searchMode,
      searchOpenKey,
      searchResultClick,
      searchResultLayout,
      searchResultMode,
      searchResultOffset,
      searchResultRatio,
      searchResultSteps,
      searchShortcut,
      smartRoom,
      smartRoomSteps,
      verifyDelayMs,
      verifyThreshold,
      visionModel,
      visionProvider,
      visionProxyUrl,
      windowBounds,
    })
  }

  if (verifyBeforeSend && roomName) {
    const verification = await verifyCurrentRoom({
      apiUrl,
      directory,
      lineApp,
      openRouterAppName,
      openRouterSiteUrl,
      visionApiKey,
      roomName,
      secret,
      threshold: verifyThreshold,
      verifyDelayMs,
      visionModel,
      visionProvider,
      visionProxyUrl,
    })

    console.log(
      `Final room verify before send: ${verification.passed ? 'pass' : 'fail'} (${verification.screenState}, ${verification.confidence}) ${verification.visibleRoomName}`,
    )

    if (!verification.passed) {
      throw new Error(
        `Abort before sending: current LINE room is not verified as "${roomName}". visible="${verification.visibleRoomName}", state=${verification.screenState}, confidence=${verification.confidence}. Screenshot: ${verification.screenshotPath}`,
      )
    }
  }

  const refocusMessageInput = async () => {
    if (!auto) return
    await focusLineMessageInput({
      lineApp,
    })
    await sleep(clickDelayMs)
  }

  if (textItem) {
    console.log(draft ? '\nPasting text draft...' : '\nSending text...')
    await setTextClipboard(textItem.text)
    await refocusMessageInput()
    await pasteAndMaybeSend({
      delayMs,
      lineApp,
      pasteMethod,
      pasteDelayMs,
      sendKey,
      shouldSend: !draft,
    })
  }

  if (imagesToSend.length) {
    if (combineImages && imagesToSend.length > 1) {
      for (const [index, item] of imagesToSend.entries()) {
        console.log(`${draft ? 'Queueing image draft' : 'Queueing image'} ${index + 1}/${imagesToSend.length}: ${item.label}`)
        await setImageClipboard(item.clipboardPath || item.path, item.clipboardMimeType || item.mimeType || '')
        await refocusMessageInput()
        await pasteClipboard({
          lineApp,
          pasteMethod,
        })
        await sleep(Math.max(pasteDelayMs, 3000))
      }

      if (!draft) {
        console.log(`Sending queued images 1/1: ${imagesToSend.length} images`)
        await sendCurrentLineDraft({
          delayMs,
          lineApp,
          sendKey,
        })
      }
    } else {
      for (const [index, item] of imagesToSend.entries()) {
        console.log(`${draft ? 'Pasting image draft' : 'Sending image'} ${index + 1}/${imagesToSend.length}: ${item.label}`)
        await setImageClipboard(item.clipboardPath || item.path, item.clipboardMimeType || item.mimeType || '')
        await refocusMessageInput()
        await pasteAndMaybeSend({
          delayMs,
          lineApp,
          pasteMethod,
          pasteDelayMs: Math.max(pasteDelayMs, 3000),
          sendKey,
          shouldSend: !draft,
        })
      }
    }
  }

  console.log(draft ? 'Draft pasted. Review LINE and send manually.' : 'Done.')
}

const markSent = async ({ downloadedImages, markSentUrl, operator, secret, sharePackage, target }) => {
  const sentItems = sharePackage.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    label: item.label,
    mediaId: item.kind === 'image' ? item.mediaId : undefined,
    url: item.kind === 'image' ? item.url : undefined,
  }))

  await postJson({
    body: {
      imageCount: downloadedImages.length,
      operator,
      reportDate: sharePackage.reportDate,
      reportId: sharePackage.reportId,
      sentItems,
      target,
    },
    secret,
    url: markSentUrl,
  })
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const inputClick = parsePoint(options.inputClick, '--input-click')
  const roomClick = parsePoint(options.roomClick, '--room-click')
  const searchBoxClick = parsePoint(options.searchBoxClick, '--search-box-click')
  const searchResultClick = parsePoint(options.searchResultClick, '--search-result-click')
  const searchResultLayout = parsePoint(options.searchResultLayout, '--search-result-layout')
  const searchResultRatio = parseRatio(options.searchResultRatio, '--search-result-ratio')
  const smartRoomSteps = parseIntegerSequence(options.smartRoomSteps, '--smart-room-steps')
  const itemIds = parseCsvSet(options.itemIds)
  const windowBounds = parseBounds(options.windowBounds)
  const verificationDirectory = join('/private/tmp', 'daily-report-line-relay', 'verification')

  if (options.help) {
    console.log(usage.trim())
    return
  }

  if (options.mousePosition) {
    if (options.mousePositionDelayMs > 0) {
      console.log(`Move the mouse to the target position. Capturing in ${options.mousePositionDelayMs / 1000} seconds...`)
      await sleep(options.mousePositionDelayMs)
    }

    await printMousePosition()
    return
  }

  if (options.dumpUi) {
    await dumpLineUi(options.lineApp)
    return
  }

  if (options.dumpUiAll) {
    await dumpLineUiAll(options.lineApp)
    return
  }

  if (options.verifyRoom) {
    const verification = await verifyCurrentRoom({
      apiUrl: options.apiUrl,
      directory: verificationDirectory,
      lineApp: options.lineApp,
      openRouterAppName: options.openRouterAppName,
      openRouterSiteUrl: options.openRouterSiteUrl,
      visionApiKey: options.visionApiKey,
      roomName: options.roomName,
      secret: options.secret,
      threshold: options.verifyThreshold,
      verifyDelayMs: options.verifyDelayMs,
      visionModel: options.visionModel,
      visionProvider: options.visionProvider,
      visionProxyUrl: options.visionProxyUrl,
    })

    console.log(JSON.stringify(verification, null, 2))
    if (!verification.passed) process.exitCode = 1
    return
  }

  if (options.testClicks) {
    if (!inputClick) throw new Error('--test-clicks requires --input-click x,y or LINE_RELAY_INPUT_CLICK')

    await runTestClicks({
      clickDelayMs: options.clickDelayMs,
      inputClick,
      lineApp: options.lineApp,
      roomClick,
      windowBounds,
    })
    return
  }

  if (options.testSearchFocus) {
    await runTestSearchFocus({
      clickDelayMs: options.clickDelayMs,
      lineApp: options.lineApp,
      searchBoxClick,
      searchMode: options.searchMode,
      searchShortcut: options.searchShortcut,
      searchTabCount: options.searchTabCount,
      windowBounds,
    })
    return
  }

  if (options.testRoom) {
    if (options.smartRoom) {
      await runSmartRoom({
        apiUrl: options.apiUrl,
        clickDelayMs: options.clickDelayMs,
        directory: verificationDirectory,
        lineApp: options.lineApp,
        openRouterAppName: options.openRouterAppName,
        openRouterSiteUrl: options.openRouterSiteUrl,
        visionApiKey: options.visionApiKey,
        pasteMethod: options.pasteMethod,
        roomName: options.roomName,
        secret: options.secret,
        searchBoxClick,
        searchDelayMs: options.searchDelayMs,
        searchMode: options.searchMode,
        searchResultClick,
        searchResultLayout,
        searchResultMode: options.searchResultMode,
        searchResultOffset: options.searchResultOffset,
        searchResultRatio,
        searchShortcut: options.searchShortcut,
        smartRoomSteps,
        verifyDelayMs: options.verifyDelayMs,
        verifyThreshold: options.verifyThreshold,
        visionModel: options.visionModel,
        visionProvider: options.visionProvider,
        visionProxyUrl: options.visionProxyUrl,
        windowBounds,
      })
      return
    }

    await runTestRoom({
      clickDelayMs: options.clickDelayMs,
      lineApp: options.lineApp,
      pasteMethod: options.pasteMethod,
      roomName: options.roomName,
      searchBoxClick,
      searchDelayMs: options.searchDelayMs,
      searchMode: options.searchMode,
      searchOpenKey: options.searchOpenKey,
      pasteOnly: options.testRoomPasteOnly,
      testRoomOpen: options.testRoomOpen,
      searchResultClick,
      searchResultLayout,
      searchResultMode: options.searchResultMode,
      searchResultOffset: options.searchResultOffset,
      searchResultRatio,
      searchResultSteps: options.searchResultSteps,
      searchShortcut: options.searchShortcut,
      windowBounds,
    })
    return
  }

  if (options.testMessage) {
    await runTestMessage({
      clickDelayMs: options.clickDelayMs,
      inputClick,
      lineApp: options.lineApp,
      message: options.testMessage,
      pasteMethod: options.pasteMethod,
      roomName: options.roomName,
      searchBoxClick,
      searchDelayMs: options.searchDelayMs,
      searchMode: options.searchMode,
      searchOpenKey: options.searchOpenKey,
      searchResultClick,
      searchResultLayout,
      searchResultMode: options.searchResultMode,
      searchResultOffset: options.searchResultOffset,
      searchResultRatio,
      searchResultSteps: options.searchResultSteps,
      searchShortcut: options.searchShortcut,
      windowBounds,
    })
    return
  }

  if (options.testSendMessage) {
    await runTestSendMessage({
      apiUrl: options.apiUrl,
      clickDelayMs: options.clickDelayMs,
      directory: verificationDirectory,
      focusDelayMs: options.focusDelayMs,
      inputClick,
      lineApp: options.lineApp,
      message: options.testSendMessage,
      openRouterAppName: options.openRouterAppName,
      openRouterSiteUrl: options.openRouterSiteUrl,
      pasteDelayMs: options.pasteDelayMs,
      pasteMethod: options.pasteMethod,
      roomName: options.roomName,
      secret: options.secret,
      searchBoxClick,
      searchDelayMs: options.searchDelayMs,
      searchMode: options.searchMode,
      searchOpenKey: options.searchOpenKey,
      searchResultClick,
      searchResultLayout,
      searchResultMode: options.searchResultMode,
      searchResultOffset: options.searchResultOffset,
      searchResultRatio,
      searchResultSteps: options.searchResultSteps,
      searchShortcut: options.searchShortcut,
      sendKey: options.sendKey,
      smartRoomSteps,
      verifyDelayMs: options.verifyDelayMs,
      verifyThreshold: options.verifyThreshold,
      visionApiKey: options.visionApiKey,
      visionModel: options.visionModel,
      visionProvider: options.visionProvider,
      visionProxyUrl: options.visionProxyUrl,
      windowBounds,
    })
    return
  }

  if (options.testPaste) {
    await runTestPaste({
      focusDelayMs: options.focusDelayMs,
      lineApp: options.lineApp,
      pasteDelayMs: options.pasteDelayMs,
      pasteMethod: options.pasteMethod,
    })
    return
  }

  let sharePackage = await loadSharePackage({
    itemIds,
    options,
  })
  const markSentUrl = getMarkSentUrl({
    apiUrl: options.apiUrl,
    markSentUrl: options.markSentUrl || sharePackage.markSentUrl || '',
  })

  if (!options.dryRun && (!sharePackage.ready || sharePackage.status === 'failed')) {
    throw new Error(describePackageFailure(sharePackage))
  }

  const imageItems = sharePackage.items.filter((item) => item.kind === 'image')
  const directory = join('/private/tmp', 'daily-report-line-relay', sharePackage.reportDate || 'latest')

  await mkdir(directory, {
    recursive: true,
  })

  const downloadedImages = await downloadImages({
    directory,
    imageItems,
  })

  await relayPackage({
    apiUrl: options.apiUrl,
    auto: options.auto,
    allowResend: options.allowResend,
    clickDelayMs: options.clickDelayMs,
    combineImages: options.combineImages,
    delayMs: options.delayMs,
    directory,
    downloadedImages,
    draft: options.draft,
    dryRun: options.dryRun,
    focusDelayMs: options.focusDelayMs,
    inputClick,
    lineApp: options.lineApp,
    openRouterAppName: options.openRouterAppName,
    openRouterSiteUrl: options.openRouterSiteUrl,
    visionApiKey: options.visionApiKey,
    openRoom: options.openRoom,
    pasteMethod: options.pasteMethod,
    pasteDelayMs: options.pasteDelayMs,
    roomClick,
    roomName: options.roomName,
    secret: options.secret,
    searchBoxClick,
    searchDelayMs: options.searchDelayMs,
    searchMode: options.searchMode,
    searchOpenKey: options.searchOpenKey,
    searchResultClick,
    searchResultLayout,
    searchResultMode: options.searchResultMode,
    searchResultOffset: options.searchResultOffset,
    searchResultRatio,
    searchResultSteps: options.searchResultSteps,
    searchShortcut: options.searchShortcut,
    sendKey: options.sendKey,
    sharePackage,
    smartRoom: options.smartRoom,
    smartRoomSteps,
    verifyBeforeSend: options.verifyBeforeSend || options.smartRoom,
    verifyDelayMs: options.verifyDelayMs,
    verifyThreshold: options.verifyThreshold,
    visionModel: options.visionModel,
    visionProvider: options.visionProvider,
    visionProxyUrl: options.visionProxyUrl,
    windowBounds,
  })

  if (!options.dryRun && !options.draft && options.markSent) {
    await markSent({
      downloadedImages,
      markSentUrl,
      operator: options.operator,
      secret: options.secret,
      sharePackage,
      target: options.target,
    })
    console.log('Marked report as sent on server.')
  }

  if (!options.keepFiles && !options.dryRun && !options.draft) {
    await rm(directory, {
      force: true,
      recursive: true,
    })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
