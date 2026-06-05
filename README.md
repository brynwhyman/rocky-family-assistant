# Rocky Family Assistant

Rocky is a local-first family assistant for the ordinary logistics that quietly eat up a week: groceries, calendar coordination, and lightweight email follow-up.

The project is intentionally practical. It uses deterministic parsing where reliability matters, Claude Code CLI when requests get messier, Playwright for local browser automation, and official Google APIs for calendar and Gmail features. The goal is not to feel magical. The goal is to be useful, predictable, and safe enough to trust with real household tasks.

**Nothing is ordered without an explicit final confirmation.**

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run amazon:login
npm run dev
```

In a second terminal, send a local test message without any messaging bridge:

```bash
bash scripts/test-message.sh "add milk, eggs, bananas"
```

## What Rocky can do

- Manage an Amazon cart through natural-language add, remove, and review flows
- Create calendar events with dates, times, and default attendees
- Send simple logistics emails and reply to the latest known thread
- Keep the assistant local-first while delegating only specific tasks to outside services

## Optional integrations

### OpenClaw

OpenClaw is not bundled in this repo. If you want Rocky to receive and send WhatsApp messages through OpenClaw, install OpenClaw separately and point its webhook at:

```text
http://127.0.0.1:3457/webhook/whatsapp
```

Set `OPENCLAW_BIN` in `.env` if the `openclaw` executable is not already on your `PATH`.

### Google Calendar

1. Create a Google Cloud OAuth client for a Desktop app with Calendar API access.
2. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
3. Run `npm run google:auth`.
4. Approve access and copy the printed `GOOGLE_REFRESH_TOKEN` into `.env`.
5. Set `GOOGLE_CALENDAR_ENABLED=true`.

### Gmail

1. Reuse your Google OAuth client or create one with Gmail scopes.
2. Put `GOOGLE_EMAIL_CLIENT_ID` and `GOOGLE_EMAIL_CLIENT_SECRET` in `.env`, or reuse the shared Google keys.
3. Run `npm run gmail:auth`.
4. Approve access and copy the printed `GOOGLE_EMAIL_REFRESH_TOKEN` into `.env`.
5. Set `GOOGLE_EMAIL_ENABLED=true`.

## Example commands

| Message | What happens |
|---------|-------------|
| `add milk, eggs, bananas` | Adds items to the Amazon cart |
| `remove sparkling water` | Removes an item from the Amazon cart |
| `what's in my cart?` | Returns the current cart summary |
| `review my cart` | Returns a fuller cart review |
| `place order` | Sends the final cart summary and waits for confirmation |
| `confirm order` | Places the order |
| `cancel` | Clears a pending confirmation |
| `put dinner with Alex on the calendar for Friday at 7pm` | Creates a calendar event and invites default attendees |
| `email Taylor and ask if Friday at 7 works` | Sends a simple logistics email |
| `Taylor's email is taylor@example.com` | Saves a known email contact |
| `reply that Tuesday works for us` | Replies to the latest known email thread |
| `summarize my inbox` | Summarizes recent unread inbox activity |

## How it is built

Rocky is built as a small, opinionated system rather than a general-purpose agent.

- Deterministic parsing handles common commands quickly and transparently
- Claude Code CLI is used as a fallback for language that does not fit the narrow parser
- Playwright drives local browser actions for Amazon flows
- Google Calendar and Gmail integrations use the official APIs and OAuth flows
- Confirmation gates are kept explicit for actions with real-world consequences

## Docs

- [Product spec](SPEC.md)
- [Architecture](docs/architecture.md)
- [Setup](docs/setup.md)
- [Operations](docs/operations.md)
- [Email spec](docs/email-spec.md)
- [OpenClaw integration notes](docs/integrations/openclaw.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Tests

```bash
npm run test:unit
npm run test:integration
npm test
```

## Contributing

If you want to build on this, keep it practical. Small, readable changes beat clever ones. Issues and pull requests are welcome, especially around reliability, safety, and making the local-first workflow easier to understand.
