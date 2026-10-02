import type { Payload } from 'payload'

import type { DailyReport } from '@/payload-types'

import { fetchCryptoNewsItems } from './cryptoNews'
import { createErrorLog, type DailyReportError } from './errors'
import { uploadPngToMedia } from './media'
import { captureCoin360Screenshot, captureCryptobubblesMcScreenshot } from './screenshots'

const PART1_ERROR_SCOPES = ['crypto-news', 'cryptobubbles-screenshot', 'coin360-screenshot']

type ExistingDailyReport = {
  errorLogs?: DailyReportError[] | null
  id: string
  part2?: DailyReport['part2']
  part3?: DailyReport['part3']
}

const withoutPart1Errors = (errorLogs?: DailyReportError[] | null) => {
  return (errorLogs || []).filter((errorLog) => !PART1_ERROR_SCOPES.includes(errorLog.scope))
}

export const generateDailyReportPart1 = async ({
  payload,
  reportDate,
}: {
  payload: Payload
  reportDate: string
}) => {
  const errorLogs: DailyReportError[] = []
  const generatedAt = new Date().toISOString()
  let newsSourceUrl = process.env.CRYPTO_NEWS_SOURCE_URL || 'https://www.blocktempo.com/feed/'
  let newsItems: Awaited<ReturnType<typeof fetchCryptoNewsItems>>['items'] = []
  let cryptobubblesScreenshot: string | null = null
  let coin360Screenshot: string | null = null

  try {
    const news = await fetchCryptoNewsItems()
    newsSourceUrl = news.sourceUrl
    newsItems = news.items
  } catch (error) {
    errorLogs.push(createErrorLog('crypto-news', error))
  }

  try {
    const screenshot = await captureCryptobubblesMcScreenshot(reportDate)
    const media = await uploadPngToMedia({
      alt: `Cryptobubbles 24h Volume ${reportDate}`,
      buffer: screenshot.buffer,
      filename: screenshot.filename,
      payload,
    })
    cryptobubblesScreenshot = media.id
  } catch (error) {
    errorLogs.push(createErrorLog('cryptobubbles-screenshot', error))
  }

  try {
    const screenshot = await captureCoin360Screenshot(reportDate)
    const media = await uploadPngToMedia({
      alt: `Coin360 ${reportDate}`,
      buffer: screenshot.buffer,
      filename: screenshot.filename,
      payload,
    })
    coin360Screenshot = media.id
  } catch (error) {
    errorLogs.push(createErrorLog('coin360-screenshot', error))
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
  const mergedErrorLogs = [...withoutPart1Errors(existingReport?.errorLogs), ...errorLogs]

  const data = {
    errorLogs: mergedErrorLogs,
    part1: {
      coin360Screenshot,
      cryptobubblesScreenshot,
      generatedAt,
      newsItems,
      newsSourceUrl,
      notes: errorLogs.length ? 'Part 1 部分內容產生失敗，請查看錯誤紀錄後重跑或手動補圖。' : null,
    },
    part2: existingReport?.part2,
    part3: existingReport?.part3,
    reportDate,
    status: mergedErrorLogs.length ? 'failed' : 'generated',
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
