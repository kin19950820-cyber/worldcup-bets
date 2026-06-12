# 世界盃友情投注 — 部署指南

## 1. 前置需求

- Node.js 18+
- Supabase 帳號（免費計劃足夠）
- Vercel 帳號（免費計劃足夠）
- football-data.org API Key（免費計劃：10 req/min）

---

## 2. 安裝依賴

```bash
npm install
```

---

## 3. 建立 Supabase 專案

1. 前往 [supabase.com](https://supabase.com) 建立新專案
2. 前往 **SQL Editor**，複製並執行 `supabase/migrations/001_initial.sql`
3. 執行完成後到 **Table Editor** 確認 profiles / matches / bets / transactions 四個表格已建立

---

## 4. 配置環境變數

複製 `.env.local.example` 為 `.env.local`：

```bash
cp .env.local.example .env.local
```

填入以下值（在 Supabase 專案的 Settings > API 找到）：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...（保密！勿提交至 Git）

# football-data.org 免費 API Key
FOOTBALL_API_KEY=your_key_here

# 隨機字串，保護 Cron endpoint
CRON_SECRET=any_random_secret_string
```

---

## 5. 設定第一個管理員

1. 在 `/login` 頁面正常登記一個帳戶
2. 到 Supabase SQL Editor 執行：

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE display_name = '你的名字';
-- 或用 id：
-- WHERE id = 'your-user-uuid';
```

管理員登入後導航欄會出現「⚖️ 結算」和「🔄 管理」選項。

---

## 6. 本地開發

```bash
npm run dev
```

瀏覽器開啟 http://localhost:3000

---

## 7. 部署至 Vercel

```bash
npm i -g vercel
vercel
```

或直接在 Vercel Dashboard 連接 GitHub repo。

### 在 Vercel 設定環境變數：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FOOTBALL_API_KEY`
- `CRON_SECRET`

---

## 8. 設定 Cron Job（Vercel）

`vercel.json` 已配置每 6 小時自動同步一次賽程：

```json
{
  "crons": [{ "path": "/api/cron/sync", "schedule": "0 */6 * * *" }]
}
```

**注意：** Vercel Cron 會自動加入 `Authorization: Bearer <CRON_SECRET>` header 調用此 endpoint。

手動觸發同步：在 `/admin/matches` 頁面點擊「🔄 從 API 同步賽程」。

---

## 9. football-data.org 設定

1. 前往 [football-data.org](https://www.football-data.org) 免費登記
2. 取得 API Key
3. World Cup 2026 的 competition code 為 `WC`
4. 若 API 未有 WC 2026 資料，可在 `/admin/matches` 手動新增賽事

---

## 10. Supabase Auth 設定

在 Supabase Dashboard > Authentication > Settings：
- **Email Confirmations**：建議關閉（朋友圈 app，無需確認電郵）
- **Site URL**：填入你的 Vercel domain（例：`https://worldcup-bets.vercel.app`）

---

## 11. 功能說明

| 頁面 | 路徑 | 說明 |
|------|------|------|
| 登入/登記 | `/login` | 新用戶自動獲 HK$500 虛擬籌碼 |
| 主頁 | `/dashboard` | 餘額、盈虧、近期投注 |
| 賽程 | `/matches` | 查看所有賽事 |
| 落注 | `/place-bet` | 投注表格，支援7種投注類型 |
| 龍虎榜 | `/leaderboard` | 排名、盈虧、勝率 |
| 投注版 | `/bets-board` | 所有人投注記錄，支援篩選 |
| 管理：結算 | `/admin/settle` | 逐一處理待結算投注 |
| 管理：賽事 | `/admin/matches` | 同步/新增賽事 |

---

## 12. 業務邏輯說明

### 落注流程
1. 驗證賽事未開始
2. 驗證賠率 > 1
3. 驗證投注額 > 0 且不超過餘額
4. 建立 bet 記錄（status = pending）
5. 從餘額扣除本金
6. 記錄 transaction（stake_deduct）

### 結算流程（管理員）
| 結果 | 操作 |
|------|------|
| 贏（won）| payout = odds × stake，加回餘額 |
| 輸（lost）| payout = 0，不退款 |
| 取消（void）| 退回本金 |

---

## 13. 注意事項

- `SUPABASE_SERVICE_ROLE_KEY` 絕對不能暴露在前端
- 所有管理員操作均使用 service role key 繞過 RLS
- Confetti 效果只在管理員結算「贏」時出現
- 「全押警告」：投注額超過餘額 50% 時顯示
- 所有時間顯示均為香港時間（UTC+8）
