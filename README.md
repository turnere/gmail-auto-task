# Gmail → Claude → Habitica Auto-Tasker

Scans your **sent** Gmail daily, uses **Claude** to extract commitments and action items you made, then creates **Habitica todos with reminders** automatically so nothing falls through the cracks. You get push notifications on your phone via the Habitica app.

## Architecture

```
Gmail API (OAuth2)  →  Claude API  →  Habitica API
       ↑                                      |
       └──────── GitHub Actions Cron ──────────┘
```

## Setup

### 1. Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Gmail API** (Tasks API no longer needed)
4. Go to **Credentials** → Create **OAuth 2.0 Client ID**
   - Application type: **Desktop app**
   - Download the JSON → save as `credentials.json` in the project root
5. (For production) Configure the OAuth consent screen

### 2. Habitica API Credentials

1. Log into [Habitica](https://habitica.com)
2. Go to **Settings → API**
3. Copy your **User ID** and **API Token**
4. Make sure push notifications are enabled in the Habitica mobile app

### 3. Claude API Key

Get your key from [console.anthropic.com](https://console.anthropic.com/)

### 4. Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

### 5. Install Dependencies

```bash
npm install
```

### 6. Authenticate with Google

Run the one-time auth flow — this opens a browser for you to grant access:

```bash
npm run auth
```

This saves a `token.json` file with your refresh token.

### 7. Run It

```bash
npm start
```

### 8. Automate with GitHub Actions

The included workflow at `.github/workflows/daily-scan.yml` runs this daily at 8 AM UTC. You'll need to add these **repository secrets**:

| Secret | Value |
|---|---|
| `GOOGLE_CREDENTIALS` | Contents of `credentials.json` (base64 encoded) |
| `GOOGLE_TOKEN` | Contents of `token.json` (base64 encoded) |
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `HABITICA_USER_ID` | Your Habitica User ID |
| `HABITICA_API_TOKEN` | Your Habitica API Token |

Encode files with: `base64 -w 0 credentials.json`

## How It Works

1. Fetches sent emails from the last 24 hours (configurable)
2. Sends each email body to Claude with a prompt to extract commitments
3. Claude returns structured JSON: tasks with descriptions and due dates
4. Creates each as a Habitica todo with a reminder (9 AM on due date)
5. Habitica sends a push notification to your phone
6. Logs everything so you can see what was created

## Cost

- **Gmail API**: Free for personal use
- **Habitica API**: Free
- **Claude API**: ~$0.01–0.05/day depending on email volume
- **GitHub Actions**: Free for public repos, 2000 min/month for private

## Configuration

Edit `.env` to customize:
- `HOURS_TO_LOOK_BACK` — how far back to scan (default: 24)
- `CLAUDE_MODEL` — which model to use (default: claude-sonnet-4-20250514)
- `DRY_RUN` — set to `true` to see what would be created without creating tasks
