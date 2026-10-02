import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getTaipeiReportDate, isReportDate } from '@/lib/daily-report/dates'
import { getDailyReportSharePackage, type SharePackageGenerateMode } from '@/lib/daily-report/sharePackage'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
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

const getRequestedReportDate = (url: URL) => {
  const requestedDate = url.searchParams.get('date')

  if (!requestedDate) return getTaipeiReportDate()
  if (!isReportDate(requestedDate)) throw new Error('date must use YYYY-MM-DD format')

  return requestedDate
}

const getGenerateMode = (url: URL): SharePackageGenerateMode => {
  const generate = url.searchParams.get('generate')
  const generateMissing = url.searchParams.get('generateMissing')

  if (generateMissing === '1' || generateMissing === 'true') return 'missing'
  if (!generate || generate === '0' || generate === 'false' || generate === 'none') return 'none'
  if (generate === 'missing' || generate === 'all' || generate === 'part1' || generate === 'part2' || generate === 'part3') {
    return generate
  }

  throw new Error('generate must be one of: none, missing, all, part1, part2, part3')
}

export const GET = async (request: Request) => {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  let reportDate: string
  let generateMode: SharePackageGenerateMode

  try {
    reportDate = getRequestedReportDate(url)
    generateMode = getGenerateMode(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return Response.json({ error: message }, { status: 400 })
  }

  let sharePackage

  try {
    const payload = await getPayload({
      config: configPromise,
    })
    sharePackage = await getDailyReportSharePackage({
      generateMode,
      payload,
      reportDate,
      requestOrigin: url.origin,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Daily report package failed for ${reportDate}:`, error)

    return Response.json({ error: message, reportDate }, { status: 500 })
  }

  if (!sharePackage) {
    return Response.json(
      {
        error: 'Daily report not found. Run part1, part2, and part3 first, or call with ?generate=missing.',
        reportDate,
      },
      { status: 404 },
    )
  }

  return Response.json({
    package: sharePackage,
  })
}

export const POST = GET
