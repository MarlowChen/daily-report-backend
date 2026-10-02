# LINE 日報控制台交接

## 交付物

- App：`line-relay/dist/LINE 日報控制台.app`
- 設定檔：`~/.daily-report-line-relay/config.json`
- 狀態檔：`~/.daily-report-line-relay/state.json`
- App log：`~/Library/Logs/LINE Daily Report Relay.log`

## 第一次啟動

1. 打開 `LINE 日報控制台.app`
2. 瀏覽器會開 `http://127.0.0.1:8787`
3. 填好 Package API、Shared Secret、LINE 社群名稱
4. 按「檢查 Mac 權限」
5. 按「只檢查畫面」確認能辨識 LINE 社群
6. 確認「分段排程」狀態區有顯示今天日期、現在時間、Part 1/2/3 狀態

## 啟用自動化

- 新安裝預設開啟「啟用分段排程」與三個 Part 的 `Auto`
- 關閉總排程後不會自動跑，手動送出仍可使用
- 勾每個 Part 的 `Auto`，該段才會進排程
- 勾「排程到點直接送出」會真的送到 LINE
- 不勾「排程到點直接送出」只會貼草稿
- 「補跑窗口」預設 180 分鐘，Mac 睡眠或晚開控制台時仍可補跑
- 單一階段自動失敗時最多重試 3 次，避免在補跑窗口內無限操作 LINE

## 驗證排程

- 狀態是 `還沒到點`：等待排程時間
- 狀態是 `可觸發`：下一次 timer 或「立即檢查排程」會跑
- 狀態是 `已錯過補跑窗口`：今日這段不會自動跑，需手動送或調大補跑窗口
- 狀態是 `總排程關閉`：請勾「啟用分段排程」
- 狀態是 `此段關閉`：請勾該 Part 的 `Auto`
- 狀態是 `running` 但 App 曾經中斷：超過工作逾時後會自動回收並重試

## 雲端圖片儲存（部署前必做）

Payload 的資料庫紀錄不包含圖片實體檔。Zeabur 重新部署會清掉容器檔案，因此正式環境必須二選一：

1. 建立 Zeabur Volume，掛載到 `/app/media`，並設定 `PAYLOAD_MEDIA_DIR=/app/media`。
2. 設定 S3/R2 物件儲存。R2 需要 `R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_ENDPOINT`、`R2_PUBLIC_URL`。

部署後先呼叫 package API，確認 `ready` 是 `true`、`missingItemIds` 是空陣列。只看到 Media ID 不代表圖片真的存在；新版會實際 GET 每張圖片後才允許 LINE 送出。

```bash
curl -sS "https://你的網域/api/daily-report/package?date=YYYY-MM-DD&generate=missing" \
  -H "x-daily-report-secret: 你的密鑰"
```

開發機已設定過控制台時，可直接執行完整健康檢查；預設只讀，不會重生資料：

```bash
pnpm daily-report:verify -- --date YYYY-MM-DD
```

部署後需要補齊缺圖時才使用：

```bash
pnpm daily-report:verify -- --date YYYY-MM-DD --generate missing
```

## 常見問題

- 看起來沒觸發：先看分段排程狀態區，不要只看 Log。
- 到點沒送：確認控制台 app 當時有開、Mac 沒登出、總排程和該 Part Auto 都有開。
- 圖片顯示缺少或無法下載：先修復 Volume/S3/R2，再重跑該 Part；不要一直按 LINE 送出。
- 任務卡住：按「停止目前任務」。新版會中止生成 API 與 relay，舊的 running 狀態也會逾時回收。
- LINE 沒被操作：重新跑「檢查 Mac 權限」和「只檢查畫面」。
- 要交給另一台 Mac：複製 app 後，讓對方自行填 secret，不要傳自己的 `config.json`。

## 重新打包

```bash
node line-relay/build-mac-app.mjs
```

打包完成後，把 `line-relay/dist/LINE 日報控制台.app` 交給隊友。App 不包含 Shared Secret，請讓隊友第一次啟動時自行填入。
