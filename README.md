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
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |

Encode files with: `base64 -w 0 credentials.json`

## How It Works

1. Fetches sent emails from the last 24 hours (configurable)
2. Sends each email body to Claude with a prompt to extract commitments
3. Claude returns structured JSON: tasks with descriptions and due dates
4. Creates each as a Habitica todo with a reminder (9 AM on due date)
5. Habitica sends a push notification to your phone
6. Logs everything so you can see what was created

## Contact Reconnect System

Keep a database of vendors/people you want to stay connected with in **Supabase** (accessible from any frontend). Each week, the system finds who you haven't connected with the longest and creates a Habitica todo. When you complete the task in Habitica (after texting, emailing, DMing on Instagram, etc.), the next run marks them as contacted.

### Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase-migration.sql`
3. Go to **Settings → API** and copy your project URL and service role key
4. Add to your `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key
   ```

The same Supabase table can be accessed from your other website's frontend using the anon key + RLS policies.

### Managing Contacts

```bash
# Add a contact (email is optional)
npm run contacts:add -- "Jane Smith" "jane@example.com" "Acme Corp" "Met at trade show"
npm run contacts:add -- "Bob Johnson" "" "Studio Pro" "Instagram DM contact"

# List all contacts (sorted by least recently contacted)
npm run contacts:list

# Manually mark someone as contacted today
npm run contacts:touched -- "jane@example.com"

# Remove a contact
npm run contacts:remove -- "jane@example.com"
```

### Weekly Reconnect

```bash
# Check completed tasks, mark contacts, create next reconnect task
npm run reconnect
```

Each run of `npm run reconnect`:
1. **Checks Habitica** — if you completed a reconnect task, it marks that contact as connected today
2. **Picks the next person** — the one you haven't reached out to the longest (skips anyone who already has a pending task)
3. **Creates a Habitica todo** — with their name, email, notes, and a due date

Complete the Habitica task however you reconnected (text, email, DM, call) and the next run picks it up.

Add a cron entry in GitHub Actions to run `npm run reconnect` weekly.

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
