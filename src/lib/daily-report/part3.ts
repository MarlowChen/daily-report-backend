import type { Payload } from 'payload'

import type { DailyReport } from '@/payload-types'

import { fetchCteeDigestSections } from './cteeDigest'
import { renderCteeDigestImage } from './digestImage'
import { createErrorLog, type DailyReportError } from './errors'
import { uploadPngToMedia } from './media'
import { captureUsStockHeatmapScreenshot, renderGlobalStockCloseImage } from './stockMarketImages'

const PART3_ERROR_PREFIX = 'part3-'

type ExistingDailyReport = {
  errorLogs?: DailyReportError[] | null
  id: string
  part1?: DailyReport['part1']
  part2?: DailyReport['part2']
  part3?: DailyReport['part3']
}

const withoutPart3Errors = (errorLogs?: DailyReportError[] | null) => {
  return (errorLogs || []).filter((errorLog) => !errorLog.scope.startsWith(PART3_ERROR_PREFIX))
}

const collectCteeUrlsFromReport = (report: ExistingDailyReport) => {
  return [
    ...(report.part3?.chinaItems || []),
    ...(report.part3?.worldItems || []),
  ]
    .map((item) => item.url)
    .filter((url): url is string => Boolean(url))
}

const findRecentlyUsedCteeUrls = async ({
  payload,
  reportDate,
}: {
  payload: Payload
  reportDate: string
}) => {
  const recentReports = await payload.find({
    collection: 'dailyReports',
    depth: 0,
    limit: 10,
    overrideAccess: true,
    sort: '-reportDate',
    where: {
      reportDate: {
        not_equals: reportDate,
      },
    },
  })

  return recentReports.docs.flatMap((report) => collectCteeUrlsFromReport(report as ExistingDailyReport))
}

const assertDigestItems = ({
  items,
  label,
}: {
  items: Awaited<ReturnType<typeof fetchCteeDigestSections>>['china']['items']
  label: string
}) => {
  if (!items.length) {
    throw new Error(`${label} did not return any digest items.`)
  }
}

export const generateDailyReportPart3 = async ({
  payload,
  reportDate,
}: {
  payload: Payload
  reportDate: string
}) => {
  const part3ErrorLogs: DailyReportError[] = []
  const generatedAt = new Date().toISOString()
  const itemLimit = Number(process.env.CTEE_DIGEST_ITEMS_PER_SECTION || 3)
  const limit = Number.isFinite(itemLimit) && itemLimit > 0 ? itemLimit : 3
  let chinaSourceUrl = process.env.CTEE_CHINA_URL || 'https://www.ctee.com.tw/china'
  let worldSourceUrl = process.env.CTEE_WORLD_URL || 'https://www.ctee.com.tw/world'
  let chinaItems: Awaited<ReturnType<typeof fetchCteeDigestSections>>['china']['items'] = []
  let worldItems: Awaited<ReturnType<typeof fetchCteeDigestSections>>['world']['items'] = []
  let chinaDigestImage: string | null = null
  let globalStockCloseImage: string | null = null
  const globalStockCloseSourceUrl = 'https://query1.finance.yahoo.com/v8/finance/chart'
  let usStockHeatmapImage: string | null = null
  const usStockHeatmapSourceUrl = process.env.US_STOCK_HEATMAP_URL || 'https://finviz.com/map.ashx?t=sec'
  let worldDigestImage: string | null = null

  try {
    const recentlyUsedCteeUrls = await findRecentlyUsedCteeUrls({
      payload,
      reportDate,
    }).catch(() => [])
    const sections = await fetchCteeDigestSections({
      excludeUrls: recentlyUsedCteeUrls,
      limit,
      reportDate,
    })
    chinaItems = sections.china.items
    worldItems = sections.world.items
    assertDigestItems({
      items: chinaItems,
      label: sections.china.label,
    })
    assertDigestItems({
      items: worldItems,
      label: sections.world.label,
    })
    chinaSourceUrl = sections.china.sourceUrl
    worldSourceUrl = sections.world.sourceUrl

    const chinaImage = await renderCteeDigestImage({
      reportDate,
      section: sections.china,
      variant: 'china',
    })
    const chinaMedia = await uploadPngToMedia({
      alt: `兩岸財經重點 ${reportDate}`,
      buffer: chinaImage.buffer,
      filename: chinaImage.filename,
      payload,
    })
    chinaDigestImage = chinaMedia.id

    const worldImage = await renderCteeDigestImage({
      reportDate,
      section: sections.world,
      variant: 'world',
    })
    const worldMedia = await uploadPngToMedia({
      alt: `國際時事重點 ${reportDate}`,
      buffer: worldImage.buffer,
      filename: worldImage.filename,
      payload,
    })
    worldDigestImage = worldMedia.id
  } catch (error) {
    part3ErrorLogs.push(createErrorLog(`${PART3_ERROR_PREFIX}ctee-digest`, error))
  }

  try {
    const usStockHeatmap = await captureUsStockHeatmapScreenshot(reportDate)
    const usStockHeatmapMedia = await uploadPngToMedia({
      alt: `美股市佔價格變化 ${reportDate}`,
      buffer: usStockHeatmap.buffer,
      filename: usStockHeatmap.filename,
      payload,
    })
    usStockHeatmapImage = usStockHeatmapMedia.id
  } catch (error) {
    part3ErrorLogs.push(createErrorLog(`${PART3_ERROR_PREFIX}us-stock-heatmap`, error))
  }

  try {
    const globalStockClose = await renderGlobalStockCloseImage(reportDate)
    const globalStockCloseMedia = await uploadPngToMedia({
      alt: `全球主要股市收盤 ${reportDate}`,
      buffer: globalStockClose.buffer,
      filename: globalStockClose.filename,
      payload,
    })
    globalStockCloseImage = globalStockCloseMedia.id
  } catch (error) {
    part3ErrorLogs.push(createErrorLog(`${PART3_ERROR_PREFIX}global-stock-close`, error))
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
  const errorLogs = [...withoutPart3Errors(existingReport?.errorLogs), ...part3ErrorLogs]
  const data = {
    errorLogs,
    part1: existingReport?.part1,
    part2: existingReport?.part2,
    part3: {
      chinaDigestImage,
      chinaItems,
      chinaSourceUrl,
      generatedAt,
      globalStockCloseImage,
      globalStockCloseSourceUrl,
      notes: part3ErrorLogs.length ? 'Part 3 內容產生失敗，請查看錯誤紀錄後重跑或手動補圖。' : null,
      usStockHeatmapImage,
      usStockHeatmapSourceUrl,
      worldDigestImage,
      worldItems,
      worldSourceUrl,
    },
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
