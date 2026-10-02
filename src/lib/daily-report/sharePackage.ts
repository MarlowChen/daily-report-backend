import type { Payload } from 'payload'

import type { DailyReport, Media } from '@/payload-types'

import { generateDailyReportPart1 } from './part1'
import { generateDailyReportPart2 } from './part2'
import { generateDailyReportPart3 } from './part3'

export type SharePackageGenerateMode = 'none' | 'missing' | 'all' | 'part1' | 'part2' | 'part3'

type ShareTextItem = {
  id: string
  kind: 'text'
  label: string
  text: string
}

type ShareImageItem = {
  alt?: string | null
  filename?: string | null
  height?: number | null
  id: string
  kind: 'image'
  label: string
  mediaId?: string
  mimeType?: string | null
  url: string
  width?: number | null
}

export type DailyReportSharePackage = {
  clipboardText: string
  errorLogs?: DailyReport['errorLogs']
  generatedParts: string[]
  items: (ShareTextItem | ShareImageItem)[]
  markSentUrl?: string
  missing: string[]
  missingItemIds: string[]
  ready: boolean
  reportDate: string
  reportId: string
  status: DailyReport['status']
}

const imageSlots = [
  {
    id: 'cryptobubbles-mc',
    label: 'Cryptobubbles 24h Volume 熱力圖',
    partId: 'part1',
    path: ['part1', 'cryptobubblesScreenshot'] as const,
  },
  {
    id: 'coin360',
    label: 'Coin360 市場熱力圖',
    partId: 'part1',
    path: ['part1', 'coin360Screenshot'] as const,
  },
  {
    errorScope: 'part2-ctee-newspaper-screenshot',
    id: 'ctee-newspaper',
    label: '工商時報電子版第 1 頁',
    partId: 'part2',
    path: ['part2', 'cteeNewspaperScreenshot'] as const,
  },
  {
    errorScope: 'part2-ctee-newspaper-screenshot',
    id: 'ctee-newspaper-2',
    label: '工商時報電子版第 2 頁',
    partId: 'part2',
    path: ['part2', 'cteeNewspaperPage2Screenshot'] as const,
  },
  {
    errorScope: 'part2-ctee-newspaper-screenshot',
    id: 'ctee-newspaper-3',
    label: '工商時報電子版第 3 頁',
    partId: 'part2',
    path: ['part2', 'cteeNewspaperPage3Screenshot'] as const,
  },
  {
    errorScope: 'part2-economic-daily-screenshot',
    id: 'economic-daily',
    label: '經濟日報第 1 頁',
    partId: 'part2',
    path: ['part2', 'economicDailyScreenshot'] as const,
  },
  {
    errorScope: 'part2-economic-daily-screenshot',
    id: 'economic-daily-2',
    label: '經濟日報第 2 頁',
    partId: 'part2',
    path: ['part2', 'economicDailyPage2Screenshot'] as const,
  },
  {
    errorScope: 'part2-economic-daily-screenshot',
    id: 'economic-daily-3',
    label: '經濟日報第 3 頁',
    partId: 'part2',
    path: ['part2', 'economicDailyPage3Screenshot'] as const,
  },
  {
    errorScope: 'part3-ctee-digest',
    id: 'ctee-china-digest',
    label: '兩岸財經重點圖',
    partId: 'part3',
    path: ['part3', 'chinaDigestImage'] as const,
  },
  {
    errorScope: 'part3-ctee-digest',
    id: 'ctee-world-digest',
    label: '國際時事重點圖',
    partId: 'part3',
    path: ['part3', 'worldDigestImage'] as const,
  },
  {
    errorScope: 'part3-us-stock-heatmap',
    id: 'us-stock-heatmap',
    label: '美股市佔價格變化',
    partId: 'part3',
    path: ['part3', 'usStockHeatmapImage'] as const,
  },
  {
    errorScope: 'part3-global-stock-close',
    id: 'global-stock-close',
    label: '全球主要股市收盤',
    partId: 'part3',
    path: ['part3', 'globalStockCloseImage'] as const,
  },
]

const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, '')

const resolveBaseUrl = (requestOrigin?: string) => {
  return normalizeOrigin(requestOrigin || process.env.PAYLOAD_PUBLIC_SERVER_URL || '')
}

const absolutizeUrl = (url: string | null | undefined, baseUrl: string) => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (!baseUrl) return url

  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`
}

const isMedia = (value: unknown): value is Media => {
  return Boolean(value && typeof value === 'object' && 'id' in value)
}

const getMedia = async ({
  mediaOrId,
  payload,
}: {
  mediaOrId: Media | string | null | undefined
  payload: Payload
}) => {
  if (!mediaOrId) return null
  if (isMedia(mediaOrId)) return mediaOrId

  return payload.findByID({
    collection: 'media',
    id: mediaOrId,
    overrideAccess: true,
  })
}

const getSlotValue = (report: DailyReport, path: (typeof imageSlots)[number]['path']) => {
  const [partName, fieldName] = path

  if (partName === 'part1' && (fieldName === 'cryptobubblesScreenshot' || fieldName === 'coin360Screenshot')) {
    return report.part1?.[fieldName] || null
  }

  if (
    partName === 'part2' &&
    (
      fieldName === 'cteeNewspaperScreenshot' ||
      fieldName === 'cteeNewspaperPage2Screenshot' ||
      fieldName === 'cteeNewspaperPage3Screenshot' ||
      fieldName === 'economicDailyScreenshot' ||
      fieldName === 'economicDailyPage2Screenshot' ||
      fieldName === 'economicDailyPage3Screenshot'
    )
  ) {
    return report.part2?.[fieldName] || null
  }

  if (
    partName === 'part3' &&
    (
      fieldName === 'chinaDigestImage' ||
      fieldName === 'worldDigestImage' ||
      fieldName === 'usStockHeatmapImage' ||
      fieldName === 'globalStockCloseImage'
    )
  ) {
    return report.part3?.[fieldName] || null
  }

  return null
}

const findDailyReport = async ({ payload, reportDate }: { payload: Payload; reportDate: string }) => {
  const result = await payload.find({
    collection: 'dailyReports',
    depth: 2,
    limit: 1,
    overrideAccess: true,
    where: {
      reportDate: {
        equals: reportDate,
      },
    },
  })

  return (result.docs[0] as DailyReport | undefined) || null
}

const needsPart1 = (report: DailyReport | null) => {
  return (
    reportHasErrorScope(report, 'crypto-news') ||
    reportHasErrorScope(report, 'cryptobubbles-screenshot') ||
    reportHasErrorScope(report, 'coin360-screenshot') ||
    !report?.part1?.generatedAt ||
    !report.part1.newsItems?.length ||
    !report.part1.cryptobubblesScreenshot ||
    !report.part1.coin360Screenshot
  )
}

const needsPart2 = (report: DailyReport | null) => {
  return (
    reportHasErrorScope(report, 'part2-') ||
    !report?.part2?.generatedAt ||
    !report.part2.cteeNewspaperScreenshot ||
    !report.part2.cteeNewspaperPage2Screenshot ||
    !report.part2.cteeNewspaperPage3Screenshot ||
    !report.part2.economicDailyScreenshot ||
    !report.part2.economicDailyPage2Screenshot ||
    !report.part2.economicDailyPage3Screenshot
  )
}

const needsPart3 = (report: DailyReport | null) => {
  return (
    reportHasErrorScope(report, 'part3-') ||
    !report?.part3?.generatedAt ||
    !report.part3.chinaDigestImage ||
    !report.part3.worldDigestImage ||
    !report.part3.chinaItems?.length ||
    !report.part3.worldItems?.length ||
    !report.part3.usStockHeatmapImage ||
    !report.part3.globalStockCloseImage
  )
}

const reportHasErrorScope = (report: DailyReport | null, scopePrefix: string) => {
  return Boolean(report?.errorLogs?.some((errorLog) => errorLog.scope?.startsWith(scopePrefix)))
}

const buildNewsText = (report: DailyReport) => {
  const newsItems = report.part1?.newsItems || []
  const lines = [`V1 專屬社群日報｜${report.reportDate}`, '', '【加密市場快訊】']

  if (!newsItems.length) {
    lines.push('今日尚未取得加密快訊。')
    return lines.join('\n')
  }

  newsItems.slice(0, 8).forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`)

    if (item.excerpt) lines.push(`   ${item.excerpt}`)
    if (item.url) lines.push(`   ${item.url}`)
  })

  return lines.join('\n')
}

const imageUrlIsAvailable = async (url: string) => {
  if (!/^https?:\/\//i.test(url)) return false

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        range: 'bytes=0-0',
      },
      signal: AbortSignal.timeout(15_000),
    })
    const contentType = response.headers.get('content-type') || ''
    await response.body?.cancel()

    return response.ok && contentType.toLowerCase().startsWith('image/')
  } catch {
    return false
  }
}

export const buildDailyReportSharePackage = async ({
  generatedParts = [],
  payload,
  report,
  requestOrigin,
}: {
  generatedParts?: string[]
  payload: Payload
  report: DailyReport
  requestOrigin?: string
}): Promise<DailyReportSharePackage> => {
  const baseUrl = resolveBaseUrl(requestOrigin)
  const markSentUrl = baseUrl ? `${baseUrl}/api/daily-report/mark-sent` : undefined
  const missing: string[] = []
  const missingItemIds: string[] = []
  const items: DailyReportSharePackage['items'] = [
    {
      id: 'daily-report-news',
      kind: 'text',
      label: '日報文字',
      text: buildNewsText(report),
    },
  ]

  for (const slot of imageSlots) {
    if (slot.errorScope && reportHasErrorScope(report, slot.errorScope)) {
      missing.push(slot.label)
      missingItemIds.push(slot.id)
      continue
    }

    const media = await getMedia({
      mediaOrId: getSlotValue(report, slot.path),
      payload,
    })
    const url = absolutizeUrl(media?.url, baseUrl)

    if (!media || !url) {
      missing.push(slot.label)
      missingItemIds.push(slot.id)
      continue
    }

    items.push({
      alt: media.alt,
      filename: media.filename,
      height: media.height,
      id: slot.id,
      kind: 'image',
      label: slot.label,
      mediaId: media.id,
      mimeType: media.mimeType,
      url,
      width: media.width,
    })
  }

  const imageItems = items.filter((item): item is ShareImageItem => item.kind === 'image')
  const availability = await Promise.all(imageItems.map(async (item) => [item.id, await imageUrlIsAvailable(item.url)] as const))
  const unavailableIds = new Set(availability.filter(([, available]) => !available).map(([id]) => id))

  if (unavailableIds.size) {
    for (const slot of imageSlots) {
      if (!unavailableIds.has(slot.id)) continue
      missing.push(`${slot.label}（圖片網址無法下載）`)
      missingItemIds.push(slot.id)
    }
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (unavailableIds.has(items[index].id)) items.splice(index, 1)
    }
  }

  const imageLines = items
    .filter((item): item is ShareImageItem => item.kind === 'image')
    .map((item, index) => `${index + 1}. ${item.label}\n${item.url}`)
  const clipboardText = [
    (items[0] as ShareTextItem).text,
    '',
    '【圖片順序】',
    imageLines.length ? imageLines.join('\n') : '尚未產生圖片。',
  ].join('\n')

  return {
    clipboardText,
    errorLogs: report.errorLogs,
    generatedParts,
    items,
    markSentUrl,
    missing: [...new Set(missing)],
    missingItemIds: [...new Set(missingItemIds)],
    ready: missing.length === 0 && report.status !== 'failed' && !report.errorLogs?.length,
    reportDate: report.reportDate,
    reportId: report.id,
    status: report.status,
  }
}

export const getDailyReportSharePackage = async ({
  generateMode,
  payload,
  reportDate,
  requestOrigin,
}: {
  generateMode: SharePackageGenerateMode
  payload: Payload
  reportDate: string
  requestOrigin?: string
}) => {
  const generatedParts: string[] = []
  let report = await findDailyReport({
    payload,
    reportDate,
  })

  if (generateMode === 'all' || generateMode === 'part1' || (generateMode === 'missing' && needsPart1(report))) {
    await generateDailyReportPart1({ payload, reportDate })
    generatedParts.push('part1')
    report = await findDailyReport({ payload, reportDate })
  }

  if (generateMode === 'all' || generateMode === 'part2' || (generateMode === 'missing' && needsPart2(report))) {
    await generateDailyReportPart2({ payload, reportDate })
    generatedParts.push('part2')
    report = await findDailyReport({ payload, reportDate })
  }

  if (generateMode === 'all' || generateMode === 'part3' || (generateMode === 'missing' && needsPart3(report))) {
    await generateDailyReportPart3({ payload, reportDate })
    generatedParts.push('part3')
    report = await findDailyReport({ payload, reportDate })
  }

  if (!report) return null

  let sharePackage = await buildDailyReportSharePackage({
    generatedParts,
    payload,
    report,
    requestOrigin,
  })

  if (generateMode === 'missing' && sharePackage.missingItemIds.length) {
    const missingParts = new Set(
      imageSlots
        .filter((slot) => sharePackage.missingItemIds.includes(slot.id))
        .map((slot) => slot.partId),
    )

    for (const partId of missingParts) {
      if (generatedParts.includes(partId)) continue
      if (partId === 'part1') await generateDailyReportPart1({ payload, reportDate })
      if (partId === 'part2') await generateDailyReportPart2({ payload, reportDate })
      if (partId === 'part3') await generateDailyReportPart3({ payload, reportDate })
      generatedParts.push(partId)
    }

    if (missingParts.size) {
      report = await findDailyReport({ payload, reportDate })
      if (!report) return null
      sharePackage = await buildDailyReportSharePackage({
        generatedParts,
        payload,
        report,
        requestOrigin,
      })
    }
  }

  return sharePackage
}
