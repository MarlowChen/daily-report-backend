import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'

type EconomicDailyImage = {
  buffer: Buffer
  filename: string
  pageCode: string
  sourceUrl: string
}

const DEFAULT_IMAGE_URL_TEMPLATE =
  'https://un.udndata.com/publicPlay/ED/ED{yyyy}/{mm}/{dd}/{page}_{pageSerial}.JPG'
const MAX_REDIRECTS = 5
const DEFAULT_PAGE_CODES = ['A01', 'A02', 'A03']

type DownloadedImage = {
  buffer: Buffer
  contentType: string
}

type EconomicDailyHttpResponse = {
  body: () => Promise<Buffer>
  headers: () => Record<string, string>
  status: () => number
  url: () => string
}

type CapturedEconomicDailyImage = {
  buffer: Buffer
  sourceUrl: string
}

const captureEconomicDailyImageFromRenderedPage = async (
  page: import('playwright-chromium').Page,
  pageCode: string,
): Promise<CapturedEconomicDailyImage | null> => {
  const pageUrl = page.url()
  const pageHost = new URL(pageUrl).hostname
  const candidates = await page.evaluate(() => {
    const values = new Set<string>()
    const attributes = ['href', 'src', 'data-src', 'data-original', 'data-image', 'data-url']
    for (const element of Array.from(document.querySelectorAll('*'))) {
      for (const attribute of attributes) {
        const value = element.getAttribute(attribute)
        if (value) values.add(value)
      }
      const backgroundImage = getComputedStyle(element).backgroundImage
      const match = backgroundImage.match(/url\(["']?([^"')]+)["']?\)/i)
      if (match?.[1]) values.add(match[1])
    }
    for (const entry of performance.getEntriesByType('resource')) values.add(entry.name)
    return [...values]
  })
  const expectedName = expectedEconomicDailyImageName(pageCode).toUpperCase()
  const resolvedCandidates = candidates
    .map((candidate) => {
      try {
        return new URL(candidate, pageUrl).toString()
      } catch {
        return ''
      }
    })
    .filter((candidate) => {
      if (!candidate.startsWith('http')) return false
      const host = new URL(candidate).hostname
      return host === pageHost || host.includes('udndata') || host.endsWith('nlpi.edu.tw')
    })
    .sort(
      (left, right) =>
        Number(decodeURIComponent(right).toUpperCase().includes(expectedName)) -
        Number(decodeURIComponent(left).toUpperCase().includes(expectedName)),
    )
    .slice(0, 80)

  for (const candidate of resolvedCandidates) {
    try {
      const response = await page.request.get(candidate, {
        headers: { referer: pageUrl },
        timeout: 15000,
      })
      if (
        !response.ok() ||
        !(response.headers()['content-type'] || '').toLowerCase().includes('image')
      )
        continue
      const buffer = await response.body()
      await validateEconomicDailyImage(buffer, pageCode)
      return { buffer, sourceUrl: response.url() }
    } catch {
      continue
    }
  }

  const canvasDataUrls = await page.locator('canvas').evaluateAll((elements) =>
    (elements as HTMLCanvasElement[])
      .filter((canvas) => canvas.width >= 500 && canvas.height >= 800)
      .sort((left, right) => right.width * right.height - left.width * left.height)
      .slice(0, 3)
      .map((canvas) => {
        try {
          return canvas.toDataURL('image/jpeg', 0.95)
        } catch {
          return ''
        }
      }),
  )
  for (const dataUrl of canvasDataUrls) {
    if (!dataUrl.startsWith('data:image/')) continue
    try {
      const buffer = Buffer.from(dataUrl.split(',')[1] || '', 'base64')
      await validateEconomicDailyImage(buffer, pageCode)
      return { buffer, sourceUrl: `${pageUrl}#canvas-${pageCode}` }
    } catch {
      continue
    }
  }

  const visibleImages = page.locator('img:visible')
  const imageCount = await visibleImages.count()
  const rankedImages: Array<{ area: number; index: number }> = []
  for (let index = 0; index < imageCount; index += 1) {
    const dimensions = await visibleImages
      .nth(index)
      .evaluate((element) => ({
        height:
          (element as HTMLImageElement).naturalHeight || element.getBoundingClientRect().height,
        width: (element as HTMLImageElement).naturalWidth || element.getBoundingClientRect().width,
      }))
      .catch(() => ({ height: 0, width: 0 }))
    rankedImages.push({ area: dimensions.width * dimensions.height, index })
  }
  for (const { index } of rankedImages.sort((left, right) => right.area - left.area).slice(0, 5)) {
    try {
      const buffer = await visibleImages
        .nth(index)
        .screenshot({ animations: 'disabled', type: 'jpeg' })
      await validateEconomicDailyImage(buffer, pageCode)
      return { buffer, sourceUrl: `${pageUrl}#rendered-image-${pageCode}` }
    } catch {
      continue
    }
  }

  return null
}

const validateEconomicDailyImage = async (buffer: Buffer, pageCode: string) => {
  const { default: sharp } = await import('sharp')
  const image = sharp(buffer)
  const [metadata, stats] = await Promise.all([image.metadata(), image.stats()])
  const width = metadata.width || 0
  const height = metadata.height || 0
  if (width < 500 || height < 800) {
    throw new Error(`Economic Daily ${pageCode} returned a thumbnail (${width}x${height})`)
  }

  const visibleChannels = stats.channels.slice(0, 3)
  if (visibleChannels.every((channel) => channel.mean < 5 || channel.stdev < 1)) {
    throw new Error(`Economic Daily ${pageCode} returned a blank or black image`)
  }
}

const pageCodes = () => {
  return (process.env.ECONOMIC_DAILY_PAGE_CODES || DEFAULT_PAGE_CODES.join(','))
    .split(',')
    .map((pageCode) => pageCode.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 3)
}

const buildEconomicDailyUrl = (template: string, reportDate: string, pageCode = 'A01') => {
  const [yyyy, mm, dd] = reportDate.split('-')
  const m = String(Number(mm))
  const d = String(Number(dd))
  const pageNumber = Number(pageCode.match(/\d+/)?.[0] || 1)
  const pageNo = String(pageNumber)
  const pageNo2 = pageNo.padStart(2, '0')
  const pageSerial = String(20000 + pageNumber * 100)

  return template
    .replaceAll('{yyyy}', yyyy)
    .replaceAll('{mm}', mm)
    .replaceAll('{m}', m)
    .replaceAll('{dd}', dd)
    .replaceAll('{d}', d)
    .replaceAll('{page}', pageCode)
    .replaceAll('{pageNo}', pageNo)
    .replaceAll('{pageNo2}', pageNo2)
    .replaceAll('{pageSerial}', pageSerial)
    .replaceAll('{serial}', pageSerial)
}

const expectedEconomicDailyImageName = (pageCode: string) => {
  const pageNumber = Number(pageCode.match(/\d+/)?.[0] || 1)
  const normalizedPageCode = `A${String(pageNumber).padStart(2, '0')}`
  const pageSerial = String(20000 + pageNumber * 100)

  return `${normalizedPageCode}_${pageSerial}.JPG`
}

export const selectEconomicDailyImageUrl = ({
  baseUrl,
  candidates,
  pageCode,
}: {
  baseUrl: string
  candidates: string[]
  pageCode: string
}) => {
  const expectedImageName = expectedEconomicDailyImageName(pageCode).toUpperCase()

  for (const candidate of candidates) {
    if (!candidate) continue

    try {
      const url = new URL(candidate, baseUrl)
      const decodedUrl = decodeURIComponent(`${url.pathname}${url.search}`).toUpperCase()
      if (decodedUrl.includes(expectedImageName)) return url.toString()
    } catch {
      continue
    }
  }

  return null
}

export const toEconomicDailyFullImageUrl = (imageUrl: string) => {
  const url = new URL(imageUrl)

  if (url.hostname === 'ed.udndata.com' && url.pathname.endsWith('/testShowFullpage.jsp')) {
    const location = url.searchParams.get('FPLOCATION')
    if (!location) return imageUrl

    return new URL(location.replace(/^\/+/, ''), 'https://ed.udndata.com/').toString()
  }

  return imageUrl
}

const continuePastOnlineLimit = async (page: import('playwright-chromium').Page) => {
  const continueButton = page.getByText('立即登入', { exact: true }).last()
  if (!(await continueButton.isVisible({ timeout: 2000 }).catch(() => false))) return false

  await continueButton.click({ noWaitAfter: true })
  await continueButton.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined)
  await page.waitForTimeout(1000)
  return true
}

export const isExpectedEconomicDailyFullImageResponse = ({
  contentType,
  pageCode,
  responseUrl,
  status,
}: {
  contentType: string
  pageCode: string
  responseUrl: string
  status: number
}) => {
  const decodedUrl = decodeURIComponent(responseUrl).toUpperCase()
  return (
    status >= 200 &&
    status < 300 &&
    contentType.toLowerCase().includes('image') &&
    decodedUrl.includes('/FULLPAGE/TESTSHOWFULLPAGE.JSP') &&
    decodedUrl.includes('PIC=BIG') &&
    decodedUrl.includes(expectedEconomicDailyImageName(pageCode).toUpperCase())
  )
}

export const buildAuthorizedEconomicDailyImageUrl = ({
  authorizationSuffix,
  fplocation,
}: {
  authorizationSuffix: string
  fplocation: string
}) => {
  const url = new URL('https://ed.udndata.com/fullpage/testShowFullpage.jsp')
  url.searchParams.set('paperID', 'ED')
  url.searchParams.set('pic', 'big')
  url.searchParams.set('FPLOCATION', fplocation)
  url.searchParams.set('type', '')
  const suffix = authorizationSuffix.trim()
  if (!/^&jsessionid=[^&]+&hostname_port=[^&]+$/i.test(suffix)) {
    throw new Error(
      `Economic Daily returned an invalid image authorization token: ${suffix.slice(0, 80)}`,
    )
  }
  return `${url.toString()}${suffix}`
}

export const getEconomicDailyImageUrl = (reportDate: string, pageCode = 'A01') => {
  return buildEconomicDailyUrl(
    process.env.ECONOMIC_DAILY_IMAGE_URL_TEMPLATE || DEFAULT_IMAGE_URL_TEMPLATE,
    reportDate,
    pageCode,
  )
}

const downloadImageWithNode = (
  sourceUrl: string,
  redirectsLeft = MAX_REDIRECTS,
): Promise<DownloadedImage> => {
  return new Promise((resolve, reject) => {
    const url = new URL(sourceUrl)
    const get = url.protocol === 'http:' ? httpGet : httpsGet
    const request = get(
      url,
      {
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          referer: 'https://udndata.com/',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        },
        rejectUnauthorized: false,
      },
      (response) => {
        const statusCode = response.statusCode || 0
        const location = response.headers.location

        if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectsLeft > 0) {
          response.resume()
          resolve(downloadImageWithNode(new URL(location, sourceUrl).toString(), redirectsLeft - 1))
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(
            new Error(
              `Economic Daily image failed: ${statusCode} ${response.statusMessage || ''}`.trim(),
            ),
          )
          return
        }

        const chunks: Buffer[] = []
        response.on('data', (chunk) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        )
        response.on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: String(response.headers['content-type'] || ''),
          })
        })
      },
    )

    request.on('error', reject)
    request.setTimeout(60000, () => {
      request.destroy(new Error('Economic Daily image request timed out'))
    })
  })
}

const downloadImage = async (sourceUrl: string): Promise<DownloadedImage> => {
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        referer: 'https://udndata.com/',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      },
      next: {
        revalidate: 0,
      },
    })

    if (!response.ok) {
      throw new Error(`Economic Daily image failed: ${response.status} ${response.statusText}`)
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || '',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const cause = error instanceof Error && 'cause' in error ? String(error.cause) : ''
    const certificateMessage = `${message} ${cause}`

    if (
      !certificateMessage.includes('certificate') &&
      !certificateMessage.includes('UNABLE_TO_VERIFY')
    ) {
      throw error
    }

    return downloadImageWithNode(sourceUrl)
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const PUBLIC_IMAGE_ATTEMPTS = 4

type NlpiLoginResponse = {
  data?: {
    result?: {
      success?: boolean
    }
  }
}

export const isSuccessfulNlpiLoginResponse = (body: unknown) => {
  return (body as NlpiLoginResponse)?.data?.result?.success === true
}

const loginToNlpi = async (page: import('playwright-chromium').Page, loginUrl: string) => {
  // Existing deployments store the NLPI account for this database under the
  // resource-specific variables. Generic NLPI credentials remain a fallback.
  const username = process.env.ECONOMIC_DAILY_USERNAME || process.env.NLPI_LIBRARY_USERNAME
  const password = process.env.ECONOMIC_DAILY_PASSWORD || process.env.NLPI_LIBRARY_PASSWORD
  if (!username || !password) {
    throw new Error(
      'NLPI authentication is required before opening Economic Daily. Set ECONOMIC_DAILY_USERNAME and ECONOMIC_DAILY_PASSWORD.',
    )
  }

  const nlpiOrigin = new URL(loginUrl).origin
  await page.goto(`${nlpiOrigin}/`, {
    timeout: 60000,
    waitUntil: 'domcontentloaded',
  })
  const loginButton = page.locator('button.btn_login').first()
  await loginButton.waitFor({ state: 'attached', timeout: 30000 })
  // NLPI renders one responsive login trigger which Playwright can consider
  // hidden even though its React handler is active.
  await loginButton.evaluate((button) => (button as HTMLButtonElement).click())

  const loginForm = page
    .locator('form:visible')
    .filter({
      has: page.locator('input[name="username"]'),
    })
    .first()
  const accountInput = loginForm.locator('input[name="username"]')
  const passwordInput = loginForm.locator('input[name="password"]')
  const submitButton = loginForm.locator('input[type="submit"][value*="登入"]')
  await accountInput.waitFor({ state: 'visible', timeout: 30000 })
  await accountInput.fill(username)
  await passwordInput.fill(password)

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/jumperrwdWs/graphql') &&
      response.request().method() === 'POST' &&
      (response.request().postData() || '').includes('setLogin'),
    { timeout: 30000 },
  )
  await submitButton.click({ noWaitAfter: true })
  const loginResponse = await loginResponsePromise
  const loginBody = await loginResponse.json().catch(() => null)
  if (!isSuccessfulNlpiLoginResponse(loginBody)) {
    throw new Error(
      'NLPI library login was rejected. Update ECONOMIC_DAILY_USERNAME/ECONOMIC_DAILY_PASSWORD or confirm that the library account is active.',
    )
  }

  await page.goto(loginUrl, {
    timeout: 60000,
    waitUntil: 'domcontentloaded',
  })
}

const fetchEconomicDailyPublicImage = async (
  reportDate: string,
  pageCode: string,
): Promise<EconomicDailyImage> => {
  const sourceUrl = getEconomicDailyImageUrl(reportDate, pageCode)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= PUBLIC_IMAGE_ATTEMPTS; attempt += 1) {
    try {
      const image = await downloadImage(sourceUrl)
      const contentType = image.contentType
      if (!contentType.includes('image')) {
        throw new Error(
          `Economic Daily URL did not return an image: ${contentType || 'unknown content type'}`,
        )
      }
      await validateEconomicDailyImage(image.buffer, pageCode)

      return {
        buffer: image.buffer,
        filename: `economic-daily-${pageCode.toLowerCase()}-${reportDate}.jpg`,
        pageCode,
        sourceUrl,
      }
    } catch (error) {
      lastError = error
      if (/403|forbidden/i.test(error instanceof Error ? error.message : String(error))) break
      if (attempt < PUBLIC_IMAGE_ATTEMPTS) {
        await sleep(2000 * attempt)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

const fetchEconomicDailyImagesFromAuthenticatedPdf = async (
  reportDate: string,
  requestedPageCodes: string[],
): Promise<EconomicDailyImage[]> => {
  const { chromium } = await import('playwright-chromium')
  const browser = await chromium.launch({
    headless: true,
  })

  try {
    const page = await browser.newPage({
      ignoreHTTPSErrors: true,
    })
    page.on('dialog', (dialog) => {
      void dialog.accept().catch(() => undefined)
    })
    const loginUrl =
      process.env.ECONOMIC_DAILY_URL ||
      process.env.ECONOMIC_DAILY_LOGIN_URL ||
      'https://udndata.com/fullpage'
    const loginHost = new URL(loginUrl).hostname
    if (loginHost === 'ers.nlpi.edu.tw' || loginHost.endsWith('.ers.nlpi.edu.tw')) {
      await loginToNlpi(page, loginUrl)
    } else {
      const username = process.env.ECONOMIC_DAILY_USERNAME || process.env.UDNDATA_USERNAME
      const password = process.env.ECONOMIC_DAILY_PASSWORD || process.env.UDNDATA_PASSWORD
      if (!username || !password) {
        throw new Error(
          'Economic Daily direct authentication requires ECONOMIC_DAILY_USERNAME and ECONOMIC_DAILY_PASSWORD.',
        )
      }
      await page.goto(loginUrl, {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      })
      const accountInput = page.locator('input[name="username"]:visible').first()
      const passwordInput = page.locator('input[name="password"]:visible').first()
      const submitButton = page.locator('input[type="submit"][value*="登入"]:visible').first()
      await accountInput.waitFor({
        state: 'visible',
        timeout: 30000,
      })
      await passwordInput.waitFor({
        state: 'visible',
        timeout: 30000,
      })
      await submitButton.waitFor({
        state: 'visible',
        timeout: 30000,
      })
      await accountInput.fill(username)
      await passwordInput.fill(password)
      await submitButton.click({
        noWaitAfter: true,
      })
    }

    await continuePastOnlineLimit(page)

    // The library's SSO redirect can take longer than one minute before it
    // reaches the authorized Udndata host. Do not treat that slow redirect as
    // a failed login while the browser is still navigating successfully.
    const configuredAuthenticationTimeout = Number(process.env.ECONOMIC_DAILY_AUTH_TIMEOUT_MS)
    const authenticationTimeout =
      Number.isFinite(configuredAuthenticationTimeout) && configuredAuthenticationTimeout > 0
        ? configuredAuthenticationTimeout
        : 120000
    const authenticationDeadline = Date.now() + authenticationTimeout
    while (
      new URL(page.url()).hostname !== 'udndata-com.ers.nlpi.edu.tw' &&
      Date.now() < authenticationDeadline
    ) {
      if (new URL(page.url()).hostname === 'udndata.com') {
        const bodyText = await page
          .locator('body')
          .innerText()
          .catch(() => '')
        if (/允許\s*ip\s*範圍|allowed\s*ip/i.test(bodyText)) {
          throw new Error(
            'Economic Daily denied access because this machine IP is outside the institution subscription range. NLPI authentication must yield a proxied database URL.',
          )
        }
      }
      await page.waitForTimeout(500)
    }
    if (new URL(page.url()).hostname !== 'udndata-com.ers.nlpi.edu.tw') {
      throw new Error(`Economic Daily login did not reach the authorized database: ${page.url()}`)
    }
    // NLPI grants access through a product/IP proxy session, not a visible UDN
    // member login. Waiting for a "logout" link therefore creates a false
    // timeout even after the proxy has accepted the user.
    await page
      .waitForURL(
        (url) =>
          url.hostname === 'udndata-com.ers.nlpi.edu.tw' &&
          url.pathname.toLowerCase().includes('/ndapp/fpindex'),
        { timeout: 60000 },
      )
      .catch(() => undefined)
    const [yyyy, mm, dd] = reportDate.split('-')
    const indexUrl = new URL('/ndapp/FpIndex', page.url())
    indexUrl.searchParams.set('paperID', 'ED')
    indexUrl.searchParams.set('thisY', yyyy)
    indexUrl.searchParams.set('thisM', String(Number(mm)))
    indexUrl.searchParams.set('thisD', String(Number(dd)))
    await page.goto(indexUrl.toString(), {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    })
    if (await continuePastOnlineLimit(page)) {
      await page.goto(indexUrl.toString(), {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      })
    }
    await page.waitForTimeout(1500)
    const signedViewerLink = page.locator('a[href*="FpNewBrowse?ref="]').first()
    const signedViewerHref = await signedViewerLink.getAttribute('href')
    if (!signedViewerHref) {
      throw new Error(
        `Economic Daily authenticated index did not return a signed viewer link for ${reportDate}`,
      )
    }
    await page.goto(new URL(signedViewerHref, page.url()).toString(), {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    })
    if (await continuePastOnlineLimit(page)) {
      await page.goto(indexUrl.toString(), {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      })
      const refreshedSignedViewerHref = await page
        .locator('a[href*="FpNewBrowse?ref="]')
        .first()
        .getAttribute('href')
      if (!refreshedSignedViewerHref) {
        throw new Error(
          `Economic Daily authenticated index did not return a signed viewer link for ${reportDate}`,
        )
      }
      await page.goto(new URL(refreshedSignedViewerHref, page.url()).toString(), {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      })
    }
    await page.waitForTimeout(1500)

    const readerPageLinks = page.locator('a[href*="FpNewBrowse?ref="]')
    await readerPageLinks
      .first()
      .waitFor({ state: 'attached', timeout: 60000 })
      .catch(async () => {
        await page.reload({ timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await readerPageLinks.first().waitFor({ state: 'attached', timeout: 60000 })
      })

    const images: EconomicDailyImage[] = []
    for (const pageCode of requestedPageCodes) {
      const pageNumber = Number(pageCode.match(/\d+/)?.[0] || 1)
      const pageLink = page
        .locator('a[href*="FpNewBrowse?ref="]')
        .filter({ hasText: new RegExp(`^A0?${pageNumber}\\s*-`) })
        .first()
      await pageLink.waitFor({ state: 'attached', timeout: 60000 }).catch(async () => {
        await page.reload({ timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await pageLink.waitFor({ state: 'attached', timeout: 60000 })
      })
      const pageHref = await pageLink.getAttribute('href')
      if (!pageHref) {
        throw new Error(
          `Economic Daily authenticated reader did not expose a signed ${pageCode} page link`,
        )
      }

      const signedPageUrl = new URL(pageHref, page.url())
      const fplocation = signedPageUrl.searchParams.get('FPLOCATION')
      if (
        !fplocation ||
        !fplocation.toUpperCase().includes(expectedEconomicDailyImageName(pageCode).toUpperCase())
      ) {
        throw new Error(
          `Economic Daily authenticated reader returned an invalid ${pageCode} page location`,
        )
      }

      const authorizationUrl = new URL('/ndapp/fp/2018/udntag/setFullpage.jsp', page.url())
      authorizationUrl.searchParams.set('FPLOCATION', fplocation)
      authorizationUrl.searchParams.set('type', '')
      authorizationUrl.searchParams.set('r', String(Date.now()))
      const authorizationResponse = await page.request.get(authorizationUrl.toString(), {
        headers: { referer: page.url() },
        timeout: 60000,
      })
      const authorizationSuffix = (await authorizationResponse.text()).trim()
      if (authorizationSuffix === 'limit') {
        throw new Error('Economic Daily daily original-page reading limit has been reached')
      }
      if (!authorizationResponse.ok() || authorizationSuffix === 'fail') {
        throw new Error(
          `Economic Daily failed to authorize ${pageCode}: ${authorizationResponse.status()} ${authorizationSuffix.slice(0, 120)}`,
        )
      }
      const authorizedImageUrl = buildAuthorizedEconomicDailyImageUrl({
        authorizationSuffix,
        fplocation,
      })
      const authorizedImageResponse = await page.request.get(authorizedImageUrl, {
        headers: { referer: signedPageUrl.toString() },
        timeout: 60000,
      })
      let capturedImage: CapturedEconomicDailyImage | null = null
      if (
        isExpectedEconomicDailyFullImageResponse({
          contentType: authorizedImageResponse.headers()['content-type'] || '',
          pageCode,
          responseUrl: authorizedImageResponse.url(),
          status: authorizedImageResponse.status(),
        })
      ) {
        capturedImage = {
          buffer: await authorizedImageResponse.body(),
          sourceUrl: authorizedImageResponse.url(),
        }
      } else if (authorizedImageResponse.status() === 403) {
        const responseText = (await authorizedImageResponse.text().catch(() => '')).slice(0, 500)
        const provider = /cloudflare|just a moment|security verification/i.test(responseText)
          ? 'Cloudflare verification'
          : 'the upstream image host'
        throw new Error(
          `Economic Daily ${pageCode} was authorized by NLPI, but ${provider} returned 403 for ed.udndata.com. The NLPI proxy does not cover the newspaper image subdomain.`,
        )
      }

      const candidateResponse: { current: EconomicDailyHttpResponse | null } = { current: null }
      const responseListener = (response: import('playwright-chromium').Response) => {
        const decodedUrl = decodeURIComponent(response.url()).toUpperCase()
        if (
          decodedUrl.includes('/FULLPAGE/TESTSHOWFULLPAGE.JSP') &&
          decodedUrl.includes('PIC=BIG') &&
          decodedUrl.includes(expectedEconomicDailyImageName(pageCode).toUpperCase())
        ) {
          candidateResponse.current = response
        }
      }
      page.on('response', responseListener)
      for (let attempt = 0; !capturedImage && attempt < 3; attempt += 1) {
        candidateResponse.current = null
        const imageResponsePromise = page
          .waitForResponse(
            (response) =>
              isExpectedEconomicDailyFullImageResponse({
                contentType: response.headers()['content-type'] || '',
                pageCode,
                responseUrl: response.url(),
                status: response.status(),
              }),
            { timeout: 15000 },
          )
          .then(async (response): Promise<CapturedEconomicDailyImage | null> => {
            try {
              return { buffer: await response.body(), sourceUrl: response.url() }
            } catch {
              const retryResponse = await page.request.get(response.url(), {
                headers: { referer: page.url() },
                timeout: 60000,
              })
              if (
                !isExpectedEconomicDailyFullImageResponse({
                  contentType: retryResponse.headers()['content-type'] || '',
                  pageCode,
                  responseUrl: retryResponse.url(),
                  status: retryResponse.status(),
                })
              ) {
                return null
              }
              return { buffer: await retryResponse.body(), sourceUrl: retryResponse.url() }
            }
          })
          .catch(() => null)
        await page.goto(new URL(pageHref, page.url()).toString(), {
          timeout: 60000,
          waitUntil: 'domcontentloaded',
        })
        capturedImage = await imageResponsePromise

        const retryCandidate = candidateResponse.current as EconomicDailyHttpResponse | null
        if (!capturedImage && retryCandidate) {
          await page.waitForTimeout(1200 * (attempt + 1))
          const retryResponse = await page.request.get(retryCandidate.url(), {
            headers: { referer: page.url() },
            timeout: 60000,
          })
          if (
            isExpectedEconomicDailyFullImageResponse({
              contentType: retryResponse.headers()['content-type'] || '',
              pageCode,
              responseUrl: retryResponse.url(),
              status: retryResponse.status(),
            })
          ) {
            capturedImage = { buffer: await retryResponse.body(), sourceUrl: retryResponse.url() }
          }
        }
      }
      page.off('response', responseListener)

      if (!capturedImage) {
        capturedImage = await captureEconomicDailyImageFromRenderedPage(page, pageCode)
      }

      if (!capturedImage) {
        const candidate = candidateResponse.current
        const status = candidate?.status() || 0
        const contentType = candidate?.headers()['content-type'] || 'no matching response'
        const responseText = candidate
          ? (await candidate.body().catch(() => Buffer.alloc(0)))
              .toString('utf8')
              .replace(/<script[\s\S]*?<\/script>/giu, ' ')
              .replace(/<style[\s\S]*?<\/style>/giu, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 240)
          : ''
        throw new Error(
          `Economic Daily authenticated image ${pageCode} failed after session retries: ${status} ${contentType}${responseText ? ` - ${responseText}` : ''}`,
        )
      }

      const buffer = capturedImage.buffer
      await validateEconomicDailyImage(buffer, pageCode)
      images.push({
        buffer,
        filename: `economic-daily-${pageCode.toLowerCase()}-${reportDate}.jpg`,
        pageCode,
        sourceUrl: capturedImage.sourceUrl,
      })
    }

    return images
  } finally {
    await browser.close()
  }
}

export const fetchEconomicDailyImages = async (
  reportDate: string,
): Promise<EconomicDailyImage[]> => {
  const requestedPageCodes = pageCodes()
  const images: EconomicDailyImage[] = []
  const errors: string[] = []

  for (const pageCode of requestedPageCodes) {
    try {
      images.push(await fetchEconomicDailyPublicImage(reportDate, pageCode))
    } catch (error) {
      errors.push(`${pageCode}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (images.length === requestedPageCodes.length) return images

  try {
    const existingPageCodes = new Set(images.map((image) => image.pageCode))
    const missingPageCodes = requestedPageCodes.filter(
      (pageCode) => !existingPageCodes.has(pageCode),
    )
    const authenticatedImages = await fetchEconomicDailyImagesFromAuthenticatedPdf(
      reportDate,
      missingPageCodes,
    )
    const byPageCode = new Map(
      [...images, ...authenticatedImages].map((image) => [image.pageCode, image]),
    )
    return requestedPageCodes
      .map((pageCode) => byPageCode.get(pageCode))
      .filter((image): image is EconomicDailyImage => Boolean(image))
  } catch (error) {
    throw new Error(
      [
        `Economic Daily only fetched ${images.length}/${requestedPageCodes.length} public page images.`,
        ...errors,
        `Authenticated fallback failed: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'),
    )
  }
}

export const fetchEconomicDailyImage = async (reportDate: string): Promise<EconomicDailyImage> => {
  return fetchEconomicDailyPublicImage(reportDate, 'A01')
}
