import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getTaipeiReportDate, isReportDate } from '@/lib/daily-report/dates'
import { runDailyReport } from '@/lib/daily-report/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 600
export const runtime = 'nodejs'

const isAuthorized = (request: Request) => {
  const hostname = new URL(request.url).hostname
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(hostname)
  if (local) return true
  const secret = process.env.DAILY_REPORT_SHARED_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('x-daily-report-secret') === secret
}

export const POST = async (request: Request) => {
  if (!isAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const reportDate = url.searchParams.get('date') || getTaipeiReportDate()
  if (!isReportDate(reportDate)) return Response.json({ error: 'date must use YYYY-MM-DD format' }, { status: 400 })

  try {
    const payload = await getPayload({ config: configPromise })
    const result = await runDailyReport({ payload, reportDate })
    return Response.json(result, { status: result.validation.ready ? 200 : 207 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Daily report run failed for ${reportDate}:`, error)
    return Response.json({ error: message, reportDate }, { status: 500 })
  }
}

export const GET = POST
