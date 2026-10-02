export type CryptoNewsItem = {
  excerpt?: string
  source: string
  title: string
  url: string
}

const DEFAULT_CRYPTO_NEWS_SOURCE_URL = 'https://www.blocktempo.com/feed/'
const DEFAULT_BLOCKTEMPO_POSTS_URL =
  'https://www.blocktempo.com/wp-json/wp/v2/posts?per_page=10&_fields=link,title,excerpt,date'

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

const stripCdata = (value: string) => {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
}

const stripTags = (value: string) => {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

const cleanExcerpt = (value: string) => {
  return value
    .replace(/〈[^〉]+〉這篇文章最早發佈於.*$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const getXmlField = (xml: string, field: string) => {
  const cdataMatch = xml.match(new RegExp(`<${field}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${field}>`, 'i'))
  if (cdataMatch?.[1]) return stripCdata(cdataMatch[1]).trim()

  const match = xml.match(new RegExp(`<${field}[^>]*>([\\s\\S]*?)<\\/${field}>`, 'i'))

  return match?.[1]?.trim() || ''
}

const normalizeUrl = (href: string, sourceUrl: string) => {
  try {
    return new URL(decodeHtml(href), sourceUrl).toString()
  } catch {
    return ''
  }
}

const isLikelyArticle = (title: string, url: string) => {
  if (title.length < 12) return false
  if (!url.includes('blocktempo.com')) return false
  if (url.includes('/tag/') || url.includes('/category/') || url.includes('/author/')) return false
  if (url.includes('#') || url.includes('/page/')) return false

  return true
}

const extractArticleLinks = (html: string, sourceUrl: string) => {
  const seen = new Set<string>()
  const items: CryptoNewsItem[] = []
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(linkPattern)) {
    const url = normalizeUrl(match[1] || '', sourceUrl)
    const title = stripTags(match[2] || '')

    if (!url || !isLikelyArticle(title, url) || seen.has(url)) continue

    seen.add(url)
    items.push({
      source: 'BlockTempo',
      title,
      url,
    })
  }

  return items
}

const extractRssItems = (xml: string) => {
  const items: CryptoNewsItem[] = []
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi

  for (const match of xml.matchAll(itemPattern)) {
    const itemXml = match[1] || ''
    const title = stripTags(getXmlField(itemXml, 'title'))
    const url = decodeHtml(getXmlField(itemXml, 'link')).trim()
    const description = cleanExcerpt(stripTags(getXmlField(itemXml, 'description')))

    if (!title || !url) continue

    items.push({
      excerpt: description || undefined,
      source: 'BlockTempo',
      title,
      url,
    })
  }

  return items
}

const extractBlocktempoPosts = (json: unknown) => {
  if (!Array.isArray(json)) return []

  const items: (CryptoNewsItem | null)[] = json
    .map((post) => {
      const value = post as {
        excerpt?: {
          rendered?: string
        }
        link?: string
        title?: {
          rendered?: string
        }
      }
      const title = stripTags(value.title?.rendered || '')
      const url = value.link || ''
      const excerpt = cleanExcerpt(stripTags(value.excerpt?.rendered || ''))

      if (!title || !url) return null

      return {
        source: 'BlockTempo',
        title,
        url,
        ...(excerpt ? { excerpt } : {}),
      } satisfies CryptoNewsItem
    })

  return items.filter((item): item is CryptoNewsItem => Boolean(item))
}

const fetchBlocktempoPosts = async ({ limit }: { limit: number }) => {
  const response = await fetch(DEFAULT_BLOCKTEMPO_POSTS_URL, {
    headers: {
      accept: 'application/json',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
    },
    next: {
      revalidate: 0,
    },
  })

  if (!response.ok) return []

  return extractBlocktempoPosts(await response.json()).slice(0, limit)
}

export const fetchCryptoNewsItems = async ({ limit = 10, sourceUrl }: { limit?: number; sourceUrl?: string } = {}) => {
  const resolvedSourceUrl = sourceUrl || process.env.CRYPTO_NEWS_SOURCE_URL || DEFAULT_CRYPTO_NEWS_SOURCE_URL
  const fallbackToBlocktempoPosts = async () => {
    if (!resolvedSourceUrl.includes('blocktempo.com')) return []

    return fetchBlocktempoPosts({
      limit,
    })
  }
  const response = await fetch(resolvedSourceUrl, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
    },
    next: {
      revalidate: 0,
    },
  }).catch(() => null)

  if (!response?.ok) {
    const fallbackItems = await fallbackToBlocktempoPosts()
    if (fallbackItems.length) {
      return {
        items: fallbackItems,
        sourceUrl: DEFAULT_BLOCKTEMPO_POSTS_URL,
      }
    }

    throw new Error(
      response
        ? `Crypto news source failed: ${response.status} ${response.statusText}`
        : 'Crypto news source failed: network error',
    )
  }

  const text = await response.text()
  const contentType = response.headers.get('content-type') || ''
  const isRss = contentType.includes('xml') || /^\s*<\?xml/.test(text)
  let items = (isRss ? extractRssItems(text) : extractArticleLinks(text, resolvedSourceUrl)).slice(0, limit)

  if (!items.length) items = await fallbackToBlocktempoPosts()

  if (!items.length) {
    throw new Error('Crypto news source returned no usable article links')
  }

  return {
    items,
    sourceUrl: resolvedSourceUrl,
  }
}
