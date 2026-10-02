import type { Payload } from 'payload'
import { access } from 'node:fs/promises'
import path from 'node:path'

import type { DailyReport, Media } from '@/payload-types'

export type DailyReportPartId = 'part1' | 'part2' | 'part3'

export type DailyReportValidationIssue = {
  artifactId?: string
  code: 'missing-report' | 'missing-content' | 'missing-media' | 'media-date-mismatch' | 'media-unavailable' | 'source-error'
  message: string
  partId: DailyReportPartId
}

export type DailyReportValidationResult = {
  checkedAt: string
  imageCount: number
  issues: DailyReportValidationIssue[]
  ready: boolean
  reportId?: string
  retryParts: DailyReportPartId[]
}

const mediaSlots = [
  ['part1', 'cryptobubbles', 'cryptobubblesScreenshot'],
  ['part1', 'coin360', 'coin360Screenshot'],
  ['part2', 'ctee-a1', 'cteeNewspaperScreenshot'],
  ['part2', 'ctee-a2', 'cteeNewspaperPage2Screenshot'],
  ['part2', 'ctee-a3', 'cteeNewspaperPage3Screenshot'],
  ['part2', 'economic-a01', 'economicDailyScreenshot'],
  ['part2', 'economic-a02', 'economicDailyPage2Screenshot'],
  ['part2', 'economic-a03', 'economicDailyPage3Screenshot'],
  ['part3', 'china-digest', 'chinaDigestImage'],
  ['part3', 'world-digest', 'worldDigestImage'],
  ['part3', 'us-heatmap', 'usStockHeatmapImage'],
  ['part3', 'global-close', 'globalStockCloseImage'],
] as const

const partForErrorScope = (scope = ''): DailyReportPartId => {
  if (scope.startsWith('part2-')) return 'part2'
  if (scope.startsWith('part3-')) return 'part3'
  return 'part1'
}

const isMedia = (value: unknown): value is Media => Boolean(value && typeof value === 'object' && 'id' in value)

const resolveMedia = async ({ mediaOrId, payload }: { mediaOrId: Media | string | null | undefined; payload: Payload }) => {
  if (!mediaOrId) return null
  if (isMedia(mediaOrId)) return mediaOrId

  return payload.findByID({
    collection: 'media',
    id: mediaOrId,
    overrideAccess: true,
  })
}

const getMediaSlotValue = (report: DailyReport, partId: DailyReportPartId, fieldName: string) => {
  const part = report[partId] as Record<string, unknown> | null | undefined
  return part?.[fieldName] as Media | string | null | undefined
}

const mediaDateMatches = (media: Media, reportDate: string) => {
  // Payload de-duplicates colliding filenames and can interpret a trailing
  // date segment such as "-01" as a numeric suffix. The generated alt text is
  // the stable artifact identity and is preserved by the idempotent uploader.
  return Boolean(media.alt?.includes(reportDate))
}

const mediaIsAvailable = async (media: Media) => {
  if (media.filename) {
    const mediaDirectory = process.env.PAYLOAD_MEDIA_DIR || path.resolve(process.cwd(), 'media')
    try {
      await access(path.join(mediaDirectory, media.filename))
      return true
    } catch {
      // Production storage may be remote. Fall through to the public URL.
    }
  }

  if (!media.url || !/^https?:\/\//i.test(media.url)) return false

  try {
    const response = await fetch(media.url, {
      cache: 'no-store',
      headers: { range: 'bytes=0-0' },
      signal: AbortSignal.timeout(15_000),
    })
    const contentType = response.headers.get('content-type') || ''
    await response.body?.cancel()
    return response.ok && contentType.toLowerCase().startsWith('image/')
  } catch {
    return false
  }
}

export const validateDailyReport = async ({
  payload,
  reportDate,
}: {
  payload: Payload
  reportDate: string
}): Promise<DailyReportValidationResult> => {
  const result = await payload.find({
    collection: 'dailyReports',
    depth: 1,
    limit: 1,
    overrideAccess: true,
    where: { reportDate: { equals: reportDate } },
  })
  const report = result.docs[0] as DailyReport | undefined
  const checkedAt = new Date().toISOString()

  if (!report) {
    return {
      checkedAt,
      imageCount: 0,
      issues: [{ code: 'missing-report', message: `Daily report ${reportDate} does not exist.`, partId: 'part1' }],
      ready: false,
      retryParts: ['part1', 'part2', 'part3'],
    }
  }

  const issues: DailyReportValidationIssue[] = []
  if ((report.part1?.newsItems?.length || 0) < 8) {
    issues.push({ code: 'missing-content', message: 'Part 1 needs at least 8 news items.', partId: 'part1' })
  }
  if (!(report.part3?.chinaItems?.length && report.part3?.worldItems?.length)) {
    issues.push({ code: 'missing-content', message: 'Part 3 digest items are incomplete.', partId: 'part3' })
  }

  for (const errorLog of report.errorLogs || []) {
    if (errorLog.scope?.startsWith('validation-')) continue
    issues.push({
      code: 'source-error',
      message: `${errorLog.scope}: ${errorLog.message}`,
      partId: partForErrorScope(errorLog.scope || ''),
    })
  }

  let imageCount = 0
  for (const [partId, artifactId, fieldName] of mediaSlots) {
    const media = await resolveMedia({
      mediaOrId: getMediaSlotValue(report, partId, fieldName),
      payload,
    })
    if (!media) {
      issues.push({ artifactId, code: 'missing-media', message: `${artifactId} is missing.`, partId })
      continue
    }

    imageCount += 1
    if (!mediaDateMatches(media, reportDate)) {
      issues.push({
        artifactId,
        code: 'media-date-mismatch',
        message: `${artifactId} does not match ${reportDate}: ${media.filename || media.id}`,
        partId,
      })
    }
    if (!(await mediaIsAvailable(media))) {
      issues.push({ artifactId, code: 'media-unavailable', message: `${artifactId} cannot be read.`, partId })
    }
  }

  const retryParts = [...new Set(issues.map((issue) => issue.partId))]
  return {
    checkedAt,
    imageCount,
    issues,
    ready: issues.length === 0 && imageCount === mediaSlots.length,
    reportId: report.id,
    retryParts,
  }
}

export const persistDailyReportValidation = async ({
  payload,
  validation,
}: {
  payload: Payload
  validation: DailyReportValidationResult
}) => {
  if (!validation.reportId) return
  const report = await payload.findByID({
    collection: 'dailyReports',
    depth: 0,
    id: validation.reportId,
    overrideAccess: true,
  })
  const sourceErrors = (report.errorLogs || []).filter((errorLog) => !errorLog.scope?.startsWith('validation-'))
  const validationErrors = validation.issues
    .filter((issue) => issue.code !== 'source-error')
    .map((issue) => ({
      message: issue.message,
      occurredAt: validation.checkedAt,
      scope: `validation-${issue.partId}-${issue.code}`,
    }))

  await payload.update({
    collection: 'dailyReports',
    data: {
      errorLogs: [...sourceErrors, ...validationErrors],
      status: validation.ready ? 'generated' : 'failed',
    },
    id: validation.reportId,
    overrideAccess: true,
  })
}
