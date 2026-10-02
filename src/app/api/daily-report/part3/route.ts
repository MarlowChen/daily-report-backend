import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getTaipeiReportDate, isReportDate } from '@/lib/daily-report/dates'
import { generateDailyReportPart3 } from '@/lib/daily-report/part3'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const runtime = 'nodejs'

const isAuthorized = (request: Request) => {
  const sharedSecret = process.env.DAILY_REPORT_SHARED_SECRET

  if (!sharedSecret) return process.env.NODE_ENV !== 'production'

  return request.headers.get('x-daily-report-secret') === sharedSecret
}

const getRequestedReportDate = (request: Request) => {
  const url = new URL(request.url)
  const requestedDate = url.searchParams.get('date')

  if (!requestedDate) return getTaipeiReportDate()
  if (!isReportDate(requestedDate)) throw new Error('date must use YYYY-MM-DD format')

  return requestedDate
}

export const GET = async (request: Request) => {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let reportDate: string

  try {
    reportDate = getRequestedReportDate(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return Response.json({ error: message }, { status: 400 })
  }

  try {
    const payload = await getPayload({
      config: configPromise,
    })
    const report = await generateDailyReportPart3({
      payload,
      reportDate,
    })

    return Response.json({
      report,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Daily report part3 failed for ${reportDate}:`, error)

    return Response.json({ error: message, partId: 'part3', reportDate }, { status: 500 })
  }
}

export const POST = GET
