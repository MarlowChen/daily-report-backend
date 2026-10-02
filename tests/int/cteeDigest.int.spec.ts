import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchCteeDigestSectionsFromGoogleNews } from '../../src/lib/daily-report/cteeDigest'

const rssItem = ({
  pubDate,
  section,
  source = '工商時報',
  title,
}: {
  pubDate: string
  section: '兩岸' | '國際'
  source?: string
  title: string
}) => `
  <item>
    <title><![CDATA[${title} - ${section} - ${source}]]></title>
    <link>https://news.google.com/rss/articles/${encodeURIComponent(title)}</link>
    <pubDate>${pubDate}</pubDate>
    <description><![CDATA[${title}摘要 - ${section} - ${source}]]></description>
    <source url="https://www.ctee.com.tw">ctee.com.tw</source>
  </item>`

const rss = `<?xml version="1.0"?><rss><channel>
  ${rssItem({ pubDate: 'Sun, 02 Aug 2026 01:00:00 GMT', section: '兩岸', source: 'ctee.com.tw', title: '今日兩岸新聞' })}
  ${rssItem({ pubDate: 'Fri, 31 Jul 2026 05:55:00 GMT', section: '國際', title: '最近國際新聞' })}
</channel></rss>`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CTEE Google News digest fallback', () => {
  it('prefers report-date articles when they exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(rss, { status: 200 })))

    const sections = await fetchCteeDigestSectionsFromGoogleNews({ reportDate: '2026-08-02' })

    expect(sections.china.items.map((item) => item.title)).toEqual(['今日兩岸新聞'])
  })

  it('uses recent articles when a section has no report-date publication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(rss, { status: 200 })))

    const sections = await fetchCteeDigestSectionsFromGoogleNews({ reportDate: '2026-08-02' })

    expect(sections.world.items.map((item) => item.title)).toEqual(['最近國際新聞'])
  })
})
