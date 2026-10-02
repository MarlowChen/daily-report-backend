#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { config as loadDotenv } from 'dotenv'

import {
  isAttemptStale,
  isScheduleBusy,
  scheduleAttemptDecision,
  sendBatchesFor,
  shouldCombineImagesFor,
} from './schedule.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const appDataDirectory = process.env.LINE_RELAY_APP_DATA_DIR || join(homedir(), '.daily-report-line-relay')
const configPath = join(appDataDirectory, 'config.json')
const statePath = join(appDataDirectory, 'state.json')
const DEFAULT_PORT = 8787
const SECRET_MASK = '********'
const DEFAULT_SCHEDULE_GRACE_MINUTES = 180
const DEFAULT_RELAY_JOB_TIMEOUT_MS = 7 * 60 * 1000
const DEFAULT_HTTP_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_AUTO_RETRY_LIMIT = 3
const AUTO_ATTEMPT_STALE_MS = DEFAULT_RELAY_JOB_TIMEOUT_MS + 60_000
const CONFIG_VERSION = 2
const DEFAULT_PACKAGE_API_URL = 'https://crypto-v.zeabur.app/api/daily-report/package'
const DEFAULT_ROOM_NAME = 'V1加密世界教學論壇'
const partDefinitions = [
  {
    defaultTime: '09:00',
    id: 'part1',
    itemIds: ['daily-report-news', 'cryptobubbles-mc', 'coin360'],
    label: 'Part 1｜加密快訊 + 市場圖',
  },
  {
    defaultTime: '12:00',
    id: 'part2',
    itemIds: [
      'ctee-newspaper',
      'ctee-newspaper-2',
      'ctee-newspaper-3',
      'economic-daily',
      'economic-daily-2',
      'economic-daily-3',
    ],
    label: 'Part 2｜工商/經濟前三頁',
  },
  {
    defaultTime: '15:00',
    id: 'part3',
    itemIds: ['ctee-china-digest', 'ctee-world-digest', 'us-stock-heatmap', 'global-stock-close'],
    label: 'Part 3｜兩岸/國際 + 股市圖',
  },
]

const defaultPartsConfig = () =>
  Object.fromEntries(
    partDefinitions.map((part, index) => {
      const envTime = process.env[`LINE_RELAY_PART${index + 1}_TIME`]
      return [
        part.id,
        {
          enabled: process.env[`LINE_RELAY_PART${index + 1}_AUTO`] === '0' ? false : true,
          time: envTime || part.defaultTime,
        },
      ]
    }),
  )

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
  for (const path of [join(projectDirectory, '.env'), join(scriptDirectory, '.env'), resolve(process.cwd(), '.env')]) {
    if (!existsSync(path)) continue
    clearPlaceholderEnv()
    loadDotenv({
      override: false,
      path,
    })
  }
  clearPlaceholderEnv()
}

loadEnvFiles()

const defaultConfig = () => ({
  allowResend: false,
  apiUrl: process.env.DAILY_REPORT_PACKAGE_URL || DEFAULT_PACKAGE_API_URL,
  autoEnabled: !['0', 'false'].includes(String(process.env.LINE_RELAY_AUTO || '').toLowerCase()),
  autoSendEnabled: process.env.LINE_RELAY_AUTO_SEND === '0' || process.env.LINE_RELAY_AUTO_SEND === 'false' ? false : true,
  autoRetryLimit: Number(process.env.LINE_RELAY_AUTO_RETRY_LIMIT || DEFAULT_AUTO_RETRY_LIMIT),
  configVersion: CONFIG_VERSION,
  generate: process.env.DAILY_REPORT_GENERATE || 'missing',
  inputClick: process.env.LINE_RELAY_INPUT_CLICK || '',
  lineApp: process.env.LINE_APP_NAME || 'LINE',
  markSentUrl: process.env.DAILY_REPORT_MARK_SENT_URL || '',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterAppName: process.env.OPENROUTER_APP_NAME || process.env.SITE_NAME || 'daily-report-line-relay',
  openRouterSiteUrl: process.env.OPENROUTER_SITE_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost',
  operator: process.env.LINE_RELAY_OPERATOR || 'macOS relay app',
  pasteMethod: process.env.LINE_RELAY_PASTE_METHOD || 'keycode',
  parts: defaultPartsConfig(),
  retryAttempts: Number(process.env.LINE_RELAY_RETRY_ATTEMPTS || 1),
  roomName: process.env.LINE_RELAY_ROOM_NAME || DEFAULT_ROOM_NAME,
  scheduleGraceMinutes: Number(process.env.LINE_RELAY_SCHEDULE_GRACE_MINUTES || DEFAULT_SCHEDULE_GRACE_MINUTES),
  scheduleTime: process.env.LINE_RELAY_SCHEDULE_TIME || '09:00',
  secret: process.env.DAILY_REPORT_SHARED_SECRET || '',
  sendKey: process.env.LINE_RELAY_SEND_KEY || 'enter',
  smartRoomSteps: process.env.LINE_RELAY_SMART_ROOM_STEPS || '2,1,3,0,4',
  target: process.env.LINE_RELAY_TARGET || 'V1 LINE OpenChat',
  verifyThreshold: Number(process.env.LINE_RELAY_VERIFY_THRESHOLD || 0.85),
  visionModel: process.env.LINE_RELAY_VISION_MODEL || 'openai/gpt-4.1-mini',
  visionProvider: process.env.LINE_RELAY_VISION_PROVIDER || 'proxy',
  visionProxyUrl: process.env.LINE_RELAY_VISION_PROXY_URL || '',
  windowBounds: process.env.LINE_RELAY_WINDOW_BOUNDS || '0,0,1200,900',
})

const defaultState = () => ({
  autoAttempts: {},
  events: [],
  sent: {},
})

const readJsonFile = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback()
  }
}

const writeJsonFile = async (path, value) => {
  await mkdir(dirname(path), {
    recursive: true,
  })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

const execFileAsync = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({
        stderr,
        stdout,
      })
    })
  })

const checkAccessibilityPermission = async () => {
  try {
    await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to count processes',
    ], {
      timeout: 15000,
    })

    return {
      ok: true,
      service: 'Accessibility',
    }
  } catch (error) {
    return {
      message: [
        'macOS 輔助使用尚未允許此程式控制 LINE。',
        '請到「系統設定 > 隱私權與安全性 > 輔助使用」允許 LINE 日報控制台；如果是用 Terminal 啟動，就允許 Terminal 或 iTerm。',
        '允許後請完全關掉控制台再重新打開。',
      ].join('\n'),
      ok: false,
      raw: [error?.stdout, error?.stderr, error instanceof Error ? error.message : String(error)]
        .filter(Boolean)
        .join('\n'),
      service: 'Accessibility',
    }
  }
}

const checkScreenRecordingPermission = async () => {
  const screenshotPath = join(appDataDirectory, `screen-check-${Date.now()}.png`)

  try {
    await mkdir(appDataDirectory, {
      recursive: true,
    })
    await execFileAsync('screencapture', ['-x', screenshotPath], {
      timeout: 15000,
    })
    const bytes = await readFile(screenshotPath)

    if (bytes.length < 1000) {
      throw new Error('screencapture returned an empty image')
    }

    await rm(screenshotPath, {
      force: true,
    })

    return {
      ok: true,
      service: 'Screen Recording',
    }
  } catch (error) {
    await rm(screenshotPath, {
      force: true,
    })

    return {
      message: [
        'macOS 螢幕錄製尚未允許此程式截圖。',
        '智慧檢查 LINE 聊天室需要截圖權限，否則會停在 LINE 畫面無法完成驗證。',
        '請到「系統設定 > 隱私權與安全性 > 螢幕錄製」允許 LINE 日報控制台；允許後完全關掉控制台再重新打開。',
      ].join('\n'),
      ok: false,
      raw: [error?.stdout, error?.stderr, error instanceof Error ? error.message : String(error)]
        .filter(Boolean)
        .join('\n'),
      service: 'Screen Recording',
    }
  }
}

const openAccessibilitySettings = async () => {
  await execFileAsync('open', [
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  ])
  return {
    ok: true,
  }
}

const loadConfig = async () => {
  const storedConfig = await readJsonFile(configPath, () => ({}))
  const migratedConfig = storedConfig.configVersion
    ? storedConfig
    : {
        ...storedConfig,
        autoEnabled: true,
        configVersion: CONFIG_VERSION,
      }
  const config = {
    ...defaultConfig(),
    ...migratedConfig,
  }
  config.parts = normalizePartsConfig(config.parts)
  return config
}

const normalizePartsConfig = (parts = {}) => {
  const defaults = defaultPartsConfig()

  return Object.fromEntries(
    partDefinitions.map((part) => [
      part.id,
      {
        ...defaults[part.id],
        ...(parts?.[part.id] || {}),
      },
    ]),
  )
}

const saveConfig = async (config) => {
  const currentConfig = await loadConfig()
  const cleanedConfig = {
    ...config,
  }
  if (typeof cleanedConfig.roomName === 'string') cleanedConfig.roomName = cleanedConfig.roomName.trim()
  if (typeof cleanedConfig.scheduleTime === 'string') cleanedConfig.scheduleTime = cleanedConfig.scheduleTime.trim()
  if (typeof cleanedConfig.smartRoomSteps === 'string') cleanedConfig.smartRoomSteps = cleanedConfig.smartRoomSteps.trim()
  for (const key of ['retryAttempts', 'scheduleGraceMinutes', 'verifyThreshold']) {
    if (cleanedConfig[key] === '' || cleanedConfig[key] === null || typeof cleanedConfig[key] === 'undefined') {
      delete cleanedConfig[key]
      continue
    }
    const numberValue = Number(cleanedConfig[key])
    if (Number.isFinite(numberValue)) cleanedConfig[key] = numberValue
  }

  const nextConfig = {
    ...defaultConfig(),
    ...currentConfig,
    ...Object.fromEntries(
      Object.entries(cleanedConfig).filter(([key, value]) => {
        if (!['openRouterApiKey', 'secret'].includes(key)) return true
        return value !== SECRET_MASK
      }),
    ),
  }
  nextConfig.parts = normalizePartsConfig(nextConfig.parts)
  await writeJsonFile(configPath, nextConfig)
  return nextConfig
}

const publicConfig = (config) => ({
  ...config,
  openRouterApiKey: config.openRouterApiKey ? SECRET_MASK : '',
  secret: config.secret ? SECRET_MASK : '',
})

const loadState = async () => ({
  ...defaultState(),
  ...(await readJsonFile(statePath, defaultState)),
})

const saveState = async (state) => {
  await writeJsonFile(statePath, {
    ...state,
    events: state.events.slice(-300),
  })
}

const taiwanDateParts = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Taipei',
    year: 'numeric',
  }).formatToParts(new Date())
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    minutes: Number(byType.hour) * 60 + Number(byType.minute),
  }
}

const minutesFor = (time) => {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

const getScheduleGraceMinutes = (config) => {
  const configuredGrace = Number(config.scheduleGraceMinutes ?? process.env.LINE_RELAY_SCHEDULE_GRACE_MINUTES)
  return Number.isFinite(configuredGrace) && configuredGrace >= 0 ? configuredGrace : DEFAULT_SCHEDULE_GRACE_MINUTES
}

const formatMinutes = (minutes) => {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

const sentKey = ({ date, itemId, target }) => `${date}|${target}|${itemId}`
const autoKey = ({ date, partId, target }) => `${date}|${target}|${partId}`

const findPart = (partId) => partDefinitions.find((part) => part.id === partId)

const itemIdsForPart = (partId) => {
  const part = findPart(partId)
  if (!part) throw new Error(`Unknown part: ${partId}`)
  return part.itemIds
}

const scheduleStatusFor = ({ config, state }) => {
  const { date, minutes } = taiwanDateParts()
  const target = config.target || 'V1 LINE OpenChat'
  const graceMinutes = getScheduleGraceMinutes(config)
  const parts = partDefinitions.map((part) => {
    const partConfig = config.parts?.[part.id] || {}
    const scheduledMinutes = minutesFor(partConfig.time)
    const key = autoKey({
      date,
      partId: part.id,
      target,
    })
    const storedAttempt = state.autoAttempts?.[key] || null
    const attemptIsStale = isAttemptStale({
      attempt: storedAttempt,
      staleMs: AUTO_ATTEMPT_STALE_MS,
    })
    const attempt = attemptIsStale
      ? {
          ...storedAttempt,
          error: '上次執行逾時中斷，排程將自動重試。',
          status: 'failed',
        }
      : storedAttempt
    const minutesUntil = scheduledMinutes === null ? null : scheduledMinutes - minutes
    const minutesSince = scheduledMinutes === null ? null : minutes - scheduledMinutes
    const isWithinWindow = scheduledMinutes !== null && minutesSince >= 0 && minutesSince <= graceMinutes
    const isMissed = scheduledMinutes !== null && minutesSince > graceMinutes && !attempt
    const isDue = Boolean(config.autoEnabled && partConfig.enabled && isWithinWindow && (!attempt || ['cancelled', 'failed'].includes(attempt.status)))

    return {
      attempt,
      enabled: Boolean(partConfig.enabled),
      id: part.id,
      isDue,
      isMissed,
      isWithinWindow,
      label: part.label,
      minutesSince,
      minutesUntil,
      nextRunTime: scheduledMinutes === null ? '' : formatMinutes(scheduledMinutes),
      scheduledTime: partConfig.time || part.defaultTime,
      status:
        !config.autoEnabled
          ? 'disabled'
          : !partConfig.enabled
            ? 'part_disabled'
            : scheduledMinutes === null
              ? 'invalid_time'
              : attempt?.status
                ? attempt.status
                : isDue
                  ? 'due'
                  : isMissed
                    ? 'missed'
                    : minutesUntil !== null && minutesUntil > 0
                      ? 'waiting'
                      : 'outside_window',
    }
  })

  return {
    autoEnabled: Boolean(config.autoEnabled),
    autoSendEnabled: Boolean(config.autoSendEnabled),
    date,
    graceMinutes,
    mode: config.autoSendEnabled ? 'send' : 'draft',
    nowTime: formatMinutes(minutes),
    parts,
    target,
  }
}

const addEvent = async (type, message, details = {}) => {
  const state = await loadState()
  state.events.push({
    at: new Date().toISOString(),
    details,
    message,
    type,
  })
  await saveState(state)
}

const activeTaskRequests = new Set()

const requestBuffer = ({
  body,
  headers = {},
  method = 'GET',
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  trackTask = Boolean(currentSendOperation),
  url,
}) =>
  new Promise((resolve, reject) => {
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
          activeTaskRequests.delete(request)
          resolve({
            body: Buffer.concat(chunks),
            statusCode: response.statusCode || 0,
          })
        })
      },
    )

    if (trackTask) activeTaskRequests.add(request)
    request.on('error', (error) => {
      activeTaskRequests.delete(request)
      reject(error)
    })
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s: ${parsedUrl.origin}${parsedUrl.pathname}`))
    })
    request.end(body)
  })

const isLocalUrl = (url) => ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)

const markSentUrlFor = ({ config, sharePackage }) => {
  if (config.markSentUrl) return new URL(config.markSentUrl)
  if (sharePackage.markSentUrl) return new URL(sharePackage.markSentUrl)

  const url = new URL(config.apiUrl)
  url.pathname = url.pathname.replace(/\/package\/?$/, '/mark-sent')
  return url
}

const postJson = async ({ body, config, url }) => {
  const headers = {
    'content-type': 'application/json',
  }
  if (config.secret) headers['x-daily-report-secret'] = config.secret
  if (isLocalUrl(url)) headers['x-daily-report-dev-relay'] = '1'

  const response = await requestBuffer({
    body: JSON.stringify(body),
    headers,
    method: 'POST',
    url,
  })
  const text = response.body.toString('utf8')
  let responseBody = {}
  if (text) {
    try {
      responseBody = JSON.parse(text)
    } catch {
      throw new Error(`API returned non-JSON response (${response.statusCode}): ${text.slice(0, 240)}`)
    }
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(responseBody?.error || `API failed with status ${response.statusCode}`)
  }
  return responseBody
}

const packageUrlFor = ({ config, date, generate = 'none' }) => {
  const url = new URL(config.apiUrl)
  url.searchParams.set('generate', generate)
  if (date) url.searchParams.set('date', date)
  return url
}

const partUrlFor = ({ config, date, partId }) => {
  const url = new URL(config.apiUrl)
  url.pathname = url.pathname.replace(/\/package\/?$/, `/${partId}`)
  url.search = ''
  if (date) url.searchParams.set('date', date)
  return url
}

const regenerateCloudPart = async ({ config, date, partId }) => {
  if (!partDefinitions.some((part) => part.id === partId)) return null

  const url = partUrlFor({
    config,
    date,
    partId,
  })
  const headers = {}
  if (config.secret) headers['x-daily-report-secret'] = config.secret
  if (isLocalUrl(url)) headers['x-daily-report-dev-relay'] = '1'

  await addEvent('part_regenerate_started', `${partId} cloud regenerate started`, {
    date: date || 'today',
  })
  const response = await requestBuffer({
    headers,
    url,
  })
  const text = response.body.toString('utf8')
  let body = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`${partId} API returned non-JSON response (${response.statusCode}): ${text.slice(0, 240)}`)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(body?.error || `${partId} API failed with status ${response.statusCode}`)
  }
  await addEvent('part_regenerate_success', `${partId} cloud regenerate completed`, {
    date: date || body?.report?.reportDate || 'today',
  })

  return body
}

const fetchPackage = async ({ config, date, generate = 'none' }) => {
  const url = packageUrlFor({
    config,
    date,
    generate,
  })
  const headers = {}
  if (config.secret) headers['x-daily-report-secret'] = config.secret
  if (isLocalUrl(url)) headers['x-daily-report-dev-relay'] = '1'

  const response = await requestBuffer({
    headers,
    url,
  })
  const text = response.body.toString('utf8')
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Package API returned non-JSON response (${response.statusCode}): ${text.slice(0, 240)}`)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = new Error(body?.error || `Package API failed with status ${response.statusCode}`)
    error.statusCode = response.statusCode
    throw error
  }
  if (!body.package?.items?.length) {
    throw new Error('Package API response is missing package.items')
  }
  return body.package
}

let currentJob = null
let currentRelayProcess = null
let currentSendOperation = null

const appendJobLogs = (job, text) => {
  const lines = String(text || '').split('\n').filter(Boolean)
  if (!lines.length) return

  job.logs = [...(job.logs || []), ...lines].slice(-120)
}

const buildRelayEnv = (config) => {
  const visionProvider = config.visionProvider || 'proxy'

  return {
    ...process.env,
    DAILY_REPORT_GENERATE: config.generate || 'missing',
    DAILY_REPORT_MARK_SENT_URL: config.markSentUrl || '',
    DAILY_REPORT_PACKAGE_URL: config.apiUrl || '',
    DAILY_REPORT_SHARED_SECRET: config.secret || '',
    LINE_APP_NAME: config.lineApp || 'LINE',
    LINE_RELAY_OPERATOR: config.operator || 'macOS relay app',
    LINE_RELAY_INPUT_CLICK: config.inputClick || '',
    LINE_RELAY_PASTE_METHOD: config.pasteMethod || 'keycode',
    LINE_RELAY_ROOM_NAME: config.roomName || '',
    LINE_RELAY_SEND_KEY: config.sendKey || 'enter',
    LINE_RELAY_SMART_ROOM_STEPS: config.smartRoomSteps || '2,1,3,0,4',
    LINE_RELAY_TARGET: config.target || 'V1 LINE OpenChat',
    LINE_RELAY_VERIFY_THRESHOLD: String(config.verifyThreshold || 0.85),
    LINE_RELAY_VISION_MODEL: config.visionModel || 'openai/gpt-4.1-mini',
    LINE_RELAY_VISION_PROVIDER: visionProvider,
    LINE_RELAY_VISION_PROXY_URL: config.visionProxyUrl || '',
    LINE_RELAY_WINDOW_BOUNDS: config.windowBounds || '',
    OPENROUTER_API_KEY:
      visionProvider === 'openrouter' ? config.openRouterApiKey || process.env.OPENROUTER_API_KEY || '' : '',
    OPENROUTER_APP_NAME: config.openRouterAppName || 'daily-report-line-relay',
    OPENROUTER_SITE_URL: config.openRouterSiteUrl || 'http://localhost',
  }
}

const nodeExecutable = () => {
  const candidates = [
    process.execPath,
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ]

  return candidates.find((candidate) => candidate && existsSync(candidate)) || 'node'
}

const runRelay = async ({ args, config, type }) => {
  if (currentJob?.status === 'running') {
    throw new Error(`Another job is still running: ${currentJob.type}`)
  }

  const job = {
    args,
    endedAt: null,
    id: `${Date.now()}`,
    logs: [],
    startedAt: new Date().toISOString(),
    status: 'running',
    stopRequestedAt: null,
    type,
  }
  currentJob = job

  try {
    await addEvent('job_started', `${type} started`, {
      args,
    })
    const accessibility = await checkAccessibilityPermission()
    if (!accessibility.ok) {
      throw new Error(accessibility.message)
    }
    const executable = nodeExecutable()
    appendJobLogs(job, `Using node: ${executable}`)
    appendJobLogs(job, `Relay args: ${args.join(' ')}`)
    const { stdout, stderr } = await new Promise((resolve, reject) => {
      const child = execFile(executable, [join(scriptDirectory, 'relay.mjs'), ...args], {
        cwd: scriptDirectory,
        env: buildRelayEnv(config),
        maxBuffer: 1024 * 1024 * 12,
      })
      currentRelayProcess = child
      let stdout = ''
      let stderr = ''
      let finished = false
      const timeoutMs = Number(config.relayJobTimeoutMs || process.env.LINE_RELAY_JOB_TIMEOUT_MS || DEFAULT_RELAY_JOB_TIMEOUT_MS)
      const timeout = setTimeout(() => {
        if (finished) return
        appendJobLogs(job, `Relay timeout after ${Math.round(timeoutMs / 1000)}s. Stopping current task.`)
        child.kill('SIGTERM')
        setTimeout(() => {
          if (!finished && !child.killed) child.kill('SIGKILL')
        }, 3000).unref()
      }, timeoutMs)

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString()
        stdout += text
        appendJobLogs(job, text)
      })
      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString()
        stderr += text
        appendJobLogs(job, text)
      })
      child.on('error', reject)
      child.on('close', (code, signal) => {
        finished = true
        clearTimeout(timeout)
        currentRelayProcess = null
        if (job.stopRequestedAt) {
          const error = new Error(`Task stopped by user${signal ? ` (${signal})` : ''}`)
          error.stdout = stdout
          error.stderr = stderr
          error.cancelled = true
          reject(error)
          return
        }
        if (code === 0) {
          resolve({
            stderr,
            stdout,
          })
          return
        }
        const error = new Error(`Relay exited with code ${code}${signal ? ` (${signal})` : ''}`)
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      })
    })
    appendJobLogs(job, [stdout, stderr].filter(Boolean).join('\n'))
    job.status = 'success'
    job.endedAt = new Date().toISOString()
    await addEvent('job_success', `${type} completed`, {
      lines: job.logs.slice(-20),
    })
    return job
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendJobLogs(job, [error?.stdout, error?.stderr, message].filter(Boolean).join('\n'))
    job.status = error?.cancelled ? 'cancelled' : 'failed'
    job.endedAt = new Date().toISOString()
    await addEvent(error?.cancelled ? 'job_cancelled' : 'job_failed', `${type} ${error?.cancelled ? 'cancelled' : 'failed'}`, {
      message,
      lines: job.logs.slice(-20),
    })
    throw error
  }
}

const relayOutputLines = (error) =>
  [error?.stdout, error?.stderr, error instanceof Error ? error.message : String(error)]
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .filter(Boolean)

const hasStartedLineDelivery = (lines) => {
  return lines.some((line) => /^(Sending|Pasting) (text|image)/.test(line))
}

const isLineDeliveryArgs = (args = []) => args.includes('--send') || args.includes('--draft')

const retryAttemptsFor = ({ args = [], config }) => {
  if (isLineDeliveryArgs(args)) return 1

  const attempts = Number(config.retryAttempts || process.env.LINE_RELAY_RETRY_ATTEMPTS || 1)
  return Number.isFinite(attempts) && attempts > 0 ? Math.min(Math.floor(attempts), 3) : 1
}

const runRelayWithRetry = async ({ args, config, type }) => {
  const attempts = retryAttemptsFor({
    args,
    config,
  })
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attemptArgs = attempt === 1 || args.includes('--allow-resend') ? args : [...args, '--allow-resend']
    const attemptType = attempt === 1 ? type : `${type}-retry${attempt}`

    try {
      return await runRelay({
        args: attemptArgs,
        config,
        type: attemptType,
      })
    } catch (error) {
      lastError = error
      const lines = relayOutputLines(error)
      const canRetry = !error?.cancelled && attempt < attempts && !hasStartedLineDelivery(lines)
      if (!canRetry) break

      await addEvent('job_retry', `${type} retry ${attempt + 1}/${attempts}`, {
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  throw lastError
}

const stopCurrentJob = async () => {
  const relayIsRunning = Boolean(currentJob && ['running', 'stopping'].includes(currentJob.status))
  const sendIsRunning = Boolean(currentSendOperation)

  if (!relayIsRunning && !sendIsRunning) {
    return {
      job: currentJob,
      stopped: false,
    }
  }

  if (currentSendOperation) currentSendOperation.cancelled = true
  for (const request of activeTaskRequests) {
    request.destroy(new Error('Task stopped by user'))
  }

  if (relayIsRunning) {
    currentJob.status = 'stopping'
    currentJob.stopRequestedAt = new Date().toISOString()
    currentJob.logs = [...(currentJob.logs || []), 'Stop requested by user.']
  }

  if (currentRelayProcess && !currentRelayProcess.killed) {
    currentRelayProcess.kill('SIGTERM')
    setTimeout(() => {
      if (currentRelayProcess && !currentRelayProcess.killed) currentRelayProcess.kill('SIGKILL')
    }, 3000).unref()
  }

  await addEvent('job_stop_requested', `${currentJob?.type || currentSendOperation?.type || 'send operation'} stop requested`)
  return {
    job: currentJob,
    stopped: true,
  }
}

const packageWithLocalStatus = async ({ config, date, generate = 'none' }) => {
  const [sharePackage, state] = await Promise.all([
    fetchPackage({
      config,
      date,
      generate,
    }),
    loadState(),
  ])
  const target = config.target || 'V1 LINE OpenChat'

  return {
    ...sharePackage,
    parts: partDefinitions.map((part) => {
      const items = sharePackage.items.filter((item) => part.itemIds.includes(item.id))
      const missingIds = part.itemIds.filter((id) => !sharePackage.items.some((item) => item.id === id))
      return {
        ...part,
        enabled: Boolean(config.parts?.[part.id]?.enabled),
        items: items.map((item) => ({
          ...item,
          localSent: Boolean(state.sent[sentKey({
            date: sharePackage.reportDate,
            itemId: item.id,
            target,
          })]),
        })),
        missingIds,
        time: config.parts?.[part.id]?.time || part.defaultTime,
      }
    }),
    items: sharePackage.items.map((item) => ({
      ...item,
      localSent: Boolean(state.sent[sentKey({
        date: sharePackage.reportDate,
        itemId: item.id,
        target,
      })]),
    })),
  }
}

const markLocalSent = async ({ config, itemIds, reportDate }) => {
  const state = await loadState()
  const target = config.target || 'V1 LINE OpenChat'
  const sentAt = new Date().toISOString()
  for (const itemId of itemIds) {
    state.sent[sentKey({
      date: reportDate,
      itemId,
      target,
    })] = {
      itemId,
      reportDate,
      sentAt,
      target,
    }
  }
  await saveState(state)
}

const maybeMarkCloudSent = async ({ config, reportDate, sharePackage }) => {
  const state = await loadState()
  const target = config.target || 'V1 LINE OpenChat'
  const allSent = sharePackage.items.every((item) =>
    Boolean(state.sent[sentKey({
      date: reportDate,
      itemId: item.id,
      target,
    })]),
  )
  if (!allSent) return false

  const sentItems = sharePackage.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    label: item.label,
    mediaId: item.kind === 'image' ? item.mediaId : undefined,
    url: item.kind === 'image' ? item.url : undefined,
  }))
  const imageCount = sharePackage.items.filter((item) => item.kind === 'image').length
  await postJson({
    body: {
      imageCount,
      operator: config.operator || 'macOS relay app',
      reportDate,
      reportId: sharePackage.reportId,
      sentItems,
      target,
    },
    config,
    url: markSentUrlFor({
      config,
      sharePackage,
    }),
  })
  await addEvent('cloud_mark_sent', `All parts sent. Cloud report marked sent for ${reportDate}`)
  return true
}

const errorPrefixForPart = (partId) => {
  if (partId === 'part1') return ['crypto-news', 'cryptobubbles-screenshot', 'coin360-screenshot']
  if (partId === 'part2') return ['part2-']
  if (partId === 'part3') return ['part3-']

  return []
}

const packageHasPartError = ({ partId, sharePackage }) => {
  const prefixes = errorPrefixForPart(partId)

  return Boolean(
    prefixes.length &&
      sharePackage.errorLogs?.some((errorLog) => prefixes.some((prefix) => String(errorLog.scope || '').startsWith(prefix))),
  )
}

const selectedPackageProblem = ({ partId, selectedIds, sharePackage }) => {
  const selectedMissing = selectedIds.filter((id) => !sharePackage.items.some((item) => item.id === id))
  const partErrors = partId
    ? (sharePackage.errorLogs || []).filter((errorLog) =>
        errorPrefixForPart(partId).some((prefix) => String(errorLog.scope || '').startsWith(prefix)),
      )
    : []

  const shouldUseWholePackageReadiness = !partId

  if (
    selectedMissing.length ||
    partErrors.length ||
    (shouldUseWholePackageReadiness && (sharePackage.status === 'failed' || !sharePackage.ready))
  ) {
    return [
      shouldUseWholePackageReadiness && sharePackage.status === 'failed' ? 'Package status is failed.' : '',
      shouldUseWholePackageReadiness && !sharePackage.ready ? 'Package is not ready.' : '',
      selectedMissing.length ? `Missing selected item ids: ${selectedMissing.join(', ')}` : '',
      ...partErrors.map((errorLog) => `${errorLog.scope}: ${errorLog.message}`),
    ]
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

const sendItemsUnlocked = async ({ date = '', draft = false, force = false, itemIds = [], partId = '', source = 'manual' }) => {
  const config = await loadConfig()
  if (!config.roomName) throw new Error('LINE room name is not configured')

  const effectiveForce = Boolean(force || config.allowResend)
  if (source === 'manual' && partId && effectiveForce) {
    await regenerateCloudPart({
      config,
      date,
      partId,
    })
  }
  let sharePackage
  try {
    sharePackage = await packageWithLocalStatus({
      config,
      date,
      generate: 'none',
    })
  } catch (error) {
    if (!partId || error?.statusCode !== 404) throw error
    await addEvent('cloud_part_regenerate', `Generating missing ${partId} report data`)
    await regenerateCloudPart({ config, date, partId })
    sharePackage = await packageWithLocalStatus({ config, date, generate: 'none' })
  }
  const selectedIds = itemIds.length ? itemIds : sharePackage.items.map((item) => item.id)
  const selectedIdsMissing = selectedIds.some((id) => !sharePackage.items.some((item) => item.id === id))

  if (partId && !effectiveForce && (selectedIdsMissing || packageHasPartError({ partId, sharePackage }))) {
    await addEvent('cloud_part_regenerate', `Regenerating ${partId} because selected data is missing or invalid`)
    await regenerateCloudPart({
      config,
      date,
      partId,
    })
    sharePackage = await packageWithLocalStatus({
      config,
      date,
      generate: 'none',
    })
  }

  const problem = selectedPackageProblem({
    partId,
    selectedIds,
    sharePackage,
  })
  if (problem) {
    throw new Error(problem)
  }

  const missingSelectedIds = selectedIds.filter((id) => !sharePackage.items.some((item) => item.id === id))
  if (missingSelectedIds.length) {
    throw new Error(`Package API is missing selected item ids: ${missingSelectedIds.join(', ')}`)
  }
  const selectedItems = sharePackage.items.filter((item) => selectedIds.includes(item.id))
  if (!selectedItems.length) throw new Error('No selected package items')

  if (sharePackage.status === 'sent' && !effectiveForce) {
    await addEvent('send_skipped', 'Cloud package already marked sent', {
      date: sharePackage.reportDate,
      source,
    })
    return {
      skipped: true,
      reason: 'cloud_sent',
      reportDate: sharePackage.reportDate,
      sentIds: [],
    }
  }

  const pendingItems = effectiveForce ? selectedItems : selectedItems.filter((item) => !item.localSent)
  if (!pendingItems.length) {
    await addEvent('send_skipped', 'All selected items were already sent locally', {
      date: sharePackage.reportDate,
      source,
    })
    return {
      skipped: true,
      reason: 'local_sent',
      reportDate: sharePackage.reportDate,
      sentIds: [],
    }
  }

  const shouldDraft = Boolean(draft)
  const sendBatches = sendBatchesFor({
    draft: shouldDraft,
    items: pendingItems,
    source,
  })
  const sentIds = []

  for (const batch of sendBatches) {
    const batchIds = batch.map((item) => item.id)
    const args = [
      shouldDraft ? '--draft' : '--send',
      '--auto',
      '--smart-room',
      '--verify-before-send',
      '--no-mark-sent',
      '--generate',
      'none',
      '--room-name',
      config.roomName,
      '--item-ids',
      batchIds.join(','),
    ]
    if (date) args.push('--date', date)
    if (effectiveForce || config.allowResend) args.push('--allow-resend')
    if (shouldCombineImagesFor({ partId, source })) args.push('--combine-images')

    await runRelayWithRetry({
      args,
      config,
      type: source === 'auto' ? `${shouldDraft ? 'auto-draft' : 'auto-send'}-${partId || 'custom'}` : `manual-send-${partId || 'custom'}`,
    })

    if (!shouldDraft) {
      await markLocalSent({
        config,
        itemIds: batchIds,
        reportDate: sharePackage.reportDate,
      })
      sentIds.push(...batchIds)
    }
  }

  let cloudMarkedSent = false
  if (!shouldDraft) {
    cloudMarkedSent = await maybeMarkCloudSent({
      config,
      reportDate: sharePackage.reportDate,
      sharePackage,
    })
  }

  return {
    cloudMarkedSent,
    draft: shouldDraft,
    partId,
    reportDate: sharePackage.reportDate,
    sentIds: shouldDraft ? pendingItems.map((item) => item.id) : sentIds,
    skipped: false,
  }
}

const sendItems = async (options) => {
  if (currentSendOperation) {
    throw new Error(`Another send operation is still running: ${currentSendOperation.type}`)
  }

  const operation = {
    id: `${Date.now()}`,
    logs: ['Preparing report package and validating images.'],
    startedAt: new Date().toISOString(),
    status: 'preparing',
    type: `${options.source || 'manual'}-${options.partId || 'custom'}`,
  }
  currentSendOperation = operation

  try {
    return await sendItemsUnlocked(options)
  } catch (error) {
    if (operation.cancelled && error && typeof error === 'object') error.cancelled = true
    throw error
  } finally {
    if (currentSendOperation?.id === operation.id) currentSendOperation = null
  }
}

const runVerify = async () => {
  const config = await loadConfig()
  if (!config.roomName) throw new Error('LINE room name is not configured')
  return runRelay({
    args: ['--verify-room', '--room-name', config.roomName],
    config,
    type: 'verify-room',
  })
}

const runOpenRoom = async () => {
  const config = await loadConfig()
  if (!config.roomName) throw new Error('LINE room name is not configured')
  return runRelay({
    args: ['--test-room-open', '--smart-room', '--room-name', config.roomName],
    config,
    type: 'open-room',
  })
}

const runTestSend = async ({ message = '' } = {}) => {
  const config = await loadConfig()
  if (!config.roomName) throw new Error('LINE room name is not configured')
  const text = message || `LINE relay test ${new Date().toISOString()}`
  return runRelay({
    args: ['--test-send-message', text, '--room-name', config.roomName],
    config,
    type: 'test-send-message',
  })
}

const clearDate = async ({ date }) => {
  const config = await loadConfig()
  const state = await loadState()
  const prefix = `${date}|${config.target || 'V1 LINE OpenChat'}|`
  for (const key of Object.keys(state.sent)) {
    if (key.startsWith(prefix)) delete state.sent[key]
  }
  for (const part of partDefinitions) {
    delete state.autoAttempts[autoKey({
      date,
      partId: part.id,
      target: config.target || 'V1 LINE OpenChat',
    })]
  }
  await saveState(state)
  await addEvent('state_cleared', `Cleared local sent state for ${date}`)
}

const maybeRunSchedule = async ({ ignoreGrace = false, trigger = 'timer' } = {}) => {
  const config = await loadConfig()
  if (!config.autoEnabled) return
  if (isScheduleBusy({
    hasSendOperation: Boolean(currentSendOperation),
    relayJobStatus: currentJob?.status,
  })) {
    return {
      reason: 'busy',
      started: false,
    }
  }

  const { date, minutes } = taiwanDateParts()
  const scheduleGraceMinutes = getScheduleGraceMinutes(config)

  for (const part of partDefinitions) {
    const partConfig = config.parts?.[part.id]
    if (!partConfig?.enabled) continue
    const scheduledMinutes = minutesFor(partConfig.time)
    if (scheduledMinutes === null || minutes < scheduledMinutes) continue
    if (!ignoreGrace && minutes - scheduledMinutes > scheduleGraceMinutes) continue

    const state = await loadState()
    const key = autoKey({
      date,
      partId: part.id,
      target: config.target || 'V1 LINE OpenChat',
    })
    let previousAttempt = state.autoAttempts[key]
    const retryLimit = Number(config.autoRetryLimit || DEFAULT_AUTO_RETRY_LIMIT)
    const attemptDecision = scheduleAttemptDecision({
      attempt: previousAttempt,
      retryLimit,
      staleMs: AUTO_ATTEMPT_STALE_MS,
    })

    if (attemptDecision.stale) {
      previousAttempt = {
        ...previousAttempt,
        error: 'Previous run was interrupted and automatically recovered.',
        status: 'failed',
      }
      state.autoAttempts[key] = previousAttempt
      await saveState(state)
      await addEvent('auto_schedule_recovered', `${part.id} stale running state recovered`, {
        date,
        previousAttemptAt: previousAttempt.at,
      })
    }
    if (!attemptDecision.canRun) continue

    state.autoAttempts[key] = {
      at: new Date().toISOString(),
      attempt: Number(previousAttempt?.attempt || 0) + 1,
      partId: part.id,
      status: 'running',
      trigger,
    }
    await saveState(state)
    await addEvent('auto_schedule_started', `${part.id} scheduled run started`, {
      date,
      scheduledTime: partConfig.time,
      trigger,
    })

    sendItems({
      date,
      draft: !config.autoSendEnabled,
      itemIds: part.itemIds,
      partId: part.id,
      source: 'auto',
    })
      .then(async (result) => {
        const nextState = await loadState()
        nextState.autoAttempts[key] = {
          at: new Date().toISOString(),
          attempt: Number(state.autoAttempts[key]?.attempt || 1),
          partId: part.id,
          result,
          status: 'success',
          trigger,
        }
        await saveState(nextState)
        await addEvent('auto_schedule_success', `${part.id} scheduled run completed`, {
          date,
          result,
          trigger,
        })
      })
      .catch(async (error) => {
        const nextState = await loadState()
        nextState.autoAttempts[key] = {
          at: new Date().toISOString(),
          attempt: Number(state.autoAttempts[key]?.attempt || 1),
          error: error instanceof Error ? error.message : String(error),
          partId: part.id,
          status: 'failed',
          trigger,
        }
        await saveState(nextState)
        await addEvent('auto_schedule_failed', `${part.id} scheduled run failed`, {
          date,
          message: error instanceof Error ? error.message : String(error),
          trigger,
        })
      })

    return {
      partId: part.id,
      started: true,
    }
  }

  return {
    started: false,
  }
}

setInterval(() => {
  maybeRunSchedule().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
  })
}, 30_000)

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body, null, 2))
}

const html = String.raw`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LINE 日報控制台</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #202124; color: #f3f4f6; }
    main { max-width: 1120px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 24px; margin: 0 0 16px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    section { background: #2b2d31; border: 1px solid #42454d; border-radius: 8px; padding: 16px; }
    label { display: grid; gap: 6px; font-size: 12px; color: #bfc4cf; margin-bottom: 10px; }
    input, select { background: #18191c; border: 1px solid #50535c; color: #fff; border-radius: 6px; padding: 9px 10px; font: inherit; }
    input[type="checkbox"] { width: auto; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    button { background: #e6e6e6; border: 0; border-radius: 6px; color: #111; cursor: pointer; font: inherit; font-weight: 650; padding: 9px 12px; }
    button.primary { background: #19c37d; color: #04150e; }
    button.warn { background: #f6c76f; color: #1f1300; }
    button.danger { background: #ff6b6b; color: #210707; }
    button:disabled { cursor: wait; opacity: 0.55; }
    .status { background: #17181b; border-radius: 6px; color: #d7dbe3; min-height: 140px; overflow: auto; padding: 12px; white-space: pre-wrap; }
    .items { display: grid; gap: 8px; }
    .item { align-items: center; background: #222429; border: 1px solid #3a3d45; border-radius: 6px; display: grid; gap: 8px; grid-template-columns: auto 1fr auto; padding: 10px; }
    .tag { border: 1px solid #5a5f6b; border-radius: 999px; color: #d4d8e1; font-size: 12px; padding: 2px 8px; }
    .sent { border-color: #19c37d; color: #7df0ba; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } main { padding: 14px; } }
  </style>
</head>
<body>
  <main>
    <h1>LINE 日報控制台</h1>
    <div class="grid">
      <section>
        <h2>設定</h2>
        <label>Package API <input id="apiUrl"></label>
        <label>Mark Sent API <input id="markSentUrl"></label>
        <label>Shared Secret <input id="secret" type="password"></label>
        <label>Vision Provider
          <select id="visionProvider">
            <option value="proxy">Cloud Proxy</option>
            <option value="openrouter">OpenRouter Direct</option>
            <option value="openai">OpenAI Direct</option>
          </select>
        </label>
        <label>Vision Proxy API <input id="visionProxyUrl" placeholder="空白 = Package API 同站 /vision-verify"></label>
        <label>OpenRouter Key（直連備用）<input id="openRouterApiKey" type="password"></label>
        <label>LINE 社群名稱 <input id="roomName"></label>
        <label>Smart Steps <input id="smartRoomSteps"></label>
        <label>驗證失敗重試次數 <input id="retryAttempts" type="number" min="1" max="3"></label>
        <label>補跑窗口（分鐘）<input id="scheduleGraceMinutes" type="number" min="0" max="720"></label>
        <label>Vision Model <input id="visionModel"></label>
        <label>Window Bounds <input id="windowBounds"></label>
        <div class="row">
          <label class="row"><input id="autoEnabled" type="checkbox"> 啟用分段排程</label>
          <label class="row"><input id="autoSendEnabled" type="checkbox"> 排程到點直接送出</label>
          <label class="row"><input id="allowResend" type="checkbox"> 允許重發</label>
          <button class="primary" id="saveSettings">儲存設定</button>
        </div>
      </section>

      <section>
        <h2>操作</h2>
        <div class="row">
          <button id="checkPermissions">檢查 Mac 權限</button>
          <button id="openAccessibility">打開輔助使用設定</button>
          <button id="refreshPackage">讀取今日 package</button>
          <button id="verifyRoom">只檢查畫面</button>
          <button id="openRoom">自動開社群</button>
          <button id="runScheduleCheck">立即檢查排程</button>
          <button class="warn" id="testSend">送測試訊息</button>
          <button class="danger" id="stopAll">停止所有任務</button>
        </div>
        <div class="row" style="margin-top: 10px;">
          <label class="row"><input id="forceSend" type="checkbox"> 重送已成功項目</label>
          <button class="primary" id="sendSelected">貼上選取項目</button>
          <button class="warn" id="clearToday">清除今日本地紀錄</button>
        </div>
        <div style="margin-top: 14px;" class="status" id="statusBox">等待操作...</div>
      </section>
    </div>

    <section style="margin-top: 16px;">
      <h2>分段排程</h2>
      <div class="status" id="scheduleStatus" style="margin-bottom: 10px; min-height: 80px;"></div>
      <div class="items" id="partCards"></div>
    </section>

    <section style="margin-top: 16px;">
      <h2>今日項目</h2>
      <div class="items" id="items"></div>
    </section>

    <section style="margin-top: 16px;">
      <h2>Log</h2>
      <div class="status" id="logs"></div>
    </section>
  </main>

  <script>
    const partDefinitions = ${JSON.stringify(partDefinitions)}
    const fields = ['apiUrl','markSentUrl','secret','visionProvider','visionProxyUrl','openRouterApiKey','roomName','smartRoomSteps','retryAttempts','scheduleGraceMinutes','visionModel','windowBounds']
    const checks = ['autoEnabled','autoSendEnabled','allowResend']
    const $ = (id) => document.getElementById(id)
    let currentPackage = null
    let currentPartsConfig = {}

    const api = async (path, options = {}) => {
      const res = await fetch(path, {
        headers: { 'content-type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Request failed')
      return json
    }

    const setBusy = (busy) => {
      for (const button of document.querySelectorAll('button')) {
        if (button.id === 'stopAll') continue
        button.disabled = busy
      }
    }

    const show = (value) => { $('statusBox').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2) }

    const scheduleStatusText = (schedule) => {
      if (!schedule) return '尚未取得排程狀態'
      const header = [
        '今天：' + schedule.date + ' ' + schedule.nowTime,
        '總排程：' + (schedule.autoEnabled ? '開啟' : '關閉'),
        '模式：' + (schedule.autoSendEnabled ? '到點直接送出' : '到點只貼草稿'),
        '補跑窗口：' + schedule.graceMinutes + ' 分鐘',
      ].join('｜')
      const lines = (schedule.parts || []).map((part) => {
        const attempt = part.attempt ? '，上次：' + part.attempt.status + ' ' + (part.attempt.error || '') : ''
        const note =
          part.status === 'waiting'
            ? '還沒到點'
            : part.status === 'missed'
              ? '已錯過補跑窗口'
              : part.status === 'due'
                ? '可觸發'
                : part.status === 'disabled'
                  ? '總排程關閉'
                  : part.status === 'part_disabled'
                    ? '此段關閉'
                    : part.status === 'invalid_time'
                      ? '時間格式錯誤'
                      : part.status === 'outside_window'
                        ? '不在補跑窗口'
                        : part.status
        return part.label + '｜' + part.scheduledTime + '｜' + note + attempt
      })
      return [header, ...lines].join('\\n')
    }

    const loadConfig = async () => {
      const { config } = await api('/api/config')
      for (const key of fields) $(key).value = config[key] || ''
      for (const key of checks) $(key).checked = Boolean(config[key])
      currentPartsConfig = config.parts || {}
      renderPartCards(config.parts || {})
    }

    const formConfig = () => {
      const config = {}
      for (const key of fields) config[key] = $(key).value.trim()
      for (const key of checks) config[key] = $(key).checked
      config.parts = {}
      for (const part of partDefinitions) {
        config.parts[part.id] = {
          enabled: Boolean($('partEnabled-' + part.id)?.checked),
          time: $('partTime-' + part.id)?.value || part.defaultTime,
        }
      }
      return config
    }

    const persistSettings = async ({ quiet = false } = {}) => {
      const config = formConfig()
      const { config: savedConfig } = await api('/api/config', { method: 'POST', body: config })
      for (const key of fields) $(key).value = savedConfig[key] || ''
      for (const key of checks) $(key).checked = Boolean(savedConfig[key])
      currentPartsConfig = savedConfig.parts || {}
      renderPartCards(savedConfig.parts || {})
      if (!quiet) show({ saved: true, roomName: savedConfig.roomName || '' })
      return savedConfig
    }

    const requireRoomName = () => {
      if (!$('roomName').value.trim()) throw new Error('請先填 LINE 社群名稱，例如：V1加密世界教學論壇')
    }

    const saveSettings = async () => {
      await persistSettings()
    }

    const withSavedSettings = async (fn, { requireRoom = false } = {}) => {
      if (requireRoom) requireRoomName()
      await persistSettings({ quiet: true })
      return fn()
    }

    const withSendReadySettings = async (fn) => {
      requireRoomName()
      await persistSettings({ quiet: true })
      return fn()
    }

    const autoSaveSettings = async () => {
      try {
        await persistSettings({ quiet: true })
        show('排程設定已儲存')
      } catch (error) {
        show(error.message)
      }
    }

    const renderPackage = (pkg) => {
      currentPackage = pkg
      $('items').innerHTML = ''
      for (const item of pkg.items || []) {
        const row = document.createElement('label')
        row.className = 'item'
        row.innerHTML = '<input type="checkbox" class="itemCheck" value="' + item.id + '" ' + (!item.localSent ? 'checked' : '') + '>' +
          '<span><strong>' + item.label + '</strong><br><small>' + item.id + '</small></span>' +
          '<span class="tag ' + (item.localSent ? 'sent' : '') + '">' + item.kind + (item.localSent ? ' / sent' : '') + '</span>'
        $('items').appendChild(row)
      }
      renderPartCards(currentPartsConfig)
      show({ reportDate: pkg.reportDate, ready: pkg.ready, status: pkg.status, itemCount: pkg.items?.length || 0 })
    }

    const renderPartCards = (partsConfig = {}) => {
      $('partCards').innerHTML = ''
      for (const part of partDefinitions) {
        const config = partsConfig[part.id] || {}
        const packagePart = currentPackage?.parts?.find((item) => item.id === part.id)
        const missingIds = packagePart?.missingIds || []
        const sentCount = packagePart?.items?.filter((item) => item.localSent).length || 0
        const itemCount = packagePart?.items?.length || 0
        const packageLine = currentPackage
          ? '<br><small>' + (missingIds.length ? '缺少：' + missingIds.join(', ') : 'API 已有 ' + itemCount + ' 項；本地已成功 ' + sentCount + ' 項') + '</small>'
          : ''
        const card = document.createElement('div')
        card.className = 'item'
        card.style.gridTemplateColumns = '1fr auto auto'
        const buttonLabel = '送出'
        card.innerHTML = '<span><strong>' + part.label + '</strong><br><small>' + part.itemIds.join(', ') + '</small>' + packageLine + '</span>' +
          '<label class="row" style="margin:0;"><input id="partEnabled-' + part.id + '" type="checkbox" ' + (config.enabled ? 'checked' : '') + '> Auto</label>' +
          '<span class="row"><input id="partTime-' + part.id + '" type="time" value="' + (config.time || part.defaultTime) + '"><button class="sendPart" data-part="' + part.id + '">' + buttonLabel + '</button></span>'
        $('partCards').appendChild(card)
      }
      for (const button of document.querySelectorAll('.sendPart')) {
        button.onclick = () => {
          const part = partDefinitions.find((item) => item.id === button.dataset.part)
          const draft = false
          return run(
            () => withSendReadySettings(() => api('/api/send-part', { method: 'POST', body: { draft, force: $('forceSend').checked, partId: button.dataset.part } })),
            { message: '正在檢查社群並送出 ' + (part?.label || button.dataset.part) + '，請不要操作 LINE...' },
          )
        }
      }
      for (const part of partDefinitions) {
        const enabled = $('partEnabled-' + part.id)
        const time = $('partTime-' + part.id)
        if (enabled) enabled.onchange = autoSaveSettings
        if (time) time.onchange = autoSaveSettings
      }
    }

    const refreshPackage = async ({ generate = 'none' } = {}) => {
      const path = generate === 'none' ? '/api/package' : '/api/package?generate=' + encodeURIComponent(generate)
      const { package: pkg } = await api(path)
      renderPackage(pkg)
    }

    const selectedIds = () => Array.from(document.querySelectorAll('.itemCheck:checked')).map((input) => input.value)

    const requireSelectedIds = () => {
      const ids = selectedIds()
      if (!ids.length) throw new Error('請先勾選要發送的項目，或直接按分段排程裡的 Part 發送')
      return ids
    }

    const run = async (fn, { message = '執行中，請稍候...' } = {}) => {
      setBusy(true)
      show(message)
      try {
        const result = await fn()
        show(result)
        await refreshState()
        return result
      } catch (error) {
        show(error.message)
      } finally {
        setBusy(false)
      }
    }

    const refreshState = async () => {
      const { state, job, schedule } = await api('/api/state')
      const events = (state.events || []).slice(-12).reverse().map((event) => '[' + event.at + '] ' + event.type + ' - ' + event.message)
      const jobLines = job ? ['Current job: ' + job.type + ' / ' + job.status, ...(job.logs || []).slice(-20)] : []
      $('logs').textContent = [...jobLines, 'Recent events: last ' + events.length, ...events].join('\\n')
      $('scheduleStatus').textContent = scheduleStatusText(schedule)
    }

    const stopAll = async () => {
      const result = await api('/api/stop', { method: 'POST', body: {} })
      show(result)
      await refreshState()
      return result
    }

    $('saveSettings').onclick = () => run(saveSettings)
    $('checkPermissions').onclick = () => run(() => api('/api/check-permissions', { method: 'POST', body: {} }))
    $('openAccessibility').onclick = () => run(() => api('/api/open-accessibility-settings', { method: 'POST', body: {} }))
    $('refreshPackage').onclick = () => run(() => withSavedSettings(() => refreshPackage({ generate: 'missing' })))
    $('verifyRoom').onclick = () => run(() => withSavedSettings(() => api('/api/verify-room', { method: 'POST', body: {} }), { requireRoom: true }))
    $('openRoom').onclick = () => run(() => withSavedSettings(() => api('/api/open-room', { method: 'POST', body: {} }), { requireRoom: true }))
    $('runScheduleCheck').onclick = () => run(() => withSavedSettings(() => api('/api/run-schedule-check', { method: 'POST', body: {} }), { requireRoom: true }))
    $('testSend').onclick = () => run(() => withSendReadySettings(() => api('/api/test-send', { method: 'POST', body: {} })))
    $('stopAll').onclick = () => stopAll().catch((error) => show(error.message))
    $('sendSelected').onclick = () => run(() => withSendReadySettings(() => api('/api/send', { method: 'POST', body: { draft: true, force: $('forceSend').checked, itemIds: requireSelectedIds() } })))
    $('clearToday').onclick = () => run(() => withSavedSettings(() => api('/api/clear-today', { method: 'POST', body: {} })))
    $('autoEnabled').onchange = autoSaveSettings
    $('autoSendEnabled').onchange = autoSaveSettings
    $('allowResend').onchange = autoSaveSettings

    loadConfig().then(refreshPackage).then(refreshState).catch((error) => show(error.message))
    setInterval(refreshState, 5000)
  </script>
</body>
</html>`

const route = async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  try {
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
      })
      response.end(html)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/config') {
      sendJson(response, 200, {
        config: publicConfig(await loadConfig()),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/config') {
      const body = await readRequestBody(request)
      sendJson(response, 200, {
        config: publicConfig(await saveConfig(body)),
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/state') {
      const config = await loadConfig()
      const state = await loadState()
      sendJson(response, 200, {
        job: currentSendOperation || currentJob,
        schedule: scheduleStatusFor({
          config,
          state,
        }),
        state,
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/stop') {
      sendJson(response, 200, await stopCurrentJob())
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/check-permissions') {
      const [accessibility, screenRecording] = await Promise.all([
        checkAccessibilityPermission(),
        checkScreenRecordingPermission(),
      ])
      sendJson(response, 200, {
        ok: accessibility.ok && screenRecording.ok,
        services: [accessibility, screenRecording],
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/open-accessibility-settings') {
      sendJson(response, 200, await openAccessibilitySettings())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/package') {
      const config = await loadConfig()
      const date = url.searchParams.get('date') || ''
      const generate = url.searchParams.get('generate') || 'none'
      sendJson(response, 200, {
        package: await packageWithLocalStatus({
          config,
          date,
          generate,
        }),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/verify-room') {
      sendJson(response, 200, {
        job: await runVerify(),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/open-room') {
      sendJson(response, 200, {
        job: await runOpenRoom(),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/run-schedule-check') {
      sendJson(response, 200, {
        result: await maybeRunSchedule({
          ignoreGrace: true,
          trigger: 'manual-check',
        }),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/test-send') {
      const body = await readRequestBody(request)
      sendJson(response, 200, {
        job: await runTestSend({
          message: typeof body.message === 'string' ? body.message : '',
        }),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/send') {
      const body = await readRequestBody(request)
      sendJson(response, 200, {
        result: await sendItems({
          date: body.date || '',
          draft: Boolean(body.draft),
          force: Boolean(body.force),
          itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
          partId: body.partId || '',
          source: 'manual',
        }),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/send-part') {
      const body = await readRequestBody(request)
      const partId = typeof body.partId === 'string' ? body.partId : ''
      sendJson(response, 200, {
        result: await sendItems({
          date: body.date || '',
          draft: Boolean(body.draft),
          force: Boolean(body.force),
          itemIds: itemIdsForPart(partId),
          partId,
          source: 'manual',
        }),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/run-auto') {
      const body = await readRequestBody(request)
      const partId = typeof body.partId === 'string' ? body.partId : ''
      sendJson(response, 200, {
        result: await sendItems({
          date: body.date || '',
          draft: Boolean(body.draft),
          itemIds: partId ? itemIdsForPart(partId) : [],
          partId,
          source: 'auto',
        }),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/clear-today') {
      const body = await readRequestBody(request)
      const { date } = taiwanDateParts()
      await clearDate({
        date: body.date || date,
      })
      sendJson(response, 200, {
        ok: true,
      })
      return
    }

    sendJson(response, 404, {
      error: 'Not found',
    })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const args = process.argv.slice(2)
const portArgIndex = args.indexOf('--port')
const port = Number(portArgIndex >= 0 ? args[portArgIndex + 1] : process.env.LINE_RELAY_APP_PORT || DEFAULT_PORT)

await mkdir(appDataDirectory, {
  recursive: true,
})
if (!existsSync(configPath)) await saveConfig(await loadConfig())
if (!existsSync(statePath)) await saveState(await loadState())

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    })
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`LINE daily report control panel: http://127.0.0.1:${port}`)
  console.log(`Config: ${configPath}`)
  console.log(`State: ${statePath}`)
})
