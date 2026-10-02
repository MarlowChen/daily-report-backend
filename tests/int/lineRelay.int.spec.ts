import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nKAAAAAASUVORK5CYII=',
  'base64',
)

let server: Server | null = null

const closeServer = () =>
  new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.close((error) => (error ? reject(error) : resolve()))
  })

afterEach(async () => {
  await closeServer()
  server = null
})

const startServer = async ({ failFirstImage = false }: { failFirstImage?: boolean } = {}) => {
  const requests: string[] = []

  server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    requests.push(`${url.pathname}${url.search}`)
    const address = server?.address()
    const port = address && typeof address === 'object' ? address.port : 0
    const origin = `http://127.0.0.1:${port}`

    if (url.pathname === '/package') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          package: {
            errorLogs: [],
            items: [
              { id: 'image-1', kind: 'image', label: 'Image 1', mimeType: 'image/png', url: `${origin}/image-1.png` },
              { id: 'image-2', kind: 'image', label: 'Image 2', mimeType: 'image/png', url: `${origin}/image-2.png` },
            ],
            missing: [],
            missingItemIds: [],
            ready: true,
            reportDate: '2026-07-20',
            reportId: 'report-1',
            status: 'generated',
          },
        }),
      )
      return
    }

    if (url.pathname === '/image-1.png' && failFirstImage) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end('{"error":"missing"}')
      return
    }

    if (url.pathname === '/image-1.png' || url.pathname === '/image-2.png') {
      response.writeHead(200, { 'content-type': 'image/png' })
      response.end(png)
      return
    }

    response.writeHead(404)
    response.end()
  })

  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Mock server did not bind to a TCP port')

  return {
    apiUrl: `http://127.0.0.1:${address.port}/package`,
    requests,
  }
}

const relayArgs = (apiUrl: string) => [
  'line-relay/relay.mjs',
  '--dry-run',
  '--api-url',
  apiUrl,
  '--generate',
  'none',
  '--item-ids',
  'image-1,image-2',
]

describe('LINE relay download gating', () => {
  it('downloads every selected image before a dry run can continue', async () => {
    const mock = await startServer()
    const result = await execFileAsync(process.execPath, relayArgs(mock.apiUrl), {
      cwd: process.cwd(),
      env: { ...process.env, DAILY_REPORT_SHARED_SECRET: '' },
    })

    expect(result.stdout).toContain('Downloading image 1/2: Image 1')
    expect(result.stdout).toContain('Downloading image 2/2: Image 2')
    expect(mock.requests[0]).toBe('/package?generate=none')
  })

  it('fails on the first broken image without downloading later images', async () => {
    const mock = await startServer({ failFirstImage: true })
    let failure: (Error & { stdout?: string }) | null = null

    try {
      await execFileAsync(process.execPath, relayArgs(mock.apiUrl), {
        cwd: process.cwd(),
        env: { ...process.env, DAILY_REPORT_SHARED_SECRET: '' },
      })
    } catch (error) {
      failure = error as Error & { stdout?: string }
    }

    expect(failure?.message).toContain('Command failed')
    expect(failure?.stdout).toContain('Downloading image 1/2: Image 1')
    expect(mock.requests).not.toContain('/image-2.png')
    expect(mock.requests.some((request) => request.includes('generate=all'))).toBe(false)
  })
})
