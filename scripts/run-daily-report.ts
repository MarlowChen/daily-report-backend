import 'dotenv/config'
import config from '../src/payload.config'
import { getPayload } from 'payload'

import { getTaipeiReportDate, isReportDate } from '../src/lib/daily-report/dates'
import { runDailyReport } from '../src/lib/daily-report/orchestrator'

const requestedDate = process.argv[2] || getTaipeiReportDate()
if (!isReportDate(requestedDate)) throw new Error('Usage: pnpm daily-report:run [YYYY-MM-DD]')

const payload = await getPayload({ config })
try {
  const result = await runDailyReport({ payload, reportDate: requestedDate })
  console.log(JSON.stringify(result, null, 2))
  if (!result.validation.ready) process.exitCode = 2
} finally {
  await payload.db.destroy?.()
}
