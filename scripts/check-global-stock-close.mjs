import { renderGlobalStockCloseImage } from '../src/lib/daily-report/stockMarketImages.ts'
import { writeFile } from 'node:fs/promises'

const reportDate = process.argv[2] || new Date().toISOString().slice(0, 10)
const result = await renderGlobalStockCloseImage(reportDate)
const outputPath = `/private/tmp/${result.filename}`
await writeFile(outputPath, result.buffer)

console.log(JSON.stringify({
  bytes: result.buffer.length,
  filename: result.filename,
  outputPath,
}, null, 2))
