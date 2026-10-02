import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import type { DailyReport, Media } from '@/payload-types'
import { validateDailyReport } from '@/lib/daily-report/validation'

const media = (id: string, reportDate = '2026-10-01'): Media =>
  ({
    alt: `${id} ${reportDate}`,
    createdAt: `${reportDate}T00:00:00.000Z`,
    filename: `${id}-${reportDate}.png`,
    id,
    mimeType: 'image/png',
    updatedAt: `${reportDate}T00:00:00.000Z`,
    url: `https://example.com/${id}-${reportDate}.png`,
  }) as Media

const report = (reportDate = '2026-10-01'): DailyReport =>
  ({
    createdAt: `${reportDate}T00:00:00.000Z`,
    errorLogs: [],
    id: 'report-1',
    part1: {
      coin360Screenshot: media('coin360', reportDate),
      cryptobubblesScreenshot: media('cryptobubbles', reportDate),
      newsItems: Array.from({ length: 8 }, (_, index) => ({ title: `News ${index}`, url: `https://example.com/${index}` })),
    },
    part2: {
      cteeNewspaperPage2Screenshot: media('ctee-a2', reportDate),
      cteeNewspaperPage3Screenshot: media('ctee-a3', reportDate),
      cteeNewspaperScreenshot: media('ctee-a1', reportDate),
      economicDailyPage2Screenshot: media('economic-a02', reportDate),
      economicDailyPage3Screenshot: media('economic-a03', reportDate),
      economicDailyScreenshot: media('economic-a01', reportDate),
    },
    part3: {
      chinaDigestImage: media('china', reportDate),
      chinaItems: [{ title: 'China', url: 'https://example.com/china' }],
      globalStockCloseImage: media('global', reportDate),
      usStockHeatmapImage: media('heatmap', reportDate),
      worldDigestImage: media('world', reportDate),
      worldItems: [{ title: 'World', url: 'https://example.com/world' }],
    },
    reportDate,
    status: 'generated',
    updatedAt: `${reportDate}T00:00:00.000Z`,
  }) as DailyReport

const payloadFor = (value: DailyReport): Payload =>
  ({
    find: vi.fn(async () => ({ docs: [value] })),
  }) as unknown as Payload

describe('validateDailyReport', () => {
  it('accepts exactly 12 readable, date-matched media artifacts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })))
    const result = await validateDailyReport({ payload: payloadFor(report()), reportDate: '2026-10-01' })
    expect(result.ready).toBe(true)
    expect(result.imageCount).toBe(12)
    expect(result.issues).toEqual([])
  })

  it('rejects a media artifact whose filename and alt use another date', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })))
    const value = report()
    value.part2!.cteeNewspaperScreenshot = media('ctee-a1', '2026-10-02')
    const result = await validateDailyReport({ payload: payloadFor(value), reportDate: '2026-10-01' })
    expect(result.ready).toBe(false)
    expect(result.retryParts).toContain('part2')
    expect(result.issues.some((issue) => issue.code === 'media-date-mismatch')).toBe(true)
  })
})
