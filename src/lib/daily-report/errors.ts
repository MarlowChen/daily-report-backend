export type DailyReportError = {
  message: string
  occurredAt: string
  scope: string
}

export const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message

  return String(error)
}

export const createErrorLog = (scope: string, error: unknown): DailyReportError => {
  return {
    message: toErrorMessage(error),
    occurredAt: new Date().toISOString(),
    scope,
  }
}
