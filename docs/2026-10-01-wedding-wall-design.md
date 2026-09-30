# 婚禮祝福牆 — 設計

Corner & Tsung 婚禮（2026-11-19）。賓客掃 QR code 錄祝福影片或拍照，審核後在會場大螢幕即時輪播，婚後保留為回顧頁。

## 需求（已確認）
- 現場大螢幕即時播 + 婚後回顧
- 先審核才播（伴娘用審核頁）
- 影片最長 60 秒
- 後端：Supabase 免費方案（不綁卡）
- 風格：紅絲絨、巴洛克金雕、劇院布幕

## 架構
靜態網頁（GitHub Pages）+ Supabase（Postgres + Storage + Realtime + Auth）。

| 頁面 | 使用者 | 功能 |
|---|---|---|
| `index.html` | 賓客手機 | 網頁內錄影（720p、1.2Mbps，60 秒約 10MB）、拍照/相簿（壓到 1600px JPEG）、填名字與祝福、上傳進度 |
| `admin.html` | 審核人員（Email 登入） | 待審 / 已通過 / 已隱藏三個分頁，通過、隱藏、撤下，空間用量 |
| `screen.html` | 會場電腦 | 點擊開幕（解鎖聲音）、輪播已通過內容、新通過優先插播、角落 QR code、選配背景音樂（影片播放時自動降低音量） |

`js/store.js` 是唯一的資料層；`config.js` 的 `supabaseUrl` 留空時進入示範模式（IndexedDB + BroadcastChannel，同一台電腦多分頁即時同步）。

## 安全
RLS：anon 只能 insert 狀態為 pending 的資料、只能 select approved；authenticated 可讀全部並更新狀態。Storage bucket 公開讀取，anon 只能上傳，單檔 50MB、限制 MIME。

## 免費方案限制對策
- 1GB 空間：網頁內錄影控制 bitrate；後台顯示用量
- 5GB/月流量：大螢幕用 Cache API 把每個檔案存在本機，重播不再下載；上傳時設 `cache-control: max-age=31536000`
- 7 天無活動暫停：婚禮前設定每日自動連線（待做）
- QR code 網址加 `?openExternalBrowser=1`，讓 LINE 內建瀏覽器改用外部瀏覽器開啟（LINE 內可能無法開相機）

## 待辦
1. 建 Supabase 專案、執行 `supabase/schema.sql`、建審核帳號、填 `config.js`
2. 推上 GitHub Pages
3. 每日自動連線，避免專案暫停
4. 可列印的桌卡 QR code
5. 真實手機測試（iPhone Safari、Android Chrome、LINE），含「分享到 IG 限動」
6. 向 Nancy 要 IG 帳號與 hashtag，填 config.js（目前暫用 #CornerTsungWedding）

## IG
Nancy 想要「發 IG 限動 + hashtag，大螢幕自動抓」— 不可行（hashtag API 不含限動、私人帳號抓不到、需 Meta App Review）。改為：上傳成功後用 Web Share API 一鍵分享檔案到 IG，並自動複製 @帳號 + hashtag；不支援分享檔案的瀏覽器改顯示「存到手機」下載。
