# Google Sheets Setup

Roster and coaching ratings are stored in a **Google Spreadsheet** and sync automatically when you edit them in the app.

Game-day settings (availability, substitution plan, match clock) stay in your browser.

## One-time setup (~10 minutes)

### 1. Create the spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it something like **U10 Sub Manager**

### 2. Add the Apps Script

1. In the spreadsheet: **Extensions → Apps Script**
2. Delete any default code and paste the contents of [`google-apps-script/Code.gs`](google-apps-script/Code.gs)
3. Click **Save** (name the project "U10 Sub Manager")
4. Run **setupSheet** from the function dropdown → **Run**
   - Authorize when prompted (Google will show an "unverified app" warning — click Advanced → Go to …)
5. Confirm three tabs were created: **Roster**, **Coaching**, **Settings**

### 3. Set the shared secret

1. In Apps Script, open `setApiSecret()` and replace `REPLACE_WITH_A_LONG_RANDOM_SECRET` with a long random string (16+ characters)
   - Example generator: `openssl rand -hex 24` in a terminal
2. Run **setApiSecret** once
3. **Remove or redact** the literal secret from the script file if you share or commit it

### 4. Deploy as web app

1. **Deploy → New deployment**
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click **Deploy** and copy the **Web app URL** (ends in `/exec`)

### 5. Connect the coaching app

1. Open the U10 Sub Manager app
2. Expand **Google Sheets** in the header
3. Paste the **Web app URL** and the **same shared secret** → **Connect**

You should see **Synced with Google Sheets**. Your roster from the sheet loads automatically.

## Spreadsheet layout

### Roster tab

| id | number | name | birthYear | primaryPosition | secondaryPosition |
|----|--------|------|-----------|-----------------|-------------------|
| p1 | 24 | Noah Bergsten | 2016 | MID | |

Positions: `GK`, `DEF`, `MID`, `ST`

You can edit the sheet directly in Google Sheets — click **Reload** in the app to pull changes.

### Coaching tab

| playerId | practice | performance | behavior | notes |
|----------|----------|-------------|----------|-------|
| p1 | 4 | 5 | 4 | Great attendance |

Scores are 1–5. `practice` = practice & effort at training; `performance` = skill/impact in games. `playerId` must match the Roster tab `id` column.

### Settings tab

| key | value |
|-----|-------|
| meritInfluence | 50 |

## Security

Requests without the correct shared secret are rejected with **Unauthorized**.

- Store the secret only in Apps Script **Script Properties** (via `setApiSecret`) and in the coaching app connection settings
- Do not commit the secret to git or share the web app URL + secret together publicly
- The secret is sent on GET (query string) and POST (body) — keep the spreadsheet and URL private

## Optional: default URL via environment variable

Create `.env.local`:

```
VITE_SHEETS_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
VITE_SHEETS_SECRET=your-long-random-secret
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Load failed | Redeploy the web app; ensure access is **Anyone** |
| Save failed | Use the `/exec` URL, not `/dev` |
| Invalid shared secret | Re-enter the same secret used in `setApiSecret()` |
| Unauthorized | Run `setApiSecret()` and redeploy the web app |
| Empty roster | Run **setupSheet** again in Apps Script |
