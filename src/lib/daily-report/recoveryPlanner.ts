import type { DailyReportPartId, DailyReportValidationResult } from './validation'

export type DailyReportRecoveryPlan = {
  provider: 'deterministic' | 'openrouter'
  reason: string
  requiresHuman: boolean
  retryParts: DailyReportPartId[]
}

const isPartId = (value: unknown): value is DailyReportPartId =>
  value === 'part1' || value === 'part2' || value === 'part3'

const deterministicPlan = (
  validation: DailyReportValidationResult,
  fallbackReason?: string,
): DailyReportRecoveryPlan => {
  const persistentAuthorizationFailure = validation.issues.some(
    (issue) =>
      issue.code === 'source-error' &&
      /(403|forbidden|authenticated fallback failed|login did not reach|login was rejected|outside the institution subscription range|captcha)/i.test(
        issue.message,
      ),
  )

  return {
    provider: 'deterministic',
    reason: persistentAuthorizationFailure
      ? `A source authorization failure cannot be repaired by immediate retry.${fallbackReason ? ` ${fallbackReason}` : ''}`
      : `Retry only the parts implicated by deterministic artifact validation.${fallbackReason ? ` ${fallbackReason}` : ''}`,
    requiresHuman: persistentAuthorizationFailure || validation.retryParts.length === 0,
    retryParts: persistentAuthorizationFailure ? [] : validation.retryParts,
  }
}

const extractText = (body: unknown) => {
  const content = (body as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
    ?.message?.content
  return typeof content === 'string' ? content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '') : ''
}

export const planDailyReportRecovery = async ({
  reportDate,
  validation,
}: {
  reportDate: string
  validation: DailyReportValidationResult
}): Promise<DailyReportRecoveryPlan> => {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey || process.env.DAILY_REPORT_LLM_RECOVERY === '0') return deterministicPlan(validation)

  const allowedParts = new Set(validation.retryParts)
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      body: JSON.stringify({
        messages: [
          {
            content: [
              'You are a recovery planner for a daily-report pipeline.',
              'You may only select parts already implicated by deterministic validation.',
              'A retry cannot bypass authentication, authorization, CAPTCHA, or publisher restrictions.',
              'When repeated 403/authentication failures make another immediate retry unlikely to help, set requiresHuman=true and return no retryParts.',
              `Report date: ${reportDate}`,
              `Allowed retry parts: ${JSON.stringify(validation.retryParts)}`,
              `Issues: ${JSON.stringify(validation.issues.map(({ code, message, partId }) => ({ code, message: message.slice(0, 500), partId })))}`,
              'Return JSON only: {"retryParts":["part1"|"part2"|"part3"],"requiresHuman":boolean,"reason":string}',
            ].join('\n'),
            role: 'user',
          },
        ],
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini',
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'daily-report-recovery',
      },
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok)
      return deterministicPlan(
        validation,
        `LLM planner unavailable: OpenRouter HTTP ${response.status}.`,
      )

    const parsed = JSON.parse(extractText(await response.json())) as {
      reason?: unknown
      requiresHuman?: unknown
      retryParts?: unknown
    }
    const retryParts = Array.isArray(parsed.retryParts)
      ? [
          ...new Set(
            parsed.retryParts.filter(
              (part): part is DailyReportPartId => isPartId(part) && allowedParts.has(part),
            ),
          ),
        ]
      : []

    return {
      provider: 'openrouter',
      reason:
        typeof parsed.reason === 'string' ? parsed.reason.slice(0, 800) : 'LLM recovery decision.',
      requiresHuman: parsed.requiresHuman === true,
      retryParts,
    }
  } catch (error) {
    return deterministicPlan(
      validation,
      `LLM planner unavailable: ${error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240)}.`,
    )
  }
}
