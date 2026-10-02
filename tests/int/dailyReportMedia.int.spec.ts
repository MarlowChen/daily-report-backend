import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { uploadJpegToMedia } from '@/lib/daily-report/media'

describe('daily report media upload', () => {
  it('updates the existing same-day artifact instead of creating a duplicate filename', async () => {
    const payload = {
      create: vi.fn(),
      find: vi.fn(async () => ({ docs: [{ id: 'existing-media' }] })),
      update: vi.fn(async (args) => ({ id: args.id, filename: 'ctee-newspaper-a1-2026-10-01.jpg' })),
    } as unknown as Payload

    const result = await uploadJpegToMedia({
      alt: '工商時報電子版 A1 2026-10-01',
      buffer: Buffer.from('jpeg'),
      filename: 'ctee-newspaper-a1-2026-10-01.jpg',
      payload,
    })

    expect(payload.find).toHaveBeenCalledOnce()
    expect(payload.update).toHaveBeenCalledOnce()
    expect(payload.create).not.toHaveBeenCalled()
    expect(result.id).toBe('existing-media')
  })
})
