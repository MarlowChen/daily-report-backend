export const isScheduleBusy = ({ hasSendOperation, relayJobStatus }) => {
  return Boolean(hasSendOperation || ['running', 'stopping'].includes(relayJobStatus))
}

export const sendBatchesFor = ({ draft, items, source }) => {
  if (source === 'auto' && !draft) return items.map((item) => [item])
  return [items]
}

export const shouldCombineImagesFor = ({ partId, source }) => {
  return source !== 'auto' && (partId === 'part2' || partId === 'part3')
}

export const isAttemptStale = ({ attempt, nowMs = Date.now(), staleMs }) => {
  if (attempt?.status !== 'running') return false
  const startedAt = Date.parse(attempt.at || '')

  return Number.isFinite(startedAt) && nowMs - startedAt > staleMs
}

export const scheduleAttemptDecision = ({
  attempt,
  cooldownMs = 60_000,
  nowMs = Date.now(),
  retryLimit,
  staleMs,
}) => {
  if (!attempt) return { canRun: true, stale: false }

  const stale = isAttemptStale({ attempt, nowMs, staleMs })
  if (stale) return { canRun: true, stale: true }
  if (attempt.status === 'cancelled') return { canRun: true, stale: false }
  if (attempt.status !== 'failed') return { canRun: false, stale: false }
  if (Number(attempt.attempt || 1) >= retryLimit) return { canRun: false, stale: false }

  const attemptedAt = Date.parse(attempt.at || '')
  const coolingDown = Number.isFinite(attemptedAt) && nowMs - attemptedAt < cooldownMs

  return { canRun: !coolingDown, stale: false }
}
