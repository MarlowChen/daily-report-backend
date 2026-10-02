import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getTaipeiReportDate, isReportDate } from '@/lib/daily-report/dates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const isAuthorized = (request: Request) => {
  const hostname = new URL(request.url).hostname
  const isLocalDevRequest =
    process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(hostname)

  if (isLocalDevRequest) return true
  if (process.env.NODE_ENV !== 'production' && request.headers.get('x-daily-report-dev-relay') === '1') return true

  const sharedSecret = process.env.DAILY_REPORT_SHARED_SECRET

  if (!sharedSecret) return process.env.NODE_ENV !== 'production'

  return request.headers.get('x-daily-report-secret') === sharedSecret
}

const getReportDate = (body: Record<string, unknown>) => {
  const reportDate = typeof body.reportDate === 'string' ? body.reportDate : getTaipeiReportDate()

  if (!isReportDate(reportDate)) throw new Error('reportDate must use YYYY-MM-DD format')

  return reportDate
}

const normalizeSentItems = (value: unknown) => {
  if (!Array.isArray(value)) return []

  return value.slice(0, 20).map((item) => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}

    return {
      kind: typeof record.kind === 'string' ? record.kind : undefined,
      label: typeof record.label === 'string' ? record.label : undefined,
      mediaId: typeof record.mediaId === 'string' ? record.mediaId : undefined,
      url: typeof record.url === 'string' ? record.url : undefined,
    }
  })
}

export const POST = async (request: Request) => {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  let reportDate: string

  try {
    body = (await request.json()) as Record<string, unknown>
    reportDate = getReportDate(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return Response.json({ error: message }, { status: 400 })
  }

  const payload = await getPayload({
    config: configPromise,
  })
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
  const report = existing.docs[0]

  if (!report) {
    return Response.json({ error: 'Daily report not found', reportDate }, { status: 404 })
  }

  const sentItems = normalizeSentItems(body.sentItems)
  const updatedReport = await payload.update({
    collection: 'dailyReports',
    data: {
      sentAt: new Date().toISOString(),
      sentBy: typeof body.operator === 'string' ? body.operator : 'macOS relay',
      sentItemCount:
        typeof body.imageCount === 'number' && Number.isFinite(body.imageCount) ? body.imageCount + 1 : sentItems.length,
      sentItems,
      sentTarget: typeof body.target === 'string' ? body.target : 'LINE OpenChat',
      status: 'sent',
    },
    id: report.id,
    overrideAccess: true,
  })

  return Response.json({
    report: updatedReport,
  })
}
