import sharp from 'sharp'

type ScreenshotResult = {
  buffer: Buffer
  filename: string
}

type CoinGeckoMarketCoin = {
  current_price?: number | null
  id: string
  market_cap?: number | null
  name: string
  price_change_percentage_24h: number | null
  symbol: string
  total_volume: number | null
}

const SCREENSHOT_VIEWPORT = {
  height: 900,
  width: 1280,
}

const chromiumLaunchOptions = () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim()
  const options = {
    args: ['--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=swiftshader'],
    headless: true,
  }

  return executablePath
    ? {
        ...options,
        executablePath,
      }
    : options
}

const waitForPageToSettle = async (page: import('playwright-chromium').Page) => {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3500)
}

const getEnvValue = (key: string) => {
  const value = process.env[key]?.trim()

  return value || undefined
}

const fetchBuffer = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      Referer: 'https://newspaper.ctee.com.tw/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
  })

  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`)

  return Buffer.from(await response.arrayBuffer())
}

const escapeXml = (value: string) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

const formatUsdVolume = (value: number) => {
  if (value >= 100_000_000) return `$${(value / 100_000_000).toFixed(value >= 10_000_000_000 ? 0 : 2)}億`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 100_000_000 ? 0 : 1)}M`

  return `$${Math.round(value).toLocaleString('en-US')}`
}

const fetchCoinGeckoVolumeLeaders = async () => {
  const url = new URL('https://api.coingecko.com/api/v3/coins/markets')
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('order', 'volume_desc')
  url.searchParams.set('per_page', '100')
  url.searchParams.set('page', '1')
  url.searchParams.set('sparkline', 'false')
  url.searchParams.set('price_change_percentage', '24h')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
  })

  if (!response.ok) throw new Error(`CoinGecko market API failed: ${response.status}`)

  return (await response.json()) as CoinGeckoMarketCoin[]
}

const fetchCoinGeckoMarketCapLeaders = async () => {
  const url = new URL('https://api.coingecko.com/api/v3/coins/markets')
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('order', 'market_cap_desc')
  url.searchParams.set('per_page', '100')
  url.searchParams.set('page', '1')
  url.searchParams.set('sparkline', 'false')
  url.searchParams.set('price_change_percentage', '24h')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
  })
  if (!response.ok) throw new Error(`CoinGecko market API failed: ${response.status}`)

  return (await response.json()) as CoinGeckoMarketCoin[]
}

const captureCryptobubblesVolumeFallback = async (
  reportDate: string,
  metric: 'marketCap' | 'volume' = 'volume',
): Promise<ScreenshotResult> => {
  const valueOf = (coin: CoinGeckoMarketCoin) =>
    metric === 'marketCap' ? coin.market_cap || 0 : coin.total_volume || 0
  const coins = (metric === 'marketCap' ? await fetchCoinGeckoMarketCapLeaders() : await fetchCoinGeckoVolumeLeaders())
    .filter((coin) => Number.isFinite(valueOf(coin)) && valueOf(coin) > 0)
    .slice(0, 100)
  const width = SCREENSHOT_VIEWPORT.width
  const height = SCREENSHOT_VIEWPORT.height
  const top = 92
  const bottom = 34
  const maxValue = Math.max(...coins.map(valueOf), 1)
  let placed: { coin: CoinGeckoMarketCoin; radius: number; x: number; y: number }[] = []

  for (let scale = 1; scale >= 0.42 && placed.length !== coins.length; scale -= 0.04) {
    const attempt: typeof placed = []

    for (const [index, coin] of coins.entries()) {
      const value = valueOf(coin)
      const radius = Math.max(10, Math.min(112, (15 + Math.sqrt(value / maxValue) * 97) * scale))
      let selected: { x: number; y: number } | null = null

      for (let step = 0; step < 6000; step += 1) {
        const angle = step * 0.48 + index * 0.73
        const distance = 3.8 * Math.sqrt(step)
        const x = width / 2 + Math.cos(angle) * distance
        const y = (top + height - bottom) / 2 + Math.sin(angle) * distance

        if (x < radius + 12 || x > width - radius - 12 || y < top + radius || y > height - bottom - radius) continue
        if (attempt.every((bubble) => Math.hypot(bubble.x - x, bubble.y - y) >= bubble.radius + radius + 3)) {
          selected = { x, y }
          break
        }
      }

      if (!selected) break
      attempt.push({ coin, radius, ...selected })
    }

    if (attempt.length > placed.length) placed = attempt
  }

  if (placed.length < Math.min(60, coins.length)) {
    throw new Error(`CoinGecko fallback could only place ${placed.length}/${coins.length} bubbles without overlap`)
  }

  const bounds = placed.reduce(
    (result, bubble) => ({
      bottom: Math.max(result.bottom, bubble.y + bubble.radius),
      left: Math.min(result.left, bubble.x - bubble.radius),
      right: Math.max(result.right, bubble.x + bubble.radius),
      top: Math.min(result.top, bubble.y - bubble.radius),
    }),
    { bottom: 0, left: width, right: 0, top: height },
  )
  const availableWidth = width - 32
  const availableHeight = height - top - bottom - 12
  const layoutScale = Math.min(
    availableWidth / Math.max(1, bounds.right - bounds.left),
    availableHeight / Math.max(1, bounds.bottom - bounds.top),
  )
  const scaledWidth = (bounds.right - bounds.left) * layoutScale
  const scaledHeight = (bounds.bottom - bounds.top) * layoutScale
  placed = placed.map((bubble) => ({
    ...bubble,
    radius: bubble.radius * layoutScale,
    x: (width - scaledWidth) / 2 + (bubble.x - bounds.left) * layoutScale,
    y: top + (availableHeight - scaledHeight) / 2 + (bubble.y - bounds.top) * layoutScale,
  }))

  const bubbles = placed
    .map(({ coin, radius, x, y }) => {
      const change = coin.price_change_percentage_24h || 0
      const positive = change >= 0
      const accent = positive ? '#18d46b' : '#ff5f6d'
      const shadow = positive ? '#0b5f38' : '#79313b'
      const symbol = escapeXml(coin.symbol.toUpperCase())
      const metricValue = escapeXml(formatUsdVolume(valueOf(coin)))
      const changeText = `${positive ? '+' : ''}${change.toFixed(2)}%`
      const symbolSize = Math.max(7, Math.min(38, radius * 0.36))
      const volumeSize = Math.max(8, Math.min(25, radius * 0.2))
      const details =
        radius >= 20
          ? `<text x="${x}" y="${y + radius * 0.27}" text-anchor="middle" font-size="${volumeSize}" font-weight="700" fill="#ffffff">${metricValue}</text>
             <text x="${x}" y="${y + radius * 0.52}" text-anchor="middle" font-size="${Math.max(7, volumeSize * 0.78)}" fill="${accent}">${escapeXml(changeText)}</text>`
          : ''

      return `
        <g>
          <circle cx="${x}" cy="${y}" r="${radius}" fill="url(#bubble)" stroke="${accent}" stroke-width="${Math.max(2, radius * 0.035)}"/>
          <circle cx="${x - radius * 0.28}" cy="${y - radius * 0.3}" r="${radius * 0.22}" fill="rgba(255,255,255,0.26)"/>
          <text x="${x}" y="${y - (radius >= 20 ? radius * 0.04 : -symbolSize * 0.34)}" text-anchor="middle" font-size="${symbolSize}" font-weight="800" fill="#ffffff">${symbol}</text>
          ${details}
          <circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="${shadow}" stroke-width="${Math.max(1, radius * 0.018)}" opacity="0.65"/>
        </g>`
    })
    .join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <radialGradient id="bubble" cx="36%" cy="26%" r="72%">
          <stop offset="0%" stop-color="#6f767b"/>
          <stop offset="42%" stop-color="#25292c"/>
          <stop offset="100%" stop-color="#070808"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#101010"/>
      <rect x="0" y="0" width="100%" height="58" fill="#171717"/>
      <circle cx="26" cy="29" r="11" fill="#58c83b"/>
      <circle cx="41" cy="22" r="8" fill="#7ed733"/>
      <circle cx="43" cy="39" r="7" fill="#84d935"/>
      <circle cx="25" cy="43" r="6" fill="#dc2f37"/>
      <text x="62" y="37" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800" fill="#ffffff">CRYPTO BUBBLES</text>
      <text x="${width - 28}" y="36" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#ff626c" text-anchor="end">Day · ${metric === 'marketCap' ? 'Market Cap' : '24h Volume'} · 1-100</text>
      <text x="22" y="80" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="#45b56c">Size/content: ${metric === 'marketCap' ? 'Market Cap' : '24h Volume'} · color: performance · ${escapeXml(reportDate)}</text>
      ${bubbles}
      <text x="${width - 24}" y="${height - 16}" font-family="Inter, Arial, sans-serif" font-size="12" fill="#808080" text-anchor="end">Data: CoinGecko · fallback renderer</text>
    </svg>`

  return {
    buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
    filename: metric === 'marketCap' ? `coin360-${reportDate}.png` : `cryptobubbles-volume-${reportDate}.png`,
  }
}

const assertUsefulScreenshot = async ({
  buffer,
  label,
  minBytes = 50000,
  minMeanRgb = 25,
  minStdevRgb = 3,
}: {
  buffer: Buffer
  label: string
  minBytes?: number
  minMeanRgb?: number
  minStdevRgb?: number
}) => {
  const stats = await sharp(buffer).stats()
  const meanRgb =
    stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / Math.min(stats.channels.length, 3)
  const stdevRgb =
    stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / Math.min(stats.channels.length, 3)

  if (buffer.length < minBytes || meanRgb < minMeanRgb || stdevRgb < minStdevRgb) {
    throw new Error(
      `${label} screenshot looks blank: ${buffer.length} bytes, mean RGB ${Math.round(meanRgb)}, RGB stdev ${Math.round(stdevRgb)}.`,
    )
  }
}

const configureCryptobubblesView = async (
  page: import('playwright-chromium').Page,
  mode: 'marketCap' | 'volume',
) => {
  await page.addInitScript((captureMode) => {
    const settings = JSON.parse(localStorage.getItem('settings') || '{}')
    const configurationId = 'daily-report-capture'
    const configurations = Array.isArray(settings.configurations2)
      ? settings.configurations2.filter((configuration: { id?: string }) => configuration.id !== configurationId)
      : []

    settings.baseCurrency = 'usd'
    settings.configurationId2 = configurationId
    settings.configurations2 = [
      {
        color: 'performance',
        content: captureMode === 'marketCap' ? 'performance' : 'volume',
        id: configurationId,
        name: captureMode === 'marketCap' ? 'MC' : 'Vol',
        period: 'day',
        size: captureMode === 'marketCap' ? 'marketcap' : 'volume',
      },
      ...configurations,
    ]
    settings.currencyFilter = {
      from: 1,
      to: 100,
      type: 'slice',
    }
    localStorage.setItem('settings', JSON.stringify(settings))
  }, mode)
}

const cryptobubblesCaptureUrl = (reportDate: string) =>
  `https://cryptobubbles.net/en?daily-report=${encodeURIComponent(reportDate)}`

export const captureCryptobubblesMcScreenshot = async (reportDate: string): Promise<ScreenshotResult> => {
  if (process.env.CRYPTOBUBBLES_FORCE_FALLBACK === '1') {
    return captureCryptobubblesVolumeFallback(reportDate)
  }

  const { chromium } = await import('playwright-chromium')
  const browser = await chromium.launch(chromiumLaunchOptions())

  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: SCREENSHOT_VIEWPORT,
    })

    await configureCryptobubblesView(page, 'volume')
    await page.goto(cryptobubblesCaptureUrl(reportDate), {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    })
    await waitForPageToSettle(page)

    let buffer: Buffer | null = null
    let lastError: unknown
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      buffer = await page.screenshot({
        animations: 'disabled',
        fullPage: false,
        type: 'png',
      })

      try {
        await assertUsefulScreenshot({
          buffer,
          label: 'Cryptobubbles',
        })
        break
      } catch (error) {
        lastError = error
        if (attempt === 3) await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await page.waitForTimeout(2500)
      }
    }

    if (!buffer) throw new Error('Cryptobubbles screenshot was not captured.')
    try {
      await assertUsefulScreenshot({
        buffer,
        label: 'Cryptobubbles',
      })
    } catch (error) {
      console.warn(lastError || error)

      return captureCryptobubblesVolumeFallback(reportDate)
    }

    return {
      buffer,
      filename: `cryptobubbles-volume-${reportDate}.png`,
    }
  } finally {
    await browser.close()
  }
}

export const captureCoin360Screenshot = async (reportDate: string): Promise<ScreenshotResult> => {
  const { chromium } = await import('playwright-chromium')
  const browser = await chromium.launch(chromiumLaunchOptions())

  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: SCREENSHOT_VIEWPORT,
    })

    await page.goto(`https://coin360.com/?daily-report=${encodeURIComponent(reportDate)}`, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    })
    await waitForPageToSettle(page)
    // Coin360 currently injects a full-page promotional dialog above the
    // heatmap. An element screenshot includes that overlay, so remove only
    // dialogs before capturing the underlying chart.
    await page.locator('[role="dialog"]').evaluateAll((dialogs) => dialogs.forEach((dialog) => dialog.remove()))
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
    const canvasIndex = await page.locator('canvas').evaluateAll((canvases) => {
      const candidates = canvases.map((canvas, index) => {
        const box = canvas.getBoundingClientRect()

        return { area: box.width * box.height, index }
      })

      return candidates.sort((a, b) => b.area - a.area)[0]?.index ?? -1
    })
    if (canvasIndex < 0) throw new Error('Coin360 did not render a heatmap canvas')
    const heatmapCanvas = page.locator('canvas').nth(canvasIndex)
    const box = await heatmapCanvas.boundingBox()
    if (!box || box.width < 700 || box.height < 500) {
      throw new Error(`Coin360 heatmap canvas has invalid dimensions: ${box?.width || 0}x${box?.height || 0}`)
    }
    await page.waitForTimeout(3500)
    const buffer = await heatmapCanvas.screenshot({ animations: 'disabled', type: 'png' })
    await assertUsefulScreenshot({ buffer, label: 'Coin360' })

    return { buffer, filename: `coin360-${reportDate}.png` }
  } finally {
    await browser.close()
  }
}

type CteeNewspaperImage = ScreenshotResult & {
  pageCode: string
  sourceUrl: string
}

const CTEE_DEFAULT_PAGE_CODES = ['A1', 'A2', 'A3']

const cteePageCodes = () => {
  return (process.env.CTEE_NEWSPAPER_PAGE_CODES || CTEE_DEFAULT_PAGE_CODES.join(','))
    .split(',')
    .map((pageCode) => pageCode.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 3)
}

const normalizeCteePageCode = (pageCode: string) => {
  const pageNumber = Number(pageCode.match(/\d+/)?.[0] || 0)

  return pageNumber > 0 ? `A${pageNumber}` : pageCode.toUpperCase()
}

const cteePageCodeCandidates = (pageCode: string) => {
  const normalized = normalizeCteePageCode(pageCode)
  const pageNumber = Number(normalized.match(/\d+/)?.[0] || 0)

  if (!pageNumber) return [normalized]

  return [normalized, `A${String(pageNumber).padStart(2, '0')}`]
}

const cteeImageMatchesPageCode = (url: string, pageCode: string) => {
  const pathname = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return url
    }
  })()
  const haystack = decodeURIComponent(pathname).toUpperCase()
  const pageNumber = Number(pageCode.match(/\d+/)?.[0] || 0)

  return cteePageCodeCandidates(pageCode).some((candidate) => {
    if (new RegExp(`(?:^|[/_.-])${candidate}(?:[/_.-]|\\d{5}|$)`, 'i').test(haystack)) return true
    if (!pageNumber) return false

    return new RegExp(`A0?${pageNumber}(?:[^0-9]|$)`, 'i').test(haystack)
  })
}

const getCteeImagePageNumber = (url: string) => {
  const pathname = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return url
    }
  })()
  const match = decodeURIComponent(pathname).toUpperCase().match(/(?:^|[/_.-])CM_A0?(\d+)A__/)

  return match ? Number(match[1]) : null
}

const normalizeUrlKey = (url: string) => {
  try {
    const parsed = new URL(url)

    return `${parsed.hostname}${parsed.pathname}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

const getCteeImageUrlsFromHtml = (html: string, baseUrl: string) => {
  const urls = new Set<string>()
  const pattern = /(?:src|href)=["']([^"']*CM_A\d+A__[^"']+\.(?:jpg|jpeg|png)(?:\?[^"']*)?)["']/gi
  let match = pattern.exec(html)

  while (match) {
    urls.add(new URL(match[1], baseUrl).toString())
    match = pattern.exec(html)
  }

  return [...urls]
}

const matchCteeImageUrls = (imageUrls: string[], requestedPageCodes: string[]) => {
  const usedUrls = new Set<string>()

  return requestedPageCodes
    .map((pageCode) => {
      const normalizedPageCode = normalizeCteePageCode(pageCode)
      const requestedPageNumber = Number(normalizedPageCode.match(/\d+/)?.[0] || 0)
      const matchedUrl = imageUrls.find((url) => {
        const sourceUrl = normalizeUrlKey(url)

        if (usedUrls.has(sourceUrl)) return false

        const imagePageNumber = getCteeImagePageNumber(url)
        if (requestedPageNumber && imagePageNumber === requestedPageNumber) return true

        return cteeImageMatchesPageCode(url, normalizedPageCode)
      })

      if (matchedUrl) usedUrls.add(normalizeUrlKey(matchedUrl))

      return matchedUrl
        ? {
            pageCode: normalizedPageCode,
            sourceUrl: matchedUrl,
          }
        : null
    })
    .filter((item): item is { pageCode: string; sourceUrl: string } => Boolean(item))
}

const fetchCteeNewspaperImagesFromHtml = async ({
  reportDate,
  requestedPageCodes,
  sourceUrl,
}: {
  reportDate: string
  requestedPageCodes: string[]
  sourceUrl: string
}) => {
  const htmlResponse = await fetch(sourceUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
  })

  if (!htmlResponse.ok) throw new Error(`CTEE newspaper page failed: ${htmlResponse.status}`)

  const html = await htmlResponse.text()
  const matchedImages = matchCteeImageUrls(getCteeImageUrlsFromHtml(html, sourceUrl), requestedPageCodes)

  if (matchedImages.length < requestedPageCodes.length) {
    throw new Error(`CTEE HTML only matched ${matchedImages.length}/${requestedPageCodes.length} page images.`)
  }

  const results: CteeNewspaperImage[] = []
  for (const matchedImage of matchedImages) {
    results.push({
      buffer: await fetchBuffer(matchedImage.sourceUrl),
      filename: `ctee-newspaper-${matchedImage.pageCode.toLowerCase()}-${reportDate}.jpg`,
      pageCode: matchedImage.pageCode,
      sourceUrl: matchedImage.sourceUrl,
    })
  }

  return results
}

export const captureCteeNewspaperImages = async (reportDate: string): Promise<CteeNewspaperImage[]> => {
  const sourceUrl = getEnvValue('CTEE_NEWSPAPER_URL') || 'https://newspaper.ctee.com.tw/'
  const requestedPageCodes = cteePageCodes()

  try {
    return await fetchCteeNewspaperImagesFromHtml({
      reportDate,
      requestedPageCodes,
      sourceUrl,
    })
  } catch (error) {
    console.warn(error)
  }

  const { chromium } = await import('playwright-chromium')
  const browser = await chromium.launch(chromiumLaunchOptions())

  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: SCREENSHOT_VIEWPORT,
    })

    await page.goto(sourceUrl, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    })
    await waitForPageToSettle(page)

    const imageUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href], img[src]'))
        .map((element) => {
          const href = element instanceof HTMLAnchorElement ? element.href : ''
          const src = element instanceof HTMLImageElement ? element.src : ''
          return href || src
        })
        .filter((url) => /\.(png|jpe?g)(\?|$)/i.test(url))
    })
    const matchedImages = matchCteeImageUrls(imageUrls, requestedPageCodes)

    if (matchedImages.length) {
      const context = page.context()
      const results: CteeNewspaperImage[] = []
      for (const matchedImage of matchedImages) {
        const response = await context.request.get(matchedImage.sourceUrl, {
          timeout: 60000,
        })
        if (!response.ok()) throw new Error(`CTEE image ${matchedImage.pageCode} failed: ${response.status()}`)
        results.push({
          buffer: await response.body(),
          filename: `ctee-newspaper-${matchedImage.pageCode.toLowerCase()}-${reportDate}.jpg`,
          pageCode: matchedImage.pageCode,
          sourceUrl: matchedImage.sourceUrl,
        })
      }
      if (results.length >= requestedPageCodes.length) return results
    }

    return [{
      buffer: await page.screenshot({
        animations: 'disabled',
        clip: {
          height: 785,
          width: 555,
          x: 705,
          y: 115,
        },
        type: 'png',
      }),
      filename: `ctee-newspaper-a1-${reportDate}.png`,
      pageCode: 'A1',
      sourceUrl,
    }]
  } finally {
    await browser.close()
  }
}

export const captureCteeNewspaperScreenshot = async (reportDate: string): Promise<ScreenshotResult> => {
  const [firstImage] = await captureCteeNewspaperImages(reportDate)
  return firstImage
}
