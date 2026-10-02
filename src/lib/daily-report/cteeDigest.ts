export type CteeDigestItem = {
  summary?: string
  title: string
  url: string
}

export type CteeDigestSection = {
  items: CteeDigestItem[]
  label: string
  sourceUrl: string
}

type FetchCteeDigestSectionsOptions = {
  excludeUrls?: string[]
  limit?: number
  reportDate?: string
}

type GoogleNewsDigestItem = CteeDigestItem & {
  pubDate?: string
}

const DEFAULT_CHINA_URL = 'https://www.ctee.com.tw/china'
const DEFAULT_WORLD_URL = 'https://www.ctee.com.tw/world'
const DEFAULT_ITEMS_PER_SECTION = 3
const GOOGLE_NEWS_RSS_URL = 'https://news.google.com/rss/search'

const chromiumLaunchOptions = () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

  return executablePath
    ? {
        executablePath,
        headless: true,
      }
    : {
        headless: true,
      }
}

const normalizeText = (value: string) => {
  return value.replace(/\s+/g, ' ').trim()
}

const decodeHtml = (value: string) => {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

const stripTags = (value: string) => {
  return normalizeText(decodeHtml(value).replace(/<[^>]*>/g, ' '))
}

const normalizeUrlKey = (value: string) => {
  try {
    const url = new URL(value)

    return `${url.hostname}${url.pathname}`.toLowerCase()
  } catch {
    return normalizeText(value).toLowerCase()
  }
}

const truncateText = (value: string, maxLength: number) => {
  const normalized = normalizeText(value)
  if (normalized.length <= maxLength) return normalized

  return `${normalized.slice(0, maxLength - 1)}…`
}

const cleanGoogleNewsTitle = (value: string) => {
  return normalizeText(decodeHtml(value))
    .replace(/\s*-\s*(兩岸|國際)\s*-\s*(?:工商時報|ctee\.com\.tw)\s*$/iu, '')
    .replace(/\s*-\s*(?:工商時報|ctee\.com\.tw)\s*$/iu, '')
}

const digestItemKey = (item: CteeDigestItem) => {
  return normalizeUrlKey(item.url || item.title)
}

const dedupeDigestItems = (items: CteeDigestItem[], seen = new Set<string>()) => {
  const uniqueItems: CteeDigestItem[] = []

  for (const item of items) {
    const urlKey = digestItemKey(item)
    const titleKey = normalizeText(item.title).toLowerCase()
    if (seen.has(urlKey) || seen.has(titleKey)) continue

    seen.add(urlKey)
    seen.add(titleKey)
    uniqueItems.push(item)
  }

  return uniqueItems
}

const getXmlField = (xml: string, field: string) => {
  const cdataMatch = xml.match(new RegExp(`<${field}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${field}>`, 'i'))
  if (cdataMatch?.[1]) return cdataMatch[1].trim()

  const match = xml.match(new RegExp(`<${field}[^>]*>([\\s\\S]*?)<\\/${field}>`, 'i'))

  return match?.[1]?.trim() || ''
}

const parseGoogleNewsItems = (xml: string, sectionLabel: '兩岸' | '國際') => {
  const items: GoogleNewsDigestItem[] = []
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi

  for (const match of xml.matchAll(itemPattern)) {
    const itemXml = match[1] || ''
    const rawTitle = getXmlField(itemXml, 'title')
    const source = stripTags(getXmlField(itemXml, 'source')).toLowerCase()
    const normalizedTitle = normalizeText(decodeHtml(rawTitle))
    const sectionSuffix = new RegExp(
      `-\\s*${sectionLabel}\\s*-\\s*(?:工商時報|ctee\\.com\\.tw)\\s*$`,
      'iu',
    )
    if (!sectionSuffix.test(normalizedTitle) || (source && source !== 'ctee.com.tw' && source !== '工商時報')) continue

    const title = cleanGoogleNewsTitle(rawTitle)
    const url = decodeHtml(getXmlField(itemXml, 'link')).trim()
    const pubDate = getXmlField(itemXml, 'pubDate')
    const description = stripTags(getXmlField(itemXml, 'description'))
      .replace(cleanGoogleNewsTitle(rawTitle), '')
      .replace(new RegExp(`-\\s*${sectionLabel}`, 'u'), '')
      .replace(/工商時報/g, '')
      .trim()

    if (!title || !url) continue

    items.push({
      pubDate: pubDate || undefined,
      summary: description || undefined,
      title,
      url,
    })
  }

  return items
}

const preferReportDateItems = (items: GoogleNewsDigestItem[], reportDate?: string) => {
  if (!reportDate) return items

  const reportDayStart = new Date(`${reportDate}T00:00:00+08:00`).getTime()
  const reportDayEnd = new Date(`${reportDate}T23:59:59+08:00`).getTime()
  const reportDateItems = items.filter((item) => {
    if (!item.pubDate) return false

    const time = new Date(item.pubDate).getTime()
    return Number.isFinite(time) && time >= reportDayStart && time <= reportDayEnd
  })

  return reportDateItems.length ? reportDateItems : items
}

const fetchGoogleNewsCteeItems = async ({
  excludedUrlKeys,
  limit,
  reportDate,
  sectionLabel,
}: {
  excludedUrlKeys: string[]
  limit: number
  reportDate?: string
  sectionLabel: '兩岸' | '國際'
}) => {
  const url = new URL(GOOGLE_NEWS_RSS_URL)
  url.searchParams.set('q', `site:ctee.com.tw ${sectionLabel} 工商時報`)
  url.searchParams.set('hl', 'zh-TW')
  url.searchParams.set('gl', 'TW')
  url.searchParams.set('ceid', 'TW:zh-Hant')

  const response = await fetch(url, {
    headers: {
      accept: 'application/rss+xml,application/xml,text/xml',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
    },
    next: {
      revalidate: 0,
    },
  })

  if (!response.ok) return []

  const excluded = new Set(excludedUrlKeys)
  const items = preferReportDateItems(
    parseGoogleNewsItems(await response.text(), sectionLabel).filter((item) => !excluded.has(digestItemKey(item))),
    reportDate,
  )

  return dedupeDigestItems(items.map(({ pubDate: _pubDate, ...item }) => item)).slice(0, limit)
}

const isArticleUrl = (href: string) => {
  try {
    const url = new URL(href)

    return url.hostname === 'www.ctee.com.tw' && /^\/news\/\d+-\d+/.test(url.pathname)
  } catch {
    return false
  }
}

const ensureEvaluateHelpers = async (page: import('playwright-chromium').Page) => {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __name?: <T>(value: T) => T
    }

    target.__name = target.__name || ((value) => value)
  })
}

const extractCategoryItems = async ({
  limit,
  page,
  categoryCodePrefix,
  excludedUrlKeys,
  reportDatePrefix,
  sourceUrl,
}: {
  categoryCodePrefix: string
  excludedUrlKeys?: string[]
  limit: number
  page: import('playwright-chromium').Page
  reportDatePrefix?: string
  sourceUrl: string
}) => {
  await page.goto(sourceUrl, {
    timeout: 60000,
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(2500)
  await ensureEvaluateHelpers(page)

  return page.evaluate(
    ({ expectedCategoryCodePrefix, excludedKeys, itemLimit, preferredDatePrefix }) => {
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
      const normalizeUrlKey = (value: string) => {
        try {
          const url = new URL(value)

          return `${url.hostname}${url.pathname}`.toLowerCase()
        } catch {
          return normalize(value).toLowerCase()
        }
      }
      const isArticle = (href: string) => {
        try {
          const url = new URL(href)

          return url.hostname === 'www.ctee.com.tw' && /^\/news\/\d+-\d+/.test(url.pathname)
        } catch {
          return false
        }
      }
      const matchesCategory = (href: string) => {
        const match = href.match(/-(\d{6})(?:$|[/?#])/)

        return Boolean(match?.[1]?.startsWith(expectedCategoryCodePrefix))
      }
      const articleDatePrefix = (href: string) => {
        const match = href.match(/\/news\/(\d{8})/)

        return match?.[1] || ''
      }
      const preferredLinks = Array.from(document.querySelectorAll('.group-list-item h3 a, .headline__box h3 a'))
      const fallbackLinks = Array.from(document.querySelectorAll('main a, article a, h1 a, h2 a, h3 a'))
      const links = [...preferredLinks, ...fallbackLinks]
      const excluded = new Set(excludedKeys)
      const seen = new Set<string>()
      const candidates: CteeDigestItem[] = []

      for (const link of links) {
        const anchor = link as HTMLAnchorElement
        const title = normalize(anchor.textContent || '')
        const url = anchor.href
        const urlKey = normalizeUrlKey(url)
        const titleKey = title.toLowerCase()

        if (
          title.length < 8 ||
          !isArticle(url) ||
          !matchesCategory(url) ||
          excluded.has(urlKey) ||
          seen.has(urlKey) ||
          seen.has(titleKey)
        ) {
          continue
        }

        seen.add(urlKey)
        seen.add(titleKey)
        candidates.push({
          title,
          url,
        })
      }

      const preferredDateItems = preferredDatePrefix
        ? candidates.filter((item) => articleDatePrefix(item.url) === preferredDatePrefix)
        : []
      const sourceItems = preferredDateItems.length ? preferredDateItems : candidates

      return sourceItems.slice(0, itemLimit)
    },
    {
      excludedKeys: excludedUrlKeys || [],
      expectedCategoryCodePrefix: categoryCodePrefix,
      itemLimit: limit,
      preferredDatePrefix: reportDatePrefix || '',
    },
  )
}

const extractArticleSummary = async ({
  page,
  title,
  url,
}: {
  page: import('playwright-chromium').Page
  title: string
  url: string
}) => {
  if (!isArticleUrl(url)) return ''

  await page.goto(url, {
    timeout: 60000,
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(1200)
  await ensureEvaluateHelpers(page)

  const summary = await page.evaluate(() => {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
    const metas = Array.from(document.querySelectorAll('meta')) as HTMLMetaElement[]
    const getMeta = (key: 'name' | 'property', value: string) => {
      return metas.find((meta) => meta.getAttribute(key) === value)?.getAttribute('content') || ''
    }
    const metaDescription = getMeta('name', 'description') || getMeta('property', 'og:description')
    const paragraphs = Array.from(document.querySelectorAll('article p, .article-content p, .content p, p'))
      .map((paragraph) => normalize(paragraph.textContent || ''))
      .filter((text) => text.length > 30 && !text.includes('Copyright ©'))

    return metaDescription || paragraphs[0] || ''
  })

  return truncateText(summary.replace(title, ''), 118)
}

const enrichItems = async (items: CteeDigestItem[], page: import('playwright-chromium').Page) => {
  const enrichedItems: CteeDigestItem[] = []

  for (const item of items) {
    const summary = await extractArticleSummary({
      page,
      title: item.title,
      url: item.url,
    }).catch(() => '')

    enrichedItems.push({
      ...item,
      summary,
    })
  }

  return enrichedItems
}

const fillWithGoogleNewsItems = async ({
  excludedUrlKeys,
  items,
  limit,
  reportDate,
  sectionLabel,
  seenDigestItems,
}: {
  excludedUrlKeys: string[]
  items: CteeDigestItem[]
  limit: number
  reportDate?: string
  sectionLabel: '兩岸' | '國際'
  seenDigestItems: Set<string>
}) => {
  const primarySeen = new Set(seenDigestItems)
  const dedupedItems = dedupeDigestItems(items, primarySeen).slice(0, limit)
  if (dedupedItems.length >= limit) {
    dedupedItems.forEach((item) => {
      seenDigestItems.add(digestItemKey(item))
      seenDigestItems.add(normalizeText(item.title).toLowerCase())
    })

    return dedupedItems
  }

  const googleItems = await fetchGoogleNewsCteeItems({
    excludedUrlKeys: [...excludedUrlKeys, ...dedupedItems.map(digestItemKey)],
    limit,
    reportDate,
    sectionLabel,
  }).catch(() => [])

  const combinedItems = dedupeDigestItems([...dedupedItems, ...googleItems], new Set(seenDigestItems)).slice(0, limit)
  combinedItems.forEach((item) => {
    seenDigestItems.add(digestItemKey(item))
    seenDigestItems.add(normalizeText(item.title).toLowerCase())
  })

  return combinedItems
}

export const fetchCteeDigestSectionsFromGoogleNews = async ({
  excludeUrls = [],
  limit = DEFAULT_ITEMS_PER_SECTION,
  reportDate,
}: FetchCteeDigestSectionsOptions = {}) => {
  const excludedUrlKeys = excludeUrls.map(normalizeUrlKey)
  const seenDigestItems = new Set<string>()
  const chinaItems = await fillWithGoogleNewsItems({
    excludedUrlKeys,
    items: [],
    limit,
    reportDate,
    sectionLabel: '兩岸',
    seenDigestItems,
  })
  const worldItems = await fillWithGoogleNewsItems({
    excludedUrlKeys,
    items: [],
    limit,
    reportDate,
    sectionLabel: '國際',
    seenDigestItems,
  })

  return {
    china: {
      items: chinaItems,
      label: '兩岸財經',
      sourceUrl: GOOGLE_NEWS_RSS_URL,
    },
    world: {
      items: worldItems,
      label: '國際',
      sourceUrl: GOOGLE_NEWS_RSS_URL,
    },
  }
}

export const fetchCteeDigestSections = async ({
  excludeUrls = [],
  limit = DEFAULT_ITEMS_PER_SECTION,
  reportDate,
}: FetchCteeDigestSectionsOptions = {}) => {
  const { chromium } = await import('playwright-chromium')
  const chinaSourceUrl = process.env.CTEE_CHINA_URL || DEFAULT_CHINA_URL
  const worldSourceUrl = process.env.CTEE_WORLD_URL || DEFAULT_WORLD_URL
  const excludedUrlKeys = excludeUrls.map(normalizeUrlKey)
  const reportDatePrefix = reportDate?.replace(/\D/g, '')
  const browser = await chromium.launch(chromiumLaunchOptions()).catch(() => null)

  if (!browser) {
    return fetchCteeDigestSectionsFromGoogleNews({
      excludeUrls,
      limit,
      reportDate,
    })
  }

  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: {
        height: 900,
        width: 1280,
      },
    })

    const chinaItems = await extractCategoryItems({
      categoryCodePrefix: '4308',
      excludedUrlKeys,
      limit,
      page,
      reportDatePrefix,
      sourceUrl: chinaSourceUrl,
    })
    const seenDigestItems = new Set<string>()
    const enrichedChinaItems = await fillWithGoogleNewsItems({
      excludedUrlKeys,
      items: await enrichItems(chinaItems, page),
      limit,
      reportDate,
      sectionLabel: '兩岸',
      seenDigestItems,
    })
    const worldItems = await extractCategoryItems({
      categoryCodePrefix: '4307',
      excludedUrlKeys,
      limit,
      page,
      reportDatePrefix,
      sourceUrl: worldSourceUrl,
    })
    const enrichedWorldItems = await fillWithGoogleNewsItems({
      excludedUrlKeys,
      items: await enrichItems(worldItems, page),
      limit,
      reportDate,
      sectionLabel: '國際',
      seenDigestItems,
    })

    return {
      china: {
        items: enrichedChinaItems,
        label: '兩岸財經',
        sourceUrl: chinaSourceUrl,
      },
      world: {
        items: enrichedWorldItems,
        label: '國際',
        sourceUrl: worldSourceUrl,
      },
    }
  } finally {
    await browser.close()
  }
}
