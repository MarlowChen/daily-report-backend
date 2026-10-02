import { describe, expect, it } from 'vitest'

import { parseTwseCloseQuote, parseTwseRealtimeQuote, parseYahooChartQuote } from '../../src/lib/daily-report/stockMarketImages'

const target = {
  name: '台灣加權',
  region: '亞洲',
  stooqSymbol: '^twii',
  symbol: '^TWII',
}

describe('global stock close quote parsing', () => {
  it('uses the previous completed daily bar while the market is trading', () => {
    const quote = parseYahooChartQuote(
      target,
      {
        chart: {
          result: [
            {
              indicators: { quote: [{ close: [21000, 21200, 21350] }] },
              meta: {
                exchangeTimezoneName: 'Asia/Taipei',
                marketState: 'REGULAR',
                regularMarketPrice: 21380,
                symbol: '^TWII',
              },
              timestamp: [1785686400, 1785772800, 1785859200],
            },
          ],
        },
      },
      true,
    )

    expect(quote?.close).toBe(21200)
    expect(quote?.previousClose).toBe(21000)
    expect(quote?.change).toBe(200)
    expect(quote?.priceStatus).toBe('收盤')
  })

  it('uses the latest daily close after the market has closed', () => {
    const quote = parseYahooChartQuote(
      target,
      {
        chart: {
          result: [
            {
              indicators: { quote: [{ close: [21000, 21200, 21350] }] },
              meta: {
                exchangeTimezoneName: 'Asia/Taipei',
                marketState: 'CLOSED',
                regularMarketPrice: 99999,
                symbol: '^TWII',
              },
              timestamp: [1785686400, 1785772800, 1785859200],
            },
          ],
        },
      },
      true,
    )

    expect(quote?.close).toBe(21350)
    expect(quote?.previousClose).toBe(21200)
    expect(quote?.priceStatus).toBe('收盤')
  })

  it('uses the official TWSE close on or before the report date', () => {
    const quote = parseTwseCloseQuote(
      {
        data: [
          ['115/08/03', '', '', '', '43,386.41', '266.66'],
          ['115/08/04', '', '', '', '43,360.66', '-25.75'],
        ],
        stat: 'OK',
      },
      '2026-08-04',
    )

    expect(quote).toMatchObject({
      change: -25.75,
      close: 43360.66,
      date: '2026-08-04',
      sourceSymbol: 'TWSE TAIEX',
      symbol: '^TWII',
      priceStatus: '收盤',
    })
  })

  it('uses and labels the official TWSE intraday index during trading hours', () => {
    const quote = parseTwseRealtimeQuote(
      {
        msgArray: [{ d: '20260805', t: '10:05:00', y: '43360.66', z: '44965.66' }],
        rtcode: '0000',
      },
      '2026-08-05',
    )

    expect(quote).toMatchObject({
      close: 44965.66,
      date: '2026-08-05',
      previousClose: 43360.66,
      priceStatus: '即時',
      sourceSymbol: 'TWSE MIS TAIEX',
    })
  })
})
