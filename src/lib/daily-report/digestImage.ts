import type { CteeDigestSection } from './cteeDigest'

type DigestImageInput = {
  reportDate: string
  section: CteeDigestSection
  variant: 'china' | 'world'
}

const DIGEST_LOGO_URL =
  process.env.DAILY_REPORT_DIGEST_LOGO_URL || 'https://aierone.nyc3.cdn.digitaloceanspaces.com/media/v-logo.png'

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

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const renderItems = (section: CteeDigestSection) => {
  return section.items
    .map(
      (item, index) => `
        <article class="item">
          <div class="number">${String(index + 1).padStart(2, '0')}</div>
          <div class="item-body">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.summary || '摘要擷取中，請點來源連結查看全文。')}</p>
          </div>
        </article>
      `,
    )
    .join('')
}

const buildDigestHtml = ({ reportDate, section, variant }: DigestImageInput) => {
  const badge = variant === 'china' ? 'CHINA' : 'WORLD'
  const accentColor = variant === 'china' ? '#c61717' : '#1e5c94'
  const imageTitle = variant === 'china' ? '兩岸財經重點' : '國際時事重點'

  return `<!doctype html>
  <html lang="zh-Hant">
    <head>
      <meta charset="utf-8" />
      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #eef1f4;
          color: #19202a;
          font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
        }

        .sheet {
          width: 1080px;
          min-height: 980px;
          padding: 52px 58px 58px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.98)),
            radial-gradient(circle at top right, ${accentColor}20, transparent 34%),
            #ffffff;
        }

        .topbar {
          align-items: flex-start;
          border-bottom: 3px solid #171b22;
          display: flex;
          justify-content: space-between;
          padding-bottom: 24px;
        }

        .logo {
          display: block;
          height: 74px;
          margin: 0 0 18px;
          object-fit: contain;
          object-position: left center;
          width: 168px;
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

        .section {
          border: 1px solid #d7dce2;
          border-left: 10px solid ${accentColor};
          margin-top: 34px;
          padding: 30px;
        }

        .section-head {
          align-items: center;
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .brand {
          color: #c61717;
          font-size: 22px;
          font-weight: 900;
          margin-bottom: 4px;
        }

        h2 {
          font-size: 40px;
          line-height: 1.1;
          margin: 0;
        }

        .badge {
          border: 2px solid #171b22;
          color: #171b22;
          font-size: 20px;
          font-weight: 800;
          padding: 8px 14px;
        }

        .items {
          display: grid;
          gap: 18px;
        }

        .item {
          display: grid;
          gap: 18px;
          grid-template-columns: 58px 1fr;
          padding: 0 0 18px;
        }

        .item:not(:last-child) {
          border-bottom: 1px solid #e1e5ea;
        }

        .number {
          align-items: center;
          background: #171b22;
          color: #fff;
          display: flex;
          font-size: 22px;
          font-weight: 900;
          height: 58px;
          justify-content: center;
          width: 58px;
        }

        h3 {
          font-size: 31px;
          line-height: 1.22;
          margin: 0 0 10px;
        }

        p {
          color: #3d4652;
          font-size: 23px;
          line-height: 1.48;
          margin: 0;
        }

        .footer {
          color: #6a7280;
          font-size: 18px;
          margin-top: 30px;
          text-align: right;
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <header class="topbar">
          <div>
            <img class="logo" src="${escapeHtml(DIGEST_LOGO_URL)}" alt="V1" />
            <h1>${escapeHtml(imageTitle)}</h1>
          </div>
          <div class="date">${escapeHtml(reportDate)}</div>
        </header>

        <section class="section">
          <div class="section-head">
            <div>
              <div class="brand">工商時報</div>
              <h2>${escapeHtml(section.label)}</h2>
            </div>
            <div class="badge">${badge}</div>
          </div>
          <div class="items">
            ${renderItems(section)}
          </div>
        </section>

        <div class="footer">資料來源：工商時報 CTEE</div>
      </main>
    </body>
  </html>`
}

export const renderCteeDigestImage = async (input: DigestImageInput) => {
  const { chromium } = await import('playwright-chromium')
  const browser = await chromium.launch(chromiumLaunchOptions())

  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: {
        height: 1100,
        width: 1080,
      },
    })

    await page.setContent(buildDigestHtml(input), {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(
        Array.from(document.images).map((image) => {
          if (image.complete) return Promise.resolve()
          return image.decode().catch(() => undefined)
        }),
      )
    })

    const sheet = page.locator('.sheet')

    return {
      buffer: await sheet.screenshot({
        animations: 'disabled',
        type: 'png',
      }),
      filename: `ctee-${input.variant}-digest-${input.reportDate}.png`,
    }
  } finally {
    await browser.close()
  }
}
