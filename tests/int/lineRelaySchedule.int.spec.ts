import { describe, expect, it } from 'vitest'

import {
  isAttemptStale,
  isScheduleBusy,
  scheduleAttemptDecision,
  sendBatchesFor,
  shouldCombineImagesFor,
} from '../../line-relay/schedule.mjs'

const minute = 60_000
const nowMs = Date.parse('2026-07-20T04:00:00.000Z')
const staleMs = 8 * minute

describe('LINE relay schedule decisions', () => {
  it('keeps manual and draft sends in one unchanged batch', () => {
    const items = [{ id: 'text' }, { id: 'image-1' }, { id: 'image-2' }]

    expect(sendBatchesFor({ draft: false, items, source: 'manual' })).toEqual([items])
    expect(sendBatchesFor({ draft: true, items, source: 'auto' })).toEqual([items])
    expect(shouldCombineImagesFor({ partId: 'part2', source: 'manual' })).toBe(true)
    expect(shouldCombineImagesFor({ partId: 'part3', source: 'manual' })).toBe(true)
  })

  it('sends automatic live items one at a time so progress can be saved per item', () => {
    const items = [{ id: 'text' }, { id: 'image-1' }, { id: 'image-2' }]

    expect(sendBatchesFor({ draft: false, items, source: 'auto' })).toEqual([
      [{ id: 'text' }],
      [{ id: 'image-1' }],
      [{ id: 'image-2' }],
    ])
    expect(shouldCombineImagesFor({ partId: 'part2', source: 'auto' })).toBe(false)
    expect(shouldCombineImagesFor({ partId: 'part3', source: 'auto' })).toBe(false)
  })

  it('blocks a new schedule run while generation or LINE relay is active', () => {
    expect(isScheduleBusy({ hasSendOperation: true, relayJobStatus: 'success' })).toBe(true)
    expect(isScheduleBusy({ hasSendOperation: false, relayJobStatus: 'running' })).toBe(true)
    expect(isScheduleBusy({ hasSendOperation: false, relayJobStatus: 'stopping' })).toBe(true)
    expect(isScheduleBusy({ hasSendOperation: false, relayJobStatus: 'success' })).toBe(false)
  })

  it('recovers a running attempt only after the stale timeout', () => {
    const freshAttempt = { at: new Date(nowMs - 7 * minute).toISOString(), status: 'running' }
    const staleAttempt = { at: new Date(nowMs - 9 * minute).toISOString(), status: 'running' }

    expect(isAttemptStale({ attempt: freshAttempt, nowMs, staleMs })).toBe(false)
    expect(isAttemptStale({ attempt: staleAttempt, nowMs, staleMs })).toBe(true)
    expect(scheduleAttemptDecision({ attempt: staleAttempt, nowMs, retryLimit: 3, staleMs })).toEqual({
      canRun: true,
      stale: true,
    })
  })

  it('applies failure cooldown and stops after the retry limit', () => {
    const coolingDown = { at: new Date(nowMs - 30_000).toISOString(), attempt: 1, status: 'failed' }
    const readyToRetry = { at: new Date(nowMs - 61_000).toISOString(), attempt: 2, status: 'failed' }
    const exhausted = { at: new Date(nowMs - 61_000).toISOString(), attempt: 3, status: 'failed' }

    expect(scheduleAttemptDecision({ attempt: coolingDown, nowMs, retryLimit: 3, staleMs }).canRun).toBe(false)
    expect(scheduleAttemptDecision({ attempt: readyToRetry, nowMs, retryLimit: 3, staleMs }).canRun).toBe(true)
    expect(scheduleAttemptDecision({ attempt: exhausted, nowMs, retryLimit: 3, staleMs }).canRun).toBe(false)
  })

  it('never repeats a successful attempt and allows a cancelled attempt', () => {
    expect(
      scheduleAttemptDecision({
        attempt: { at: new Date(nowMs).toISOString(), status: 'success' },
        nowMs,
        retryLimit: 3,
        staleMs,
      }).canRun,
    ).toBe(false)
    expect(
      scheduleAttemptDecision({
        attempt: { at: new Date(nowMs).toISOString(), status: 'cancelled' },
        nowMs,
        retryLimit: 3,
        staleMs,
      }).canRun,
    ).toBe(true)
  })
})
