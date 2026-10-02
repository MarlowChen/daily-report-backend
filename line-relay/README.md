# Daily Report LINE Relay

本資料夾是本地 macOS 發送器。雲端 Payload 負責爬蟲、產圖、存 Media；這個 relay 只呼叫 REST API，下載暫存圖片，貼到已登入的 LINE desktop。

## Setup

```bash
cd line-relay
cp .env.example .env
pnpm install
```

把 `.env` 裡的 `DAILY_REPORT_PACKAGE_URL`、`DAILY_REPORT_MARK_SENT_URL`、`DAILY_REPORT_SHARED_SECRET` 改成雲端正式值。

macOS 權限：

- `系統設定 > 隱私權與安全性 > 輔助使用`：允許 Terminal / iTerm 控制電腦
- `系統設定 > 隱私權與安全性 > 自動化`：允許 Terminal / iTerm 控制 LINE 和 System Events
- `系統設定 > 隱私權與安全性 > 螢幕錄製與系統音訊`：允許 Terminal / iTerm 截圖，`--smart-room` 需要

## Test

先確認貼上能不能進 LINE 輸入框：

```bash
pnpm test-paste
```

如果 `keycode` 貼不上，可試：

```bash
pnpm test-paste -- --paste-method menu
pnpm test-paste -- --paste-method keystroke
```

## Dry Run

```bash
pnpm dry-run
```

會呼叫雲端 package API、下載圖片到 `/private/tmp/daily-report-line-relay/<date>`，但不會發 LINE。dry-run 會保留暫存檔，方便你打開檢查。

## Control Panel

客戶端可以直接開本機控制台，不需要記指令：

```bash
node app.mjs
```

打開：

```txt
http://127.0.0.1:8787
```

控制台會存：

```txt
~/.daily-report-line-relay/config.json
~/.daily-report-line-relay/state.json
```

功能：

- 設定 API、secret、OpenRouter key、LINE 社群名稱
- 設定每日自動排程時間
- Part 1 / Part 2 / Part 3 分別設定自動排程時間
- `Input Click x,y` 可以留空；留空時會自動找右側聊天室底部的訊息輸入框
- Auto 到時間後只會嘗試一次
- 每次送出前都會先用 smart-room 開社群，再截圖驗證右側 header
- 預設是草稿模式：只貼上到 LINE，不按 Enter，不 mark-sent
- 手動可以勾選單一 part 貼上補發，檢查後自己按 Enter
- 「送測試訊息」只送一行測試文字，不碰日報、不 mark-sent
- 勾選「重送已成功項目」才會重送本地已成功項目
- 若改用真正送出模式，Part 1/2/3 都送完後，才會回報雲端 `mark-sent`

如果不要用瀏覽器 UI，也可以直接呼叫本機 REST：

```bash
curl http://127.0.0.1:8787/api/package
curl -X POST http://127.0.0.1:8787/api/verify-room
curl -X POST http://127.0.0.1:8787/api/open-room
curl -X POST http://127.0.0.1:8787/api/test-send
curl -X POST http://127.0.0.1:8787/api/send \
  -H 'content-type: application/json' \
  -d '{"itemIds":["daily-report-news"],"force":false}'
curl -X POST http://127.0.0.1:8787/api/send-part \
  -H 'content-type: application/json' \
  -d '{"partId":"part1","draft":true,"force":false}'
```

目前分段項目：

- Part 1：`daily-report-news`
- Part 2：`ctee-newspaper`, `ctee-newspaper-2`, `ctee-newspaper-3`, `economic-daily`, `economic-daily-2`, `economic-daily-3`
- Part 3：`ctee-china-digest`, `ctee-world-digest`, `us-stock-heatmap`, `global-stock-close`

如果雲端 package 少了其中任何一個 item，控制台會顯示缺少項目，按該 Part 貼上時也會直接失敗，不會只貼半套。

## Send

1. 打開 LINE desktop
2. 進入目標 LINE 社群聊天室
3. 跑：

```bash
pnpm send
```

腳本會切到 LINE，給你幾秒點訊息輸入框，然後依序貼文字和圖片並送出。成功後會呼叫 `mark-sent` API，把雲端日報狀態更新成 `sent`。

## Fully Automatic Mode

全自動模式優先用社群名稱搜尋。搜尋結果預設用鍵盤：搜尋完成後按兩下往下，再按 Enter。

### Test Room Search

先在 `.env` 填社群名稱：

```env
LINE_RELAY_ROOM_NAME=你的 LINE 社群名稱
LINE_RELAY_SEARCH_MODE=keyboard
LINE_RELAY_SEARCH_SHORTCUT=cmd-shift-f
LINE_RELAY_SEARCH_RESULT_MODE=keyboard
LINE_RELAY_SEARCH_OPEN_KEY=down-enter
LINE_RELAY_SEARCH_RESULT_STEPS=2
```

安全測試只會開 LINE 搜尋並貼上社群名稱，**不會按 Enter**：

先測「只聚焦搜尋框」，不貼任何字：

```bash
pnpm test-search-focus
```

如果 LINE 搜尋已經打開，但焦點不在搜尋框，可以試不同 Tab 次數：

```bash
pnpm test-search-focus -- --search-mode keyboard --search-tab-count 1
pnpm test-search-focus -- --search-mode keyboard --search-tab-count 2
pnpm test-search-focus -- --search-mode keyboard --search-tab-count 3
```

等游標真的在搜尋框後，再測貼社群名稱：

```bash
pnpm test-room
```

如果它貼到聊天輸入框，先手動刪掉文字，表示 LINE 沒有把搜尋欄暴露出來，需要看 `pnpm dump-ui`。

確認搜尋字真的在搜尋框後，才測試進入社群：

```bash
pnpm test-room:open -- --room-name "你的社群名稱"
```

這個預設等同於：

```bash
pnpm test-room:open -- --room-name "你的社群名稱" --search-result-mode keyboard --search-open-key down-enter
```

只想選到結果、不按 Enter，可以先跑：

```bash
pnpm test-room:open -- --room-name "你的社群名稱" --search-open-key down-only
```

如果 LINE 版本結果排序變了，再調整往下次數：

```bash
pnpm test-room:open -- --room-name "你的社群名稱" --search-result-steps 1
pnpm test-room:open -- --room-name "你的社群名稱" --search-result-steps 3
```

### Smart Room Verification

Smart mode 會搜尋多個候選位置，每次打開後截圖，交給 vision LLM 判斷右側聊天室 header 是否真的是目標社群。它只在驗證通過後才繼續；正式送出前也會再驗一次。

預設走雲端 vision proxy，所以客戶端不需要 OpenRouter key。OpenRouter key 放在雲端 REST 伺服器環境變數即可。

`.env` 需要：

```env
DAILY_REPORT_PACKAGE_URL=https://你的網域/api/daily-report/package
DAILY_REPORT_SHARED_SECRET=你的 shared secret
LINE_RELAY_VISION_PROVIDER=proxy
LINE_RELAY_VISION_PROXY_URL=
LINE_RELAY_VISION_MODEL=openai/gpt-4.1-mini
LINE_RELAY_ROOM_NAME=V1加密世界教學論壇
LINE_RELAY_SMART_ROOM_STEPS=2,1,3,0,4
LINE_RELAY_VERIFY_THRESHOLD=0.85
```

如果要改成本機直連 OpenRouter：

```env
LINE_RELAY_VISION_PROVIDER=openrouter
OPENROUTER_API_KEY=你的 OpenRouter API key
LINE_RELAY_VISION_MODEL=openai/gpt-4.1-mini
```

如果要改成本機直連 OpenAI：

```env
LINE_RELAY_VISION_PROVIDER=openai
OPENAI_API_KEY=你的 OpenAI API key
LINE_RELAY_VISION_MODEL=gpt-4.1-mini
```

只驗證目前畫面：

```bash
pnpm verify-room -- --room-name "V1加密世界教學論壇"
```

這個只會截圖和呼叫 LLM，不會貼字、不會 Enter、不會送訊息。

智能打開社群但不貼不送：

```bash
pnpm test-room:smart -- --room-name "V1加密世界教學論壇"
```

智能發送：

```bash
pnpm send:smart -- --room-name "V1加密世界教學論壇"
```

確認能進入正確社群後，測試貼一段文字但不送出：

```bash
pnpm test-message -- --room-name "你的社群名稱"
```

或指定文字：

```bash
pnpm test-message -- --room-name "你的社群名稱" --test-message "測試"
```

預設 `keyboard` 模式會用 LINE 全域搜尋快捷鍵 `command + shift + f`，避免跑到聊天室內搜尋。
如果你的 LINE 版本不同，再退回 `global-click` 模式：

```bash
pnpm test-search-focus -- --search-mode global-click --window-bounds 0,0,1200,900
```

如果 `global-click` 不準，再看 Accessibility tree。
如果它找不到搜尋欄，先看 LINE 暴露了哪些文字欄：

```bash
pnpm dump-ui
```

如果 `ax` 模式不適合你的 LINE 版本，再退回鍵盤模式：

```bash
pnpm test-room -- --room-name "你的社群名稱" --search-mode keyboard
```

如果 `cmd-f` 沒有打開 LINE 搜尋，改試：

```bash
pnpm test-room -- --search-shortcut cmd-k
```

如果搜尋框有打開，但社群名稱沒有貼進去，抓搜尋框位置：

不要直接切回 Terminal 抓座標，滑鼠會跑掉。用倒數抓：

```bash
pnpm mouse-position:delay
```

下指令後 5 秒內把滑鼠移到搜尋框，它會自動輸出座標。然後：

```bash
pnpm test-room -- \
  --room-name "你的社群名稱" \
  --search-mode click \
  --search-box-click x,y
```

如果 field-click、Accessibility 和鍵盤策略都打不開結果，最後才抓搜尋結果的位置：

```bash
pnpm mouse-position:delay
```

下指令後 5 秒內把滑鼠移到搜尋結果第一筆。然後填：

```env
LINE_RELAY_SEARCH_RESULT_CLICK=120,180
```

再跑一次：

```bash
pnpm test-room:open -- --search-result-mode click
```

### Automatic Send

社群能自動進入後，通常不用再校準輸入框位置；relay 會自動找右側聊天室底部的輸入框。只有你的 LINE 版本找不到輸入框時，才需要填 `LINE_RELAY_INPUT_CLICK`。

1. 打開 LINE desktop
2. 設定固定 LINE 視窗：

```env
LINE_RELAY_AUTO=true
LINE_RELAY_ROOM_NAME=你的 LINE 社群名稱
LINE_RELAY_WINDOW_BOUNDS=0,0,1200,900
LINE_RELAY_INPUT_CLICK=
```

3. 測試自動進社群和定位聊天室，不會貼內容：

```bash
pnpm test-room
```

如果之後真的貼不到輸入框，才用座標 fallback：

```bash
pnpm mouse-position:delay
```

下指令後 5 秒內把滑鼠移到訊息輸入框，把輸出的 `x,y` 填到 `.env` 的 `LINE_RELAY_INPUT_CLICK`。

4. 全自動送出：

```bash
pnpm send:auto
```

也可以直接：

```bash
node relay.mjs --send --auto
```

如果你的 LINE 一直停在目標聊天室，也可以不填 `LINE_RELAY_ROOM_NAME`，只填 `LINE_RELAY_INPUT_CLICK`。

relay 預設會阻止重複發送：如果雲端日報已經是 `sent`，排程會停止。真的要重送時才加：

```bash
pnpm send:auto -- --allow-resend
```

## 控制台分段排程

新版自動化由控制台常駐服務 `app.mjs` 管理，排程分成 Part 1、Part 2、Part 3。控制台需要一直開著，或透過下面的 LaunchAgent 在登入後常駐。

```bash
pnpm app
```

打開 `http://127.0.0.1:8787` 後確認：

- 「啟用分段排程」已勾選
- 各 Part 的 `Auto` 已勾選
- 「排程到點直接送出」已勾選時會真的送出；沒勾時只會貼成草稿
- 「補跑窗口」代表 Mac 睡眠或控制台晚開時，超過排程時間後還能補跑多久，預設 180 分鐘

控制台會顯示今天時間、總排程狀態、每個 Part 的等待/可觸發/錯過/上次結果。要測試排程判斷，可以按「立即檢查排程」；它會找今天已到點且尚未成功的第一個 Part 執行。

## launchd Schedule

macOS 自動化要用 LaunchAgent，因為它需要登入後的 GUI 權限。範例會讓控制台在登入後常駐，真正的 09:00 / 12:00 / 15:00 分段排程由控制台內部處理。先複製範例：

```bash
cp com.moreu.daily-report-line-relay.plist.example ~/Library/LaunchAgents/com.moreu.daily-report-line-relay.plist
```

打開 plist，把路徑改成你的 Node 和專案路徑。載入：

```bash
launchctl unload ~/Library/LaunchAgents/com.moreu.daily-report-line-relay.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.moreu.daily-report-line-relay.plist
```

測試立刻跑一次：

```bash
launchctl start com.moreu.daily-report-line-relay
```

排程模式也會呼叫 `mark-sent`。如果今天已經發過，雲端後台會看到 `sentAt`。

## Files

圖片以 Payload Media URL 為主。正式環境必須使用 Zeabur Volume 或 S3/R2，否則重新部署後資料庫雖保留 Media 紀錄，圖片檔仍會消失。package API 會實際下載檢查每張圖片；任何一張失敗都不會開啟 LINE。

relay 會為了 macOS 剪貼簿暫存下載圖片；正式送出成功後預設刪除暫存檔。若要保留檔案以便 debug：

```bash
pnpm send -- --keep-files
```
