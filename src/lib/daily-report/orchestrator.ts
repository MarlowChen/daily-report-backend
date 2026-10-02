import type { Payload } from 'payload'

import { generateDailyReportPart1 } from './part1'
import { generateDailyReportPart2 } from './part2'
import { generateDailyReportPart3 } from './part3'
import { planDailyReportRecovery, type DailyReportRecoveryPlan } from './recoveryPlanner'
import {
  persistDailyReportValidation,
  validateDailyReport,
  type DailyReportPartId,
  type DailyReportValidationResult,
} from './validation'

type RunAttempt = {
  cycle: number
  finishedAt: string
  parts: DailyReportPartId[]
  planner?: DailyReportRecoveryPlan
}

const generators = {
  part1: generateDailyReportPart1,
  part2: generateDailyReportPart2,
  part3: generateDailyReportPart3,
} satisfies Record<DailyReportPartId, (args: { payload: Payload; reportDate: string }) => Promise<unknown>>

const runParts = async ({
  parts,
  payload,
  reportDate,
}: {
  parts: DailyReportPartId[]
  payload: Payload
  reportDate: string
}) => {
  // These writers update the same report aggregate, so keep them sequential.
  for (const partId of parts) await generators[partId]({ payload, reportDate })
}

const repairCycleLimit = () => {
  const configured = Number(process.env.DAILY_REPORT_REPAIR_CYCLES || 1)
  return Number.isFinite(configured) && configured >= 0 ? Math.min(3, Math.floor(configured)) : 1
}

export const runDailyReport = async ({
  maxRepairCycles = repairCycleLimit(),
  payload,
  reportDate,
}: {
  maxRepairCycles?: number
  payload: Payload
  reportDate: string
}) => {
  const attempts: RunAttempt[] = []
  const initialParts: DailyReportPartId[] = ['part1', 'part2', 'part3']
  await runParts({ parts: initialParts, payload, reportDate })
  attempts.push({ cycle: 0, finishedAt: new Date().toISOString(), parts: initialParts })

  let validation: DailyReportValidationResult = await validateDailyReport({ payload, reportDate })
  let finalPlan: DailyReportRecoveryPlan | undefined

  for (let cycle = 1; !validation.ready && cycle <= maxRepairCycles; cycle += 1) {
    const planner = await planDailyReportRecovery({ reportDate, validation })
    finalPlan = planner
    if (planner.requiresHuman || !planner.retryParts.length) break

    await runParts({ parts: planner.retryParts, payload, reportDate })
    attempts.push({ cycle, finishedAt: new Date().toISOString(), parts: planner.retryParts, planner })
    validation = await validateDailyReport({ payload, reportDate })
  }

  await persistDailyReportValidation({ payload, validation })

  return {
    attempts,
    completedAt: new Date().toISOString(),
    planner: finalPlan,
    reportDate,
    validation,
  }
}
