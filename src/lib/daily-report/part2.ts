import type { Payload } from 'payload'
import { createHash } from 'node:crypto'

import type { DailyReport } from '@/payload-types'

import { fetchEconomicDailyImages, getEconomicDailyImageUrl } from './economicDaily'
import { createErrorLog, type DailyReportError } from './errors'
import { uploadJpegToMedia, uploadPngToMedia } from './media'
import { captureCteeNewspaperImages } from './screenshots'

const PART2_ERROR_PREFIX = 'part2-'

type ExistingDailyReport = {
  errorLogs?: DailyReportError[] | null
  id: string
  part1?: DailyReport['part1']
  part3?: DailyReport['part3']
}

const withoutPart2Errors = (errorLogs?: DailyReportError[] | null) => {
  return (errorLogs || []).filter((errorLog) => !errorLog.scope.startsWith(PART2_ERROR_PREFIX))
}

type Part2FetchedImage = {
  buffer: Buffer
  pageCode: string
  sourceUrl: string
}

export const normalizePart2SourceUrl = (value: string) => {
  try {
    const url = new URL(value)
    const economicDailyLocation = url.searchParams.get('FPLOCATION')

    return `${url.hostname}${url.pathname}${economicDailyLocation ? `?fplocation=${economicDailyLocation}` : ''}`.toLowerCase()
  } catch {
    return value.trim().toLowerCase()
  }
}

const imageHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

const assertUniquePart2Images = ({
  expectedCount,
  images,
  label,
}: {
  expectedCount: number
  images: Part2FetchedImage[]
  label: string
}) => {
  if (images.length < expectedCount) {
    throw new Error(`${label} only fetched ${images.length}/${expectedCount} page images.`)
  }

  const seenPageCodes = new Set<string>()
  const seenSourceUrls = new Map<string, string>()
  const seenHashes = new Map<string, string>()

  for (const image of images.slice(0, expectedCount)) {
    const pageCode = image.pageCode.toUpperCase()
    const sourceUrlKey = normalizePart2SourceUrl(image.sourceUrl)
    const hash = imageHash(image.buffer)

    if (seenPageCodes.has(pageCode)) {
      throw new Error(`${label} duplicated page code: ${pageCode}`)
    }
    const previousSourcePage = seenSourceUrls.get(sourceUrlKey)
    if (previousSourcePage) {
      throw new Error(`${label} duplicated source image: ${previousSourcePage} and ${pageCode} both use ${image.sourceUrl}`)
    }
    const previousHashPage = seenHashes.get(hash)
    if (previousHashPage) {
      throw new Error(`${label} duplicated image content: ${previousHashPage} and ${pageCode}`)
    }

    seenPageCodes.add(pageCode)
    seenSourceUrls.set(sourceUrlKey, pageCode)
    seenHashes.set(hash, pageCode)
  }
}

export const generateDailyReportPart2 = async ({
  payload,
  reportDate,
}: {
  payload: Payload
  reportDate: string
}) => {
  const part2ErrorLogs: DailyReportError[] = []
  const generatedAt = new Date().toISOString()
  const cteeSourceUrl = process.env.CTEE_NEWSPAPER_URL || 'https://newspaper.ctee.com.tw/'
  let economicDailySourceUrl = getEconomicDailyImageUrl(reportDate, 'A01')
  let cteeNewspaperScreenshot: string | null = null
  let cteeNewspaperPage2Screenshot: string | null = null
  let cteeNewspaperPage3Screenshot: string | null = null
  let economicDailyScreenshot: string | null = null
  let economicDailyPage2Screenshot: string | null = null
  let economicDailyPage3Screenshot: string | null = null

  try {
    const screenshots = await captureCteeNewspaperImages(reportDate)
    assertUniquePart2Images({
      expectedCount: 3,
      images: screenshots,
      label: '工商時報',
    })
    for (const [index, screenshot] of screenshots.slice(0, 3).entries()) {
      const upload = screenshot.filename.toLowerCase().endsWith('.png') ? uploadPngToMedia : uploadJpegToMedia
      const media = await upload({
        alt: `工商時報電子版 ${screenshot.pageCode} ${reportDate}`,
        buffer: screenshot.buffer,
        filename: screenshot.filename,
        payload,
      })
      if (index === 0) cteeNewspaperScreenshot = media.id
      if (index === 1) cteeNewspaperPage2Screenshot = media.id
      if (index === 2) cteeNewspaperPage3Screenshot = media.id
    }
  } catch (error) {
    part2ErrorLogs.push(createErrorLog(`${PART2_ERROR_PREFIX}ctee-newspaper-screenshot`, error))
  }

  try {
    const images = await fetchEconomicDailyImages(reportDate)
    assertUniquePart2Images({
      expectedCount: 3,
      images,
      label: '經濟日報',
    })
    for (const [index, image] of images.slice(0, 3).entries()) {
      if (index === 0) economicDailySourceUrl = image.sourceUrl
      const media = await uploadJpegToMedia({
        alt: `經濟日報電子版 ${image.pageCode} ${reportDate}`,
        buffer: image.buffer,
        filename: image.filename,
        payload,
      })
      if (index === 0) economicDailyScreenshot = media.id
      if (index === 1) economicDailyPage2Screenshot = media.id
      if (index === 2) economicDailyPage3Screenshot = media.id
    }
  } catch (error) {
    part2ErrorLogs.push(createErrorLog(`${PART2_ERROR_PREFIX}economic-daily-screenshot`, error))
  }

  const existing = await payload.find({
    collection: 'dailyReports',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      reportDate: {
        equals: reportDate,
      },
    },
  })
  const existingReport = existing.docs[0] as ExistingDailyReport | undefined
  const errorLogs = [...withoutPart2Errors(existingReport?.errorLogs), ...part2ErrorLogs]
  const data = {
    errorLogs,
    part1: existingReport?.part1,
    part2: {
      cteeNewspaperScreenshot,
      cteeNewspaperPage2Screenshot,
      cteeNewspaperPage3Screenshot,
      cteeSourceUrl,
      economicDailyScreenshot,
      economicDailyPage2Screenshot,
      economicDailyPage3Screenshot,
      economicDailySourceUrl,
      generatedAt,
      notes: part2ErrorLogs.length ? 'Part 2 部分內容產生失敗，請查看錯誤紀錄後重跑或手動補圖。' : null,
    },
    part3: existingReport?.part3,
    reportDate,
    status: errorLogs.length ? 'failed' : 'generated',
  } as const

  if (existingReport) {
    return payload.update({
      collection: 'dailyReports',
      data,
      id: existingReport.id,
      overrideAccess: true,
    })
  }

  return payload.create({
    collection: 'dailyReports',
    data,
    overrideAccess: true,
  })
}
