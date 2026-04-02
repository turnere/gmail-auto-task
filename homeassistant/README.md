# Home Assistant + PawSync Setup

Control the PawSync cat feeder schedule and Sonos chimes from Home Assistant running on a Raspberry Pi.

## Architecture

```
┌─────────────────────┐         REST API          ┌───────────────────┐
│   Home Assistant     │  ──────────────────────►  │   Node.js API     │
│   (Pi / container)   │  Bearer token auth        │   (npm run api)   │
│                      │  ◄──────────────────────  │                   │
│  • Dashboard cards   │                           │  • Feeder cron    │
│  • Automations       │                           │  • Sonos playback │
│  • Schedule control  │                           │  • Schedule mgmt  │
└─────────────────────┘                           └───────────────────┘
```

## 1. Install Home Assistant on the Pi

The easiest method is **Home Assistant OS** on a dedicated SD card:

```bash
# Download the HA image for your Pi model
# https://www.home-assistant.io/installation/raspberrypi

# Flash to SD card with Raspberry Pi Imager or Etcher
# Boot the Pi from the SD card
# Access HA at http://homeassistant.local:8123
```

If you want to keep running other things on the Pi (like this Node.js app), use the **container** install instead:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Run Home Assistant container
docker run -d \
  --name homeassistant \
  --restart=unless-stopped \
  -v /home/eric/ha-config:/config \
  -e TZ=America/Chicago \
  --network=host \
  ghcr.io/home-assistant/home-assistant:stable
```

HA will be available at `http://<PI_IP>:8123`.

## 2. Start the PawSync API

Add an `API_TOKEN` to your `.env` file — this is a shared secret between HA and the API:

```bash
# Generate a random token
echo "API_TOKEN=$(openssl rand -hex 32)" >> .env

# Verify
grep API_TOKEN .env
```

Start the API (runs the feeder cron + REST server):

```bash
npm run api
```

You should see:
```
🐱 Cat Feeder Alert starting
🏠 Home Assistant API listening on http://0.0.0.0:3000
```

### Run as a systemd service (recommended)

```bash
sudo tee /etc/systemd/system/pawsync-api.service > /dev/null <<EOF
[Unit]
Description=PawSync API for Home Assistant
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/eric/gmail-auto-task
ExecStart=/usr/bin/node src/api.js
Restart=always
RestartSec=10
EnvironmentFile=/home/eric/gmail-auto-task/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now pawsync-api
sudo systemctl status pawsync-api
```

## 3. Configure Home Assistant

### Copy the config snippets

The `homeassistant/` directory contains ready-to-use HA config files:

| File | What it does |
|------|-------------|
| `configuration.yaml` | REST sensors + commands + input helpers |
| `automations.yaml` | Schedule sync, offline alerts |
| `scripts.yaml` | One-tap feed chime & cha-ching scripts |
| `dashboard-card.yaml` | Lovelace card for the PawSync dashboard |

**Before copying**, edit the files and replace:
- `YOUR_PI_IP` → your Pi's local IP (e.g. `192.168.1.50`)
- `YOUR_API_TOKEN` → the token from your `.env`

Then merge the YAML into your HA config directory:

```bash
# If using the Docker install:
HA_CONFIG=/home/eric/ha-config

# Append the REST sensors, commands, and inputs to configuration.yaml
cat homeassistant/configuration.yaml >> $HA_CONFIG/configuration.yaml

# Copy automations and scripts (or merge if you already have some)
cp homeassistant/automations.yaml $HA_CONFIG/automations.yaml
cp homeassistant/scripts.yaml $HA_CONFIG/scripts.yaml
```

Restart HA to pick up the changes:
- Go to **Settings → System → Restart** in the HA UI, or:
```bash
docker restart homeassistant
```

### Add the dashboard card

1. Open your HA dashboard
2. Click the three dots → **Edit Dashboard**
3. Click **+ Add Card** → **Manual**
4. Paste the contents of `homeassistant/dashboard-card.yaml`

## 4. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (no auth) |
| `GET` | `/api/feeder/schedule` | Current feed times & volume |
| `PUT` | `/api/feeder/schedule` | Update schedule `{times[], volume?}` |
| `POST` | `/api/feeder/chime` | Play feeder triangle chime now |
| `POST` | `/api/sonos/chaching` | Play cha-ching sound `{volume?}` |

All endpoints except `/api/health` require `Authorization: Bearer <token>`.

### Quick test

```bash
TOKEN=$(grep API_TOKEN .env | cut -d= -f2)

# Health check
curl http://localhost:3000/api/health

# Get schedule
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/feeder/schedule

# Play chime
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/feeder/chime

# Update schedule
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"times":["06:00","14:00","18:00"],"volume":25}' \
  http://localhost:3000/api/feeder/schedule
```
