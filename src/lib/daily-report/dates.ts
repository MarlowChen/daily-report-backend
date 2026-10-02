const TAIPEI_TIME_ZONE = 'Asia/Taipei'

export const getTaipeiReportDate = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
  })

  return formatter.format(date)
}

export const isReportDate = (value: string) => {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}
