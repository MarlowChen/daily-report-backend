import { describe, expect, it } from 'vitest'

import {
  buildAuthorizedEconomicDailyImageUrl,
  isExpectedEconomicDailyFullImageResponse,
  isSuccessfulNlpiLoginResponse,
  selectEconomicDailyImageUrl,
  toEconomicDailyFullImageUrl,
} from '../../src/lib/daily-report/economicDaily'

describe('Economic Daily authenticated image selection', () => {
  it('builds a full image URL with the short-lived UDN authorization token', () => {
    const url = buildAuthorizedEconomicDailyImageUrl({
      authorizationSuffix: '&jsessionid=abc-n1&hostname_port=12:80',
      fplocation: 'ED/ED2026/10/01/A01_20100.JPG',
    })

    expect(url).toContain('https://ed.udndata.com/fullpage/testShowFullpage.jsp?')
    expect(url).toContain('pic=big')
    expect(url).toContain('FPLOCATION=ED%2FED2026%2F10%2F01%2FA01_20100.JPG')
    expect(url).toContain('&jsessionid=abc-n1&hostname_port=12:80')
  })

  it('accepts only an explicitly successful NLPI login response', () => {
    expect(isSuccessfulNlpiLoginResponse({ data: { result: { success: true } } })).toBe(true)
    expect(isSuccessfulNlpiLoginResponse({ data: { result: { success: false } } })).toBe(false)
    expect(isSuccessfulNlpiLoginResponse({ errors: [{ message: 'rejected' }] })).toBe(false)
  })

  it('selects the requested page instead of the first image on the page', () => {
    const selected = selectEconomicDailyImageUrl({
      baseUrl: 'https://udndata.example/reader',
      candidates: [
        '/ED/ED2026/08/03/A02_20200.JPG',
        '/assets/logo.png',
        '/ED/ED2026/08/03/A01_20100.JPG',
      ],
      pageCode: 'A01',
    })

    expect(selected).toBe('https://udndata.example/ED/ED2026/08/03/A01_20100.JPG')
  })

  it('returns null instead of substituting a different page image', () => {
    const selected = selectEconomicDailyImageUrl({
      baseUrl: 'https://udndata.example/reader',
      candidates: ['/ED/ED2026/08/03/A02_20200.JPG', '/assets/logo.png'],
      pageCode: 'A01',
    })

    expect(selected).toBeNull()
  })

  it('converts the authenticated thumbnail wrapper to the full newspaper image', () => {
    const fullImageUrl = toEconomicDailyFullImageUrl(
      'https://ed.udndata.com/fullpage/testShowFullpage.jsp?paperID=ED&pic=small&FPLOCATION=ED%2FED2026%2F08%2F04%2FA01_20100.JPG',
    )

    expect(fullImageUrl).toBe('https://ed.udndata.com/ED/ED2026/08/04/A01_20100.JPG')
  })

  it('ignores the transitional HTML response and accepts only the requested full image', () => {
    const responseUrl =
      'https://ed.udndata.com/fullpage/testShowFullpage.jsp?pic=big&FPLOCATION=ED/ED2026/08/04/A01_20100.JPG'

    expect(
      isExpectedEconomicDailyFullImageResponse({
        contentType: 'text/html',
        pageCode: 'A01',
        responseUrl,
        status: 200,
      }),
    ).toBe(false)
    expect(
      isExpectedEconomicDailyFullImageResponse({
        contentType: 'image/jpeg',
        pageCode: 'A01',
        responseUrl,
        status: 200,
      }),
    ).toBe(true)
    expect(
      isExpectedEconomicDailyFullImageResponse({
        contentType: 'image/jpeg',
        pageCode: 'A02',
        responseUrl,
        status: 200,
      }),
    ).toBe(false)
  })
})
