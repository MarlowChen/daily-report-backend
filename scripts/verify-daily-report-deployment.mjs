#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const expectedItemIds = [
  'daily-report-news',
  'cryptobubbles-mc',
  'coin360',
  'ctee-newspaper',
  'ctee-newspaper-2',
  'ctee-newspaper-3',
  'economic-daily',
  'economic-daily-2',
  'economic-daily-3',
  'ctee-china-digest',
  'ctee-world-digest',
  'us-stock-heatmap',
  'global-stock-close',
]

const argumentValue = (name) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || '' : ''
}

const taipeiDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Taipei',
    year: 'numeric',
  }).format(new Date())

const loadRelayConfig = async () => {
  try {
    return JSON.parse(await readFile(join(homedir(), '.daily-report-line-relay', 'config.json'), 'utf8'))
  } catch {
    return {}
  }
}

const checkImage = async (item) => {
  try {
    const response = await fetch(item.url, {
      cache: 'no-store',
      headers: { range: 'bytes=0-0' },
      signal: AbortSignal.timeout(30_000),
    })
    const contentType = response.headers.get('content-type') || ''
    await response.body?.cancel()

    return {
      id: item.id,
      ok: response.ok && contentType.startsWith('image/'),
      status: response.status,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      id: item.id,
      ok: false,
      status: 0,
    }
  }
}

const relayConfig = await loadRelayConfig()
const apiUrl = argumentValue('--api-url') || process.env.DAILY_REPORT_PACKAGE_URL || relayConfig.apiUrl || ''
const secret = process.env.DAILY_REPORT_SHARED_SECRET || relayConfig.secret || ''
const reportDate = argumentValue('--date') || taipeiDate()
const generate = argumentValue('--generate') || 'none'

if (!apiUrl) throw new Error('Package API URL is missing. Pass --api-url or configure the LINE relay app first.')
if (!secret || secret === '********') throw new Error('Daily report shared secret is missing.')
if (!['none', 'missing'].includes(generate)) throw new Error('--generate must be none or missing')

const packageUrl = new URL(apiUrl)
packageUrl.searchParams.set('date', reportDate)
packageUrl.searchParams.set('generate', generate)

const response = await fetch(packageUrl, {
  cache: 'no-store',
  headers: { 'x-daily-report-secret': secret },
  signal: AbortSignal.timeout(generate === 'missing' ? 10 * 60_000 : 60_000),
})
const body = await response.json().catch(() => ({}))

if (!response.ok) {
  throw new Error(`Package API failed (${response.status}): ${body.error || 'unknown error'}`)
}

const sharePackage = body.package
if (!sharePackage) throw new Error('Package API response is missing package')

const itemIds = new Set((sharePackage.items || []).map((item) => item.id))
const missingExpectedIds = expectedItemIds.filter((id) => !itemIds.has(id))
const imageItems = (sharePackage.items || []).filter((item) => item.kind === 'image')
const imageChecks = await Promise.all(imageItems.map(checkImage))
const brokenImages = imageChecks.filter((check) => !check.ok)
const hasNewContract = Array.isArray(sharePackage.missingItemIds)
const healthy =
  hasNewContract &&
  sharePackage.ready === true &&
  sharePackage.missingItemIds.length === 0 &&
  missingExpectedIds.length === 0 &&
  brokenImages.length === 0

console.log(`Daily report deployment check: ${healthy ? 'PASS' : 'FAIL'}`)
console.log(`Date: ${reportDate}`)
console.log(`Package: HTTP ${response.status}, ready=${String(sharePackage.ready)}, items=${sharePackage.items?.length || 0}`)
console.log(`New readiness contract: ${hasNewContract ? 'yes' : 'no'}`)
if (sharePackage.missing?.length) console.log(`Missing: ${sharePackage.missing.join(', ')}`)
if (missingExpectedIds.length) console.log(`Missing item ids: ${missingExpectedIds.join(', ')}`)
for (const check of imageChecks) {
  console.log(`Image ${check.id}: ${check.status} ${check.ok ? 'OK' : 'FAIL'}${check.error ? ` (${check.error})` : ''}`)
}

if (!healthy) process.exitCode = 1
