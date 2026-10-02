import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DailyReport, Media } from '@/payload-types'
import { buildDailyReportSharePackage } from '@/lib/daily-report/sharePackage'

const media = (id: string): Media =>
  ({
    alt: id,
    createdAt: '2026-07-20T00:00:00.000Z',
    filename: `${id}.png`,
    id,
    mimeType: 'image/png',
    updatedAt: '2026-07-20T00:00:00.000Z',
    url: `/api/media/file/${id}.png`,
  }) as Media

const report = (): DailyReport =>
  ({
    createdAt: '2026-07-20T00:00:00.000Z',
    errorLogs: [],
    id: 'report-1',
    part1: {
      coin360Screenshot: media('coin360'),
      cryptobubblesScreenshot: media('cryptobubbles'),
      generatedAt: '2026-07-20T00:00:00.000Z',
      newsItems: [{ title: 'News', url: 'https://example.com/news' }],
    },
    part2: {
      cteeNewspaperPage2Screenshot: media('ctee-2'),
      cteeNewspaperPage3Screenshot: media('ctee-3'),
      cteeNewspaperScreenshot: media('ctee-1'),
      economicDailyPage2Screenshot: media('economic-2'),
      economicDailyPage3Screenshot: media('economic-3'),
      economicDailyScreenshot: media('economic-1'),
      generatedAt: '2026-07-20T00:00:00.000Z',
    },
    part3: {
      chinaDigestImage: media('china'),
      chinaItems: [{ title: 'China', url: 'https://example.com/china' }],
      generatedAt: '2026-07-20T00:00:00.000Z',
      globalStockCloseImage: media('global-close'),
      usStockHeatmapImage: media('us-heatmap'),
      worldDigestImage: media('world'),
      worldItems: [{ title: 'World', url: 'https://example.com/world' }],
    },
    reportDate: '2026-07-20',
    status: 'generated',
    updatedAt: '2026-07-20T00:00:00.000Z',
  }) as DailyReport

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('daily report share package image validation', () => {
  it('is ready only when every generated image URL is downloadable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new Uint8Array([1]), {
          headers: { 'content-type': 'image/png' },
          status: 200,
        }),
      ),
    )

    const sharePackage = await buildDailyReportSharePackage({
      payload: {} as Payload,
      report: report(),
      requestOrigin: 'https://reports.example.com',
    })

    expect(sharePackage.ready).toBe(true)
    expect(sharePackage.missing).toEqual([])
    expect(sharePackage.missingItemIds).toEqual([])
    expect(sharePackage.items).toHaveLength(13)
  })

  it('removes an image and reports its id when the URL cannot be downloaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        const unavailable = url.endsWith('/ctee-1.png')

        return new Response(unavailable ? '{"error":"missing"}' : new Uint8Array([1]), {
          headers: { 'content-type': unavailable ? 'application/json' : 'image/png' },
          status: unavailable ? 500 : 200,
        })
      }),
    )

    const sharePackage = await buildDailyReportSharePackage({
      payload: {} as Payload,
      report: report(),
      requestOrigin: 'https://reports.example.com',
    })

    expect(sharePackage.ready).toBe(false)
    expect(sharePackage.missingItemIds).toContain('ctee-newspaper')
    expect(sharePackage.items.some((item) => item.id === 'ctee-newspaper')).toBe(false)
    expect(sharePackage.missing.some((label) => label.includes('圖片網址無法下載'))).toBe(true)
  })
})
