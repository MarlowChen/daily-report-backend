# Daily Report Backend

以 Payload CMS 3、Next.js 16、MongoDB 建置的日報後端。系統會生成三段日報、驗證文字與圖片是否完整、提供 LINE relay 所需的分享套件，並記錄發送狀態。

## 系統範圍

- Payload Admin：使用者、媒體、公告、活動、報名與日報資料管理。
- Daily Report Pipeline：Part 1／2／3 生成、媒體上傳、完整性驗證與有限次修復。
- Daily Report API：供排程、人工操作及 macOS LINE relay 呼叫。
- LINE Relay：`line-relay/` 內的 macOS 本地控制台與發送器；不應部署在後端容器內執行。

```text
外部新聞／行情來源
        │
        ▼
Daily Report generators ──► Payload + MongoDB
        │                         │
        ├──► Media（Volume/S3）   │
        │                         ▼
        └──► validator ──► package API ──► macOS LINE relay
```

## 執行需求

- Node.js 20 LTS（專案最低支援版本見 `package.json#engines`）
- pnpm 10
- MongoDB
- Chromium/Playwright 系統依賴；正式 Docker image 已使用 Playwright Noble base image
- 正式環境的持久化 Media：S3/R2，或掛載到 `PAYLOAD_MEDIA_DIR` 的永久 Volume

## 本機啟動

```bash
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

至少設定：

```env
DATABASE_URL=mongodb://127.0.0.1/daily-report
PAYLOAD_SECRET=請使用足夠長度的隨機值
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3000
DAILY_REPORT_SHARED_SECRET=後端與-relay-共用的隨機值
```

開啟：

- App：`http://localhost:3000`
- Payload Admin：`http://localhost:3000/admin`

完整環境變數及各資料來源設定請以 [.env.example](.env.example) 為準。不要提交 `.env`、真實帳密或 API key。

## 日報執行

一次執行三段並驗證：

```bash
pnpm daily-report:run 2026-10-03
```

驗證已部署的 package API：

```bash
pnpm daily-report:verify -- --date 2026-10-03
pnpm daily-report:verify -- --date 2026-10-03 --generate missing
```

`DAILY_REPORT_LLM_RECOVERY=1` 只允許 LLM 在程式已判定的失敗 Part 中選擇重試目標。內容、日期與媒體完整性仍由 deterministic validator 決定；LLM 不會繞過登入、403、CAPTCHA 或來源限制。

## API

正式環境請帶：

```http
x-daily-report-secret: <DAILY_REPORT_SHARED_SECRET>
```

| Method | Endpoint | 用途 |
| --- | --- | --- |
| `POST` / `GET` | `/api/daily-report/run?date=YYYY-MM-DD` | 依序生成三段、驗證並有限次修復；未完整時回 `207` |
| `POST` / `GET` | `/api/daily-report/part1?date=YYYY-MM-DD` | 只重生 Part 1 |
| `POST` / `GET` | `/api/daily-report/part2?date=YYYY-MM-DD` | 只重生 Part 2 |
| `POST` / `GET` | `/api/daily-report/part3?date=YYYY-MM-DD` | 只重生 Part 3 |
| `GET` / `POST` | `/api/daily-report/package?date=YYYY-MM-DD&generate=none` | 取得 LINE relay 分享套件；`generate` 支援 `none/missing/all/part1/part2/part3` |
| `POST` | `/api/daily-report/mark-sent` | 將日報標記為已發送 |
| `POST` | `/api/daily-report/vision-verify` | 代理 LINE 畫面辨識；需要伺服器端 OpenRouter key |

範例：

```bash
curl -X POST "http://localhost:3000/api/daily-report/run?date=2026-10-03" \
  -H "x-daily-report-secret: $DAILY_REPORT_SHARED_SECRET"

curl "http://localhost:3000/api/daily-report/package?date=2026-10-03&generate=missing" \
  -H "x-daily-report-secret: $DAILY_REPORT_SHARED_SECRET"
```

## 驗證與建置

```bash
pnpm typecheck
pnpm lint
pnpm test:int
pnpm build

# 或一次執行
pnpm check
```

E2E 測試另執行：

```bash
pnpm test:e2e
```

## 部署

```bash
docker build -t daily-report-backend .
docker run --env-file .env -p 3000:3000 daily-report-backend
```

正式部署檢查：

1. MongoDB 可連線，且 `PAYLOAD_SECRET`、`DAILY_REPORT_SHARED_SECRET` 已設定。
2. `PAYLOAD_PUBLIC_SERVER_URL` 是外部可存取的 HTTPS origin。
3. Media 使用 S3/R2，或 `PAYLOAD_MEDIA_DIR` 指向永久 Volume；容器重建不能清掉圖片。
4. Playwright/Chromium 能啟動並允許對資料來源發出 HTTPS 請求。
5. 呼叫 package API，確認 `ready=true`、`missingItemIds=[]`，且每張圖片 URL 實際可下載。

## 已知外部限制

Economic Daily 流程已能完成 NLPI 登入、hyproxy 跳轉及 `setFullpage` 短效授權；目前 `ed.udndata.com` 圖片子網域仍可能被 Cloudflare 回 `403`，且 NLPI hyproxy 未涵蓋該子網域。這不是 LLM 問題，也不應以無限重試處理。正式解法是由 NLPI／UDN 補上圖片子網域代理或白名單，或在合法的機構授權網路執行。

## 目錄

```text
src/app/api/daily-report/   日報 REST API
src/lib/daily-report/       生成、媒體、驗證與修復流程
src/collections/            Payload collections
src/globals/                Payload globals
scripts/                    日報 CLI 與部署驗證
line-relay/                 macOS LINE 本地控制台／relay
tests/int/                  Vitest integration tests
docs/architecture/review/   架構檢視報告
```

LINE 控制台的安裝、權限與排程操作見 [line-relay/README.md](line-relay/README.md)，交付注意事項見 [line-relay/TEAM_HANDOFF.md](line-relay/TEAM_HANDOFF.md)。
