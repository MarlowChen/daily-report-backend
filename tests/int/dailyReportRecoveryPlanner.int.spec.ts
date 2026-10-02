import { afterEach, describe, expect, it, vi } from 'vitest'

import { planDailyReportRecovery } from '@/lib/daily-report/recoveryPlanner'

const validation = {
  checkedAt: '2026-10-01T00:00:00.000Z',
  imageCount: 9,
  issues: [{ code: 'missing-media' as const, message: 'economic-a01 is missing.', partId: 'part2' as const }],
  ready: false,
  retryParts: ['part2' as const],
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('planDailyReportRecovery', () => {
  it('falls back to deterministic retry without an API key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const plan = await planDailyReportRecovery({ reportDate: '2026-10-01', validation })
    expect(plan.provider).toBe('deterministic')
    expect(plan.retryParts).toEqual(['part2'])
  })

  it('rejects model-suggested parts that deterministic validation did not allow', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ choices: [{ message: { content: '{"retryParts":["part1","part2"],"requiresHuman":false,"reason":"retry"}' } }] }),
      ),
    )
    const plan = await planDailyReportRecovery({ reportDate: '2026-10-01', validation })
    expect(plan.provider).toBe('openrouter')
    expect(plan.retryParts).toEqual(['part2'])
  })

  it('does not waste another cycle retrying a persistent 403', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const plan = await planDailyReportRecovery({
      reportDate: '2026-10-01',
      validation: {
        ...validation,
        issues: [{ code: 'source-error', message: '403 Forbidden; authenticated fallback failed', partId: 'part2' }],
      },
    })
    expect(plan.requiresHuman).toBe(true)
    expect(plan.retryParts).toEqual([])
  })
})
