# Setup Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Claude Code CLI installed and available on `PATH`, or `CLAUDE_BIN` set in `.env`
- Optional: OpenClaw, if you want WhatsApp delivery instead of local webhook testing

## 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` as needed:
- Set `WHATSAPP_SELF_JID` to a safe fallback JID for local testing or your own self-chat JID for WhatsApp use.
- Adjust `AMAZON_BASE_URL` if you shop in a different Amazon region.
- Set `CLAUDE_BIN` only if the `claude` executable is not already on your `PATH`.

## 3. Create a reusable Amazon browser session

```bash
npm run amazon:login
```

This opens Chromium using Rocky's dedicated persistent profile under `state/browser-profiles/`. Sign in to Amazon, verify the cart experience works, then close the browser window to save the session.

## 4. Run the server

```bash
npm run dev
```

The server listens on `http://127.0.0.1:3457`.

## 5. Test locally without WhatsApp

```bash
bash scripts/test-message.sh "add milk, eggs and bananas"
```

This posts directly to the webhook endpoint and is the recommended first-run path for contributors.

## Optional: connect OpenClaw for WhatsApp

Install OpenClaw separately, pair WhatsApp there, and configure its webhook URL to:

```text
http://127.0.0.1:3457/webhook/whatsapp
```

If the `openclaw` binary is not on `PATH`, set:

```bash
OPENCLAW_BIN=/absolute/path/to/openclaw
```

## Optional: enable Google Calendar

1. Create a Google Cloud OAuth client for a Desktop app with Calendar API access.
2. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
3. Run `npm run google:auth`.
4. Copy the printed `GOOGLE_REFRESH_TOKEN` into `.env`.
5. Set `GOOGLE_CALENDAR_ENABLED=true`.

## Optional: enable Gmail

1. Reuse your Google OAuth client or create one with Gmail scopes.
2. Put the email client credentials in `.env`, or reuse the shared Google keys.
3. Run `npm run gmail:auth`.
4. Copy the printed `GOOGLE_EMAIL_REFRESH_TOKEN` into `.env`.
5. Set `GOOGLE_EMAIL_ENABLED=true`.
