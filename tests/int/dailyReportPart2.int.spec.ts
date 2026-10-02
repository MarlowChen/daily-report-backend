import { describe, expect, it } from 'vitest'

import { normalizePart2SourceUrl } from '../../src/lib/daily-report/part2'

describe('daily report part 2 source identity', () => {
  it('keeps Economic Daily page location while ignoring its session routing values', () => {
    const a01 = normalizePart2SourceUrl(
      'https://ed.udndata.com/fullpage/testShowFullpage.jsp?paperID=ED&pic=big&FPLOCATION=ED/ED2026/08/04/A01_20100.JPG&jsessionid=session-a&hostname_port=12:80',
    )
    const a02 = normalizePart2SourceUrl(
      'https://ed.udndata.com/fullpage/testShowFullpage.jsp?paperID=ED&pic=big&FPLOCATION=ED/ED2026/08/04/A02_20200.JPG&jsessionid=session-a&hostname_port=11:80',
    )
    const sameA01FromAnotherSession = normalizePart2SourceUrl(
      'https://ed.udndata.com/fullpage/testShowFullpage.jsp?paperID=ED&pic=big&FPLOCATION=ED/ED2026/08/04/A01_20100.JPG&jsessionid=session-b&hostname_port=11:80',
    )

    expect(a01).not.toBe(a02)
    expect(a01).toBe(sameA01FromAnotherSession)
  })
})
