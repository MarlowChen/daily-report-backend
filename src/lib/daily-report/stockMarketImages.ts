type ScreenshotResult = {
  buffer: Buffer
  filename: string
}

type Quote = {
  change: number | null
  changePercent: number | null
  close: number | null
  date: string
  name: string
  previousClose: number | null
  priceStatus: '即時' | '收盤' | '暫缺'
  region?: string
  sector?: string
  sourceSymbol: string
  symbol: string
  weight?: number
}

type QuoteTarget = {
  name: string
  region?: string
  sector?: string
  stooqSymbol: string
  symbol: string
  weight?: number
  googleSymbol?: string
  yahooSymbol?: string
}

const GLOBAL_INDEXES: QuoteTarget[] = [
  { name: '道瓊', region: '美國', stooqSymbol: '^dji', symbol: '^DJI', googleSymbol: '.DJI:INDEXDJX' },
  { name: '標普500', region: '美國', stooqSymbol: '^spx', symbol: '^GSPC', googleSymbol: '.INX:INDEXSP' },
  { name: '那斯達克', region: '美國', stooqSymbol: '^ndq', symbol: '^IXIC', googleSymbol: '.IXIC:INDEXNASDAQ' },
  { name: '費半', region: '美國', stooqSymbol: 'soxx.us', symbol: 'SOXX', googleSymbol: 'SOXX:NASDAQ' },
  { name: '英國富時', region: '歐洲', stooqSymbol: '^ftm', symbol: '^FTSE', googleSymbol: 'UKX:INDEXFTSE' },
  { name: '德國DAX', region: '歐洲', stooqSymbol: '^dax', symbol: '^GDAXI', googleSymbol: 'DAX:INDEXDB' },
  { name: '法國CAC', region: '歐洲', stooqSymbol: '^cac', symbol: '^FCHI', googleSymbol: 'PX1:INDEXEURO' },
  { name: '日經225', region: '亞洲', stooqSymbol: '^nkx', symbol: '^N225', googleSymbol: 'NI225:INDEXNIKKEI' },
  { name: '香港恆生', region: '亞洲', stooqSymbol: '^hsi', symbol: '^HSI', googleSymbol: 'HSI:INDEXHANGSENG' },
  {
    name: '上海綜合',
    region: '亞洲',
    stooqSymbol: '^shc',
    symbol: '000001.SS',
    googleSymbol: '000001:SHA',
    yahooSymbol: '000001.SS',
  },
  { name: '韓國KOSPI', region: '亞洲', stooqSymbol: '^kospi', symbol: '^KS11', googleSymbol: 'KOSPI:KRX' },
  { name: '台灣加權', region: '亞洲', stooqSymbol: '^twii', symbol: '^TWII', googleSymbol: 'TAIEX:INDEXTPE' },
]

const US_HEATMAP_STOCKS: QuoteTarget[] = [
  { name: 'NVIDIA', sector: '半導體', stooqSymbol: 'nvda.us', symbol: 'NVDA', weight: 10.8 },
  { name: 'Microsoft', sector: '軟體', stooqSymbol: 'msft.us', symbol: 'MSFT', weight: 9.9 },
  { name: 'Apple', sector: '科技硬體', stooqSymbol: 'aapl.us', symbol: 'AAPL', weight: 8.7 },
  { name: 'Alphabet A', sector: '網路服務', stooqSymbol: 'googl.us', symbol: 'GOOGL', weight: 5.7 },
  { name: 'Amazon', sector: '電商雲端', stooqSymbol: 'amzn.us', symbol: 'AMZN', weight: 5.2 },
  { name: 'Meta', sector: '社群媒體', stooqSymbol: 'meta.us', symbol: 'META', weight: 3.9 },
  { name: 'Broadcom', sector: '半導體', stooqSymbol: 'avgo.us', symbol: 'AVGO', weight: 3.2 },
  { name: 'Tesla', sector: '電動車', stooqSymbol: 'tsla.us', symbol: 'TSLA', weight: 2.5 },
  { name: 'Berkshire', sector: '金融', stooqSymbol: 'brk-b.us', symbol: 'BRK.B', weight: 2.3, yahooSymbol: 'BRK-B' },
  { name: 'JPMorgan', sector: '金融', stooqSymbol: 'jpm.us', symbol: 'JPM', weight: 1.8 },
  { name: 'Eli Lilly', sector: '醫療', stooqSymbol: 'lly.us', symbol: 'LLY', weight: 1.7 },
  { name: 'Visa', sector: '支付', stooqSymbol: 'v.us', symbol: 'V', weight: 1.5 },
  { name: 'Exxon Mobil', sector: '能源', stooqSymbol: 'xom.us', symbol: 'XOM', weight: 1.4 },
  { name: 'Mastercard', sector: '支付', stooqSymbol: 'ma.us', symbol: 'MA', weight: 1.3 },
  { name: 'Costco', sector: '零售', stooqSymbol: 'cost.us', symbol: 'COST', weight: 1.2 },
  { name: 'Netflix', sector: '媒體', stooqSymbol: 'nflx.us', symbol: 'NFLX', weight: 1.1 },
  { name: 'Walmart', sector: '零售', stooqSymbol: 'wmt.us', symbol: 'WMT', weight: 1.1 },
  { name: 'Oracle', sector: '軟體', stooqSymbol: 'orcl.us', symbol: 'ORCL', weight: 1.0 },
  { name: 'Johnson & Johnson', sector: '醫療', stooqSymbol: 'jnj.us', symbol: 'JNJ', weight: 1.0 },
  { name: 'Home Depot', sector: '零售', stooqSymbol: 'hd.us', symbol: 'HD', weight: 0.9 },
  { name: 'Procter & Gamble', sector: '民生消費', stooqSymbol: 'pg.us', symbol: 'PG', weight: 0.9 },
  { name: 'Palantir', sector: '軟體', stooqSymbol: 'pltr.us', symbol: 'PLTR', weight: 0.8 },
  { name: 'AMD', sector: '半導體', stooqSymbol: 'amd.us', symbol: 'AMD', weight: 0.8 },
  { name: 'Salesforce', sector: '軟體', stooqSymbol: 'crm.us', symbol: 'CRM', weight: 0.7 },
]

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const formatNumber = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '--'

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value)
}

const signedNumber = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '--'

  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatNumber(value)}`
}

const signedPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '--'

  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
}

const tone = (changePercent: number | null) => {
  if (changePercent === null || !Number.isFinite(changePercent)) {
    return {
      background: '#EEF1F5',
      border: '#AEB7C4',
      className: 'empty',
      foreground: '#364150',
      label: '資料暫缺',
    }
  }
  if (changePercent >= 1) {
    return {
      background: '#155724',
      border: '#155724',
      className: 'strong-up',
      foreground: '#D4EDDA',
      label: '大漲 / 強勢',
    }
  }
  if (changePercent >= 0.01) {
    return {
      background: '#D4EDDA',
      border: '#9BD2AA',
      className: 'mild-up',
      foreground: '#155724',
      label: '微漲 / 盤整偏多',
    }
  }
  if (changePercent >= -0.5) {
    return {
      background: '#F8F9FA',
      border: '#D5D9DF',
      className: 'flat',
      foreground: '#212529',
      label: '平盤 / 輕微震盪',
    }
  }
  if (changePercent >= -2) {
    return {
      background: '#F8D7DA',
      border: '#E5A4AA',
      className: 'moderate-down',
      foreground: '#721C24',
      label: '中度下跌 / 修正',
    }
  }

  return {
    background: '#721C24',
    border: '#721C24',
    className: 'crash',
    foreground: '#F8D7DA',
    label: '重挫 / 極度警戒',
  }
}

const parseNumber = (value: string | undefined) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const emptyQuote = (target: QuoteTarget): Quote => ({
  change: null,
  changePercent: null,
  close: null,
  date: '',
  name: target.name,
  previousClose: null,
  priceStatus: '暫缺',
  region: target.region,
  sector: target.sector,
  sourceSymbol: target.symbol,
  symbol: target.symbol,
  weight: target.weight,
})

const latestFiniteValue = (values: unknown[]) => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]

    if (typeof value === 'number' && Number.isFinite(value)) return { index, value }
  }

  return null
}

const finiteNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export const parseYahooChartQuote = (target: QuoteTarget, json: unknown, completedOnly = false): Quote | null => {
  const result = (
    json as {
      chart?: {
        result?: Array<{
          indicators?: {
            quote?: Array<{
              close?: unknown[]
            }>
          }
          meta?: {
            chartPreviousClose?: unknown
            exchangeTimezoneName?: string
            marketState?: string
            regularMarketPrice?: unknown
            symbol?: string
          }
          timestamp?: number[]
        }>
      }
    }
  ).chart?.result?.[0]
  const closeValues = result?.indicators?.quote?.[0]?.close || []
  const latestClose = latestFiniteValue(closeValues)
  const completedClose =
    completedOnly && result?.meta?.marketState === 'REGULAR' && latestClose
      ? latestFiniteValue(closeValues.slice(0, latestClose.index))
      : latestClose
  const close = completedOnly
    ? completedClose?.value ?? null
    : finiteNumber(result?.meta?.regularMarketPrice) ?? latestClose?.value ?? null
  const previousClose =
    completedOnly
      ? completedClose
        ? latestFiniteValue(closeValues.slice(0, completedClose.index))?.value ?? null
        : null
      : finiteNumber(result?.meta?.chartPreviousClose) ??
        (latestClose ? latestFiniteValue(closeValues.slice(0, latestClose.index))?.value : null) ??
        null

  if (close === null || previousClose === null || previousClose === 0) return null

  const change = close - previousClose
  const changePercent = (change / previousClose) * 100
  const timestamp = completedClose ? result?.timestamp?.[completedClose.index] : undefined
  const date = timestamp
    ? new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: result?.meta?.exchangeTimezoneName || 'UTC',
        year: 'numeric',
      }).format(new Date(timestamp * 1000))
    : ''

  return {
    change,
    changePercent,
    close,
    date,
    name: target.name,
    previousClose,
    priceStatus: !completedOnly && result?.meta?.marketState === 'REGULAR' ? '即時' : '收盤',
    region: target.region,
    sector: target.sector,
    sourceSymbol: result?.meta?.symbol || target.yahooSymbol || target.symbol,
    symbol: target.symbol,
    weight: target.weight,
  }
}

const yahooSymbolFor = (target: QuoteTarget) => target.yahooSymbol || target.symbol.replace('.', '-')

const fetchYahooQuote = async (
  target: QuoteTarget,
  {
    completedOnly = false,
    maxAttempts = 3,
  }: {
    completedOnly?: boolean
    maxAttempts?: number
  } = {},
): Promise<Quote | null> => {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbolFor(target))}?range=5d&interval=1d`
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null)

    if (response?.ok) {
      const quote = parseYahooChartQuote(target, await response.json().catch(() => null), completedOnly)
      if (quote) return quote
    }

    const retryDelay = response?.status === 429 ? 2500 * (attempt + 1) : 800 * (attempt + 1)
    await new Promise((resolve) => setTimeout(resolve, retryDelay))
  }

  return null
}

const fetchStooqQuote = async (target: QuoteTarget): Promise<Quote | null> => {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(target.stooqSymbol)}&i=d`
  const response = await fetch(url, {
    headers: {
      accept: 'text/csv,text/plain,*/*',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null)
  if (!response?.ok) return null

  const rows = (await response.text())
    .trim()
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.split(','))
    .map(([date, , , , close]) => ({ close: Number(close), date }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/u.test(row.date) && Number.isFinite(row.close))
  const latest = rows.at(-1)
  const previous = rows.at(-2)
  if (!latest || !previous || previous.close === 0) return null

  const change = latest.close - previous.close

  return {
    change,
    changePercent: (change / previous.close) * 100,
    close: latest.close,
    date: latest.date,
    name: target.name,
    previousClose: previous.close,
    priceStatus: '收盤',
    region: target.region,
    sector: target.sector,
    sourceSymbol: target.stooqSymbol,
    symbol: target.symbol,
    weight: target.weight,
  }
}

const fetchStooqQuotes = async (targets: QuoteTarget[]) => {
  const results = await Promise.all(targets.map(fetchStooqQuote))
  const fetchedQuotes = results.filter((quote): quote is Quote => Boolean(quote))
  const bySymbol = new Map(fetchedQuotes.map((quote) => [quote.symbol, quote]))

  return {
    fetchedCount: fetchedQuotes.length,
    quotes: targets.map((target) => bySymbol.get(target.symbol) || emptyQuote(target)),
  }
}

const US_NYSE_SYMBOLS = new Set(['BRK.B', 'HD', 'JNJ', 'JPM', 'LLY', 'MA', 'PG', 'V', 'WMT', 'XOM'])

const withUsGoogleSymbols = (targets: QuoteTarget[]) => {
  return targets.map((target) => ({
    ...target,
    googleSymbol: target.googleSymbol || `${target.symbol}:${US_NYSE_SYMBOLS.has(target.symbol) ? 'NYSE' : 'NASDAQ'}`,
  }))
}

const fetchQuotes = async (
  targets: QuoteTarget[],
  {
    completedOnly = false,
    completedOnlyForTarget,
    maxAttempts = 3,
    parallel = false,
    requestDelay = 900,
  }: {
    completedOnly?: boolean
    completedOnlyForTarget?: (target: QuoteTarget) => boolean
    maxAttempts?: number
    parallel?: boolean
    requestDelay?: number
  } = {},
) => {
  if (parallel) {
    const results = await Promise.all(
      targets.map((target) =>
        fetchYahooQuote(target, {
          completedOnly: completedOnlyForTarget ? completedOnlyForTarget(target) : completedOnly,
          maxAttempts,
        }),
      ),
    )
    const fetchedQuotes = results.filter((quote): quote is Quote => Boolean(quote))
    const bySymbol = new Map(fetchedQuotes.map((quote) => [quote.symbol, quote]))

    return {
      fetchedCount: fetchedQuotes.length,
      quotes: targets.map((target) => bySymbol.get(target.symbol) || emptyQuote(target)),
    }
  }

  const fetchedQuotes: Quote[] = []

  for (const target of targets) {
    const quote = await fetchYahooQuote(target, {
      completedOnly: completedOnlyForTarget ? completedOnlyForTarget(target) : completedOnly,
      maxAttempts,
    })
    if (quote) fetchedQuotes.push(quote)
    await new Promise((resolve) => setTimeout(resolve, requestDelay))
  }

  const bySymbol = new Map(fetchedQuotes.map((quote) => [quote.symbol, quote]))
  const quotes = targets.map((target) => bySymbol.get(target.symbol) || emptyQuote(target))

  return {
    fetchedCount: fetchedQuotes.length,
    quotes,
  }
}

const parseTaiwanDate = (value: string) => {
  const [rocYear, month, day] = value.split('/')
  const year = Number(rocYear) + 1911
  if (!year || !month || !day) return ''
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

export const parseTwseCloseQuote = (json: unknown, reportDate: string): Quote | null => {
  const result = json as { data?: string[][]; stat?: string } | null
  const rows = result?.stat === 'OK' ? result.data || [] : []
  const eligibleRows = rows
    .map((row) => ({ date: parseTaiwanDate(row[0] || ''), row }))
    .filter((item) => item.date && item.date <= reportDate)
  const latest = eligibleRows.at(-1)
  if (!latest) return null

  const close = parseNumber(latest.row[4]?.replaceAll(',', ''))
  const change = parseNumber(latest.row[5]?.replaceAll(',', ''))
  if (close === null || change === null || close - change === 0) return null
  const previousClose = close - change

  return {
    change,
    changePercent: (change / previousClose) * 100,
    close,
    date: latest.date,
    name: '台灣加權',
    previousClose,
    priceStatus: '收盤',
    region: '亞洲',
    sourceSymbol: 'TWSE TAIEX',
    symbol: '^TWII',
  }
}

export const parseTwseRealtimeQuote = (json: unknown, reportDate: string): Quote | null => {
  const result = json as { msgArray?: Array<Record<string, string>>; rtcode?: string } | null
  const item = result?.rtcode === '0000' ? result.msgArray?.[0] : undefined
  if (!item) return null

  const date = item.d?.replace(/^(\d{4})(\d{2})(\d{2})$/u, '$1-$2-$3') || ''
  const close = parseNumber(item.z)
  const previousClose = parseNumber(item.y)
  if (!date || date !== reportDate || close === null || previousClose === null || previousClose === 0) return null

  const change = close - previousClose
  const marketTime = item.t || item['%'] || ''
  const isTrading = marketTime >= '09:00:00' && marketTime < '13:30:00'

  return {
    change,
    changePercent: (change / previousClose) * 100,
    close,
    date,
    name: '台灣加權',
    previousClose,
    priceStatus: isTrading ? '即時' : '收盤',
    region: '亞洲',
    sourceSymbol: 'TWSE MIS TAIEX',
    symbol: '^TWII',
  }
}

const fetchTwseRealtimeQuote = async (reportDate: string): Promise<Quote | null> => {
  const response = await fetch('https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0', {
    headers: {
      referer: 'https://mis.twse.com.tw/stock/index.jsp',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null)
  if (!response?.ok) return null
  return parseTwseRealtimeQuote(await response.json().catch(() => null), reportDate)
}

const fetchTwseCloseQuote = async (reportDate: string): Promise<Quote | null> => {
  const response = await fetch(
    `https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${reportDate.replaceAll('-', '')}&response=json`,
    { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000) },
  ).catch(() => null)
  if (!response?.ok) return null

  return parseTwseCloseQuote(await response.json().catch(() => null), reportDate)
}

const parseGoogleNumber = (value: string) => {
  const normalized = value.replace(/[$,\s]/g, '').replace(/[()]/g, '')
  const number = Number(normalized)

  return Number.isFinite(number) ? number : null
}

const parseGoogleFinanceDate = (lines: string[], reportDate: string) => {
  const dateLine = lines.find((line) => /^(?:Closed:\s*)?[A-Z][a-z]{2} \d{1,2},/u.test(line))
  const match = dateLine?.match(/^(?:Closed:\s*)?([A-Z][a-z]{2}) (\d{1,2}),/u)
  if (!match) return ''

  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[1]) + 1
  if (!month) return ''
  let year = Number(reportDate.slice(0, 4))
  let date = `${year}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`
  if (date > reportDate) {
    year -= 1
    date = `${year}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`
  }
  return date
}

const parseGoogleFinanceQuote = (target: QuoteTarget, text: string, reportDate: string): Quote | null => {
  const googleSymbol = target.googleSymbol
  if (!googleSymbol) return null

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const symbolIndex = lines.findIndex((line) => line === googleSymbol)
  if (symbolIndex < 0) return null

  const windowLines = lines.slice(symbolIndex, symbolIndex + 32)
  const priceLine = windowLines.find((line) => /^[$]?\d[\d,]*(?:\.\d+)?$/.test(line))
  const percentLine = windowLines.find((line) => /^[+-]?\d+(?:\.\d+)?%$/.test(line))
  const changeLine = windowLines.find((line) => /^\([+-]?\d[\d,]*(?:\.\d+)?\) Today$/.test(line))
  const close = priceLine ? parseGoogleNumber(priceLine) : null
  const change = changeLine ? parseGoogleNumber(changeLine.replace(' Today', '')) : null
  const changePercent = percentLine ? parseGoogleNumber(percentLine.replace('%', '')) : null
  const date = parseGoogleFinanceDate(windowLines, reportDate)

  if (close === null || change === null || changePercent === null || !date) return null

  return {
    change,
    changePercent,
    close,
    date,
    name: target.name,
    previousClose: close - change,
    priceStatus: target.region === '亞洲' && date === reportDate ? '即時' : '收盤',
    region: target.region,
    sector: target.sector,
    sourceSymbol: googleSymbol,
    symbol: target.symbol,
    weight: target.weight,
  }
}

const fetchGoogleFinanceQuotes = async (targets: QuoteTarget[], reportDate: string) => {
  const { chromium } = await import('playwright-chromium')
  const browser = await chromium.launch({
    headless: true,
  })
  const fetchedQuotes: Quote[] = []
  const pageWaitMs = Math.max(0, Number(process.env.GOOGLE_FINANCE_PAGE_WAIT_MS || 900))

  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      viewport: {
        height: 820,
        width: 1080,
      },
    })

    for (const target of targets) {
      if (!target.googleSymbol) continue

      const url = `https://www.google.com/finance/quote/${encodeURIComponent(target.googleSymbol).replace(/%3A/g, ':')}`
      await page.goto(url, {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      })
      await page.waitForTimeout(pageWaitMs)

      const text = await page.locator('body').innerText({
        timeout: 10000,
      }).catch(() => '')
      const quote = parseGoogleFinanceQuote(target, text, reportDate)
      if (quote) fetchedQuotes.push(quote)
    }
  } finally {
    await browser.close()
  }

  const bySymbol = new Map(fetchedQuotes.map((quote) => [quote.symbol, quote]))

  return {
    fetchedCount: fetchedQuotes.length,
    quotes: targets.map((target) => bySymbol.get(target.symbol) || emptyQuote(target)),
  }
}

const quoteCard = (quote: Quote) => {
  const quoteTone = tone(quote.changePercent)

  return `
    <article class="quote" style="background:${quoteTone.background};border-color:${quoteTone.border};color:${quoteTone.foreground}">
      <div>
        <div class="region">${escapeHtml(quote.region || '')}</div>
        <h2>${escapeHtml(quote.name)}</h2>
        <div class="symbol">${escapeHtml(quote.symbol)}</div>
        <div class="market-date">${escapeHtml(quote.date || '日期暫缺')} · ${escapeHtml(quote.priceStatus)}</div>
      </div>
      <div class="numbers">
        <strong>${formatNumber(quote.close)}</strong>
        <span>${signedNumber(quote.change)} / ${signedPercent(quote.changePercent)}</span>
        <em>${escapeHtml(quoteTone.label)}</em>
      </div>
    </article>
  `
}

const buildGlobalStockCloseHtml = ({
  fetchedCount,
  quotes,
  reportDate,
  sourceName = 'Yahoo Finance',
  title = '全球主要市場行情',
}: {
  fetchedCount: number
  quotes: Quote[]
  reportDate: string
  sourceName?: string
  title?: string
}) => {
  const byRegion = ['美國', '歐洲', '亞洲'].map((region) => ({
    quotes: quotes.filter((quote) => quote.region === region),
    region,
  }))
  const sourceText = `資料來源：${sourceName}。亞洲市場交易中顯示最新行情並標記「即時」；美國、歐洲固定顯示最近完成交易日並標記「收盤」。卡片日期為實際交易日期；已取得 ${fetchedCount}/${GLOBAL_INDEXES.length} 個市場資料。`

  return `<!doctype html>
  <html lang="zh-Hant">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #edf1f5;
          color: #141922;
          font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
        }
        .sheet {
          background: #ffffff;
          min-height: 1080px;
          padding: 52px 58px 58px;
          width: 1080px;
        }
        .topbar {
          align-items: flex-start;
          border-bottom: 3px solid #171b22;
          display: flex;
          justify-content: space-between;
          padding-bottom: 24px;
        }
        .brand {
          color: #c61717;
          font-size: 24px;
          font-weight: 900;
          margin-bottom: 8px;
        }
        h1 {
          font-size: 52px;
          line-height: 1.08;
          margin: 0;
        }
        .date {
          color: #4f5966;
          font-size: 24px;
          font-weight: 700;
        }
        .regions {
          display: grid;
          gap: 26px;
          margin-top: 34px;
        }
        .region-block {
          border: 1px solid #d8dde5;
          border-left: 10px solid #2357a8;
          padding: 24px;
        }
        .region-title {
          align-items: center;
          display: flex;
          justify-content: space-between;
          margin-bottom: 18px;
        }
        .region-title h2 {
          font-size: 34px;
          margin: 0;
        }
        .quotes {
          display: grid;
          gap: 14px;
          grid-template-columns: 1fr 1fr;
        }
        .quote {
          align-items: center;
          border: 2px solid;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          min-height: 132px;
          padding: 20px;
        }
        .quote h2 {
          font-size: 30px;
          line-height: 1.1;
          margin: 4px 0;
        }
        .region, .symbol {
          font-size: 18px;
          font-weight: 800;
          opacity: 0.74;
        }
        .market-date {
          font-size: 16px;
          font-weight: 800;
          margin-top: 7px;
          opacity: 0.76;
        }
        .numbers {
          text-align: right;
        }
        .numbers strong {
          display: block;
          font-size: 30px;
        }
        .numbers span {
          display: block;
          font-size: 22px;
          font-weight: 800;
          margin-top: 8px;
        }
        .numbers em {
          display: block;
          font-size: 16px;
          font-style: normal;
          font-weight: 900;
          margin-top: 8px;
          opacity: 0.86;
        }
        .source {
          color: #687485;
          font-size: 18px;
          line-height: 1.45;
          margin-top: 26px;
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <header class="topbar">
          <div>
            <div class="brand">V1 Daily Report</div>
            <h1>${escapeHtml(title)}</h1>
          </div>
          <div class="date">${escapeHtml(reportDate)}</div>
        </header>
        <section class="regions">
          ${byRegion
            .map(
              (section) => `
                <div class="region-block">
                  <div class="region-title"><h2>${escapeHtml(section.region)}</h2></div>
                  <div class="quotes">${section.quotes.map(quoteCard).join('')}</div>
                </div>
              `,
            )
            .join('')}
        </section>
        <div class="source">${escapeHtml(sourceText)}</div>
      </main>
    </body>
  </html>`
}

const heatmapTile = (quote: Quote) => {
  const quoteTone = tone(quote.changePercent)
  const flexGrow = Math.max(8, Math.round((quote.weight || 0.7) * 10))

  return `
    <article class="tile" style="background:${quoteTone.background};color:${quoteTone.foreground};border-color:${quoteTone.border};flex-grow:${flexGrow}">
      <div class="tile-top">
        <strong>${escapeHtml(quote.symbol)}</strong>
        <span>${escapeHtml(quote.sector || '')}</span>
      </div>
      <div class="company">${escapeHtml(quote.name)}</div>
      <div class="change">${signedPercent(quote.changePercent)}</div>
      <div class="price">${formatNumber(quote.close)}</div>
    </article>
  `
}

const buildUsStockHeatmapHtml = ({
  fetchedCount,
  quotes,
  reportDate,
}: {
  fetchedCount: number
  quotes: Quote[]
  reportDate: string
}) => {
  const sourceText = `資料來源：Yahoo Finance。面積以大型美股近似市值權重排序，顏色依漲跌幅規則渲染；已取得 ${fetchedCount}/${US_HEATMAP_STOCKS.length} 檔。`

  return `<!doctype html>
  <html lang="zh-Hant">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #101418;
          color: #f2f5f8;
          font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
        }
        .sheet {
          background: #151a20;
          min-height: 900px;
          padding: 34px;
          width: 1280px;
        }
        .topbar {
          align-items: end;
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        .brand {
          color: #ff5a5f;
          font-size: 22px;
          font-weight: 900;
          margin-bottom: 6px;
        }
        h1 {
          font-size: 44px;
          line-height: 1.05;
          margin: 0;
        }
        .date {
          color: #cad2dc;
          font-size: 22px;
          font-weight: 800;
        }
        .heatmap {
          align-content: stretch;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          height: 736px;
        }
        .tile {
          border: 2px solid;
          border-radius: 6px;
          display: flex;
          flex-basis: 150px;
          flex-direction: column;
          justify-content: space-between;
          min-height: 108px;
          min-width: 132px;
          padding: 14px;
        }
        .tile-top {
          align-items: center;
          display: flex;
          gap: 8px;
          justify-content: space-between;
        }
        .tile-top strong {
          font-size: 25px;
          line-height: 1;
        }
        .tile-top span {
          font-size: 14px;
          font-weight: 800;
          opacity: 0.78;
        }
        .company {
          font-size: 15px;
          font-weight: 700;
          opacity: 0.82;
        }
        .change {
          font-size: 29px;
          font-weight: 900;
          line-height: 1;
        }
        .price {
          font-size: 15px;
          font-weight: 800;
          opacity: 0.82;
        }
        .source {
          color: #b6c0cc;
          font-size: 16px;
          line-height: 1.4;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <header class="topbar">
          <div>
            <div class="brand">V1 Daily Report</div>
            <h1>美股市佔價格變化</h1>
          </div>
          <div class="date">${escapeHtml(reportDate)}</div>
        </header>
        <section class="heatmap">
          ${quotes.map(heatmapTile).join('')}
        </section>
        <div class="source">${escapeHtml(sourceText)}</div>
      </main>
    </body>
  </html>`
}

const isBlockedHeatmapPage = ({ text, url }: { text: string; url: string }) => {
  const content = `${url}\n${text}`.toLowerCase()

  return [
    'cloudflare',
    'checking your browser',
    'verify you are human',
    'performing security verification',
    'security verification',
    'attention required',
    'cf-browser-verification',
  ].some((token) => content.includes(token))
}

const captureFinvizUsStockHeatmapScreenshot = async (reportDate: string): Promise<ScreenshotResult> => {
  const { chromium } = await import('playwright-chromium')
  const browser = await chromium.launch({
    headless: true,
  })
  const sourceUrl = process.env.US_STOCK_HEATMAP_URL || 'https://finviz.com/map?t=sec'

  try {
    const page = await browser.newPage({
      colorScheme: 'dark',
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      viewport: {
        height: 900,
        width: 1280,
      },
    })

    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
    })
    await page.goto(sourceUrl, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    })
    await page.waitForLoadState('networkidle', {
      timeout: 30000,
    }).catch(() => undefined)
    await page.waitForTimeout(3500)

    const pageText = await page.locator('body').innerText({
      timeout: 5000,
    }).catch(() => '')

    if (isBlockedHeatmapPage({ text: pageText, url: page.url() })) {
      throw new Error('Finviz heatmap returned a Cloudflare/security verification page')
    }

    if (/upgrade your finviz experience/i.test(pageText)) {
      await page.keyboard.press('Escape').catch(() => undefined)
      await page.waitForTimeout(300)
      await page.mouse.click(890, 252).catch(() => undefined)
      await page.waitForTimeout(800)
    }

    const mapCanvas = page.locator('canvas.chart').first()
    if (await mapCanvas.isVisible({ timeout: 5000 }).catch(() => false)) {
      const box = await mapCanvas.boundingBox()
      if (box && box.width >= 900 && box.height >= 500) {
        return {
          buffer: await mapCanvas.screenshot({ animations: 'disabled', type: 'png' }),
          filename: `us-stock-heatmap-${reportDate}.png`,
        }
      }
    }

    const publishedImageResponsePromise = page
      .waitForResponse((response) => {
        const contentType = response.headers()['content-type'] || ''

        return response.url().includes('publish.finviz.com') && contentType.includes('image')
      }, {
        timeout: 20000,
      })
      .catch(() => null)

    const shareMapButton = page.getByText('Share Map', {
      exact: true,
    })
    if (!(await shareMapButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      throw new Error('Finviz Share Map control is unavailable')
    }
    await shareMapButton.click({ timeout: 5000 })
    await page.waitForTimeout(1500)

    const publishedImageResponse = await publishedImageResponsePromise
    if (publishedImageResponse?.ok()) {
      return {
        buffer: await publishedImageResponse.body(),
        filename: `us-stock-heatmap-${reportDate}.png`,
      }
    }

    const publishedImageUrl = await page
      .locator('img[src*="publish.finviz.com"][src$=".png"], img[src*="published_map"], img[alt*="Map"]')
      .evaluateAll((images) => {
        const candidates = images
          .map((image) => {
            const element = image as HTMLImageElement

            return {
              height: element.naturalHeight,
              src: element.src,
              width: element.naturalWidth,
            }
          })
          .filter((image) => image.src && image.width >= 900 && image.height >= 500)
          .sort((a, b) => b.width * b.height - a.width * a.height)

        return candidates[0]?.src || ''
      })

    if (!publishedImageUrl) {
      throw new Error('Finviz Share Map did not expose a published map image')
    }

    const imageResponse = await fetch(publishedImageUrl, {
      headers: {
        accept: 'image/png,image/*,*/*',
        referer: page.url(),
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      },
    })
    const contentType = imageResponse.headers.get('content-type') || ''

    if (!imageResponse.ok || !contentType.includes('image')) {
      throw new Error(`Finviz published map download failed: ${imageResponse.status} ${contentType}`)
    }

    return {
      buffer: Buffer.from(await imageResponse.arrayBuffer()),
      filename: `us-stock-heatmap-${reportDate}.png`,
    }
  } finally {
    await browser.close()
  }
}

const screenshotHtml = async ({
  height,
  html,
  selector,
  width,
}: {
  height: number
  html: string
  selector: string
  width: number
}) => {
  const { chromium } = await import('playwright-chromium')
  const browser = await chromium.launch({
    headless: true,
  })

  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: {
        height,
        width,
      },
    })

    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(500)

    return await page.locator(selector).screenshot({
      animations: 'disabled',
      type: 'png',
    })
  } finally {
    await browser.close()
  }
}

const renderGeneratedUsStockHeatmapScreenshot = async (reportDate: string): Promise<ScreenshotResult> => {
  const preferGoogle = process.env.US_STOCK_HEATMAP_PREFER_GOOGLE === '1'
  let fetchedCount = 0
  let quotes: Quote[] = US_HEATMAP_STOCKS.map(emptyQuote)

  if (preferGoogle) {
    const googleQuotes = await fetchGoogleFinanceQuotes(withUsGoogleSymbols(US_HEATMAP_STOCKS), reportDate)
    fetchedCount = googleQuotes.fetchedCount
    quotes = googleQuotes.quotes
  } else {
    const yahooQuotes = await fetchQuotes(US_HEATMAP_STOCKS, {
      maxAttempts: 1,
      requestDelay: 180,
    })
    fetchedCount = yahooQuotes.fetchedCount
    quotes = yahooQuotes.quotes
  }
  if (fetchedCount === 0 && !preferGoogle) {
    const stooqQuotes = await fetchStooqQuotes(US_HEATMAP_STOCKS)
    fetchedCount = stooqQuotes.fetchedCount
    quotes = stooqQuotes.quotes
  }
  if (fetchedCount === 0 && !preferGoogle) {
    const googleQuotes = await fetchGoogleFinanceQuotes(withUsGoogleSymbols(US_HEATMAP_STOCKS), reportDate)
    fetchedCount = googleQuotes.fetchedCount
    quotes = googleQuotes.quotes
  }
  if (fetchedCount === 0) throw new Error('Yahoo Finance returned 0 US stock quotes')

  return {
    buffer: await screenshotHtml({
      height: 900,
      html: buildUsStockHeatmapHtml({ fetchedCount, quotes, reportDate }),
      selector: '.sheet',
      width: 1280,
    }),
    filename: `us-stock-heatmap-${reportDate}.png`,
  }
}

export const captureUsStockHeatmapScreenshot = async (reportDate: string): Promise<ScreenshotResult> => {
  const mode = String(process.env.US_STOCK_HEATMAP_MODE || 'auto').toLowerCase()

  if (mode === 'generated') return renderGeneratedUsStockHeatmapScreenshot(reportDate)

  try {
    return await captureFinvizUsStockHeatmapScreenshot(reportDate)
  } catch (error) {
    if (mode === 'auto') return renderGeneratedUsStockHeatmapScreenshot(reportDate)

    throw error
  }
}

export const renderGlobalStockCloseImage = async (reportDate: string): Promise<ScreenshotResult> => {
  const { fetchedCount: yahooFetchedCount, quotes: yahooQuotes } = await fetchQuotes(GLOBAL_INDEXES, {
    completedOnlyForTarget: (target) => target.region !== '亞洲',
    maxAttempts: 1,
    parallel: true,
  })
  let fetchedCount = yahooFetchedCount
  let quotes = yahooQuotes
  let sourceName = 'Yahoo Finance'
  const title = '全球主要市場行情'

  if (fetchedCount === 0) {
    const googleQuotes = await fetchGoogleFinanceQuotes(GLOBAL_INDEXES, reportDate)
    fetchedCount = googleQuotes.fetchedCount
    quotes = googleQuotes.quotes
    sourceName = 'Google Finance'
  }

  if (fetchedCount === 0) throw new Error('Yahoo Finance and Google Finance returned 0 dated global market quotes')

  const twseQuote = (await fetchTwseRealtimeQuote(reportDate)) || (await fetchTwseCloseQuote(reportDate))
  if (twseQuote) {
    const taiwanIndex = quotes.findIndex((quote) => quote.symbol === '^TWII')
    if (taiwanIndex >= 0) {
      if (quotes[taiwanIndex].close === null) fetchedCount += 1
      quotes[taiwanIndex] = twseQuote
      sourceName = `${sourceName}、臺灣證券交易所`
    }
  }

  return {
    buffer: await screenshotHtml({
      height: 1180,
      html: buildGlobalStockCloseHtml({ fetchedCount, quotes, reportDate, sourceName, title }),
      selector: '.sheet',
      width: 1080,
    }),
    filename: `global-stock-close-${reportDate}.png`,
  }
}
