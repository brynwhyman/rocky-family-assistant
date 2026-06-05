# Rocky Family Assistant

Rocky started as a fun project to see if I could use AI to save a bit of time. It turned into something I now use every week as a personal family assistant.

The assistant has a name. Rocky.

I can text Rocky on WhatsApp, either privately or in a group chat with my wife, and ask it to do things like add eggs to the grocery list, create a calendar invite for the three of us and someone we're meeting in two weeks, and send emails and continue conversations on my behalf.

Groceries is the most helpful. Integrated with Amazon, I spend the week sending Rocky items for the list. When I'm ready, I tell it to place the order and the next day the groceries turn up, and all I need to do is open the gate and bring them inside.

I've open-sourced this because it works well for me, and I'd genuinely love to see other people try it out too.

For my NZ friends, in January 2026 I created something more basic for New World shopping. [Groceries](https://github.com/brynwhyman/groceries) is a CLI tool that an agent can use to order groceries on your behalf.

## What Rocky does

- builds up an Amazon grocery order through the week
- adds, removes, and reviews items through natural language
- creates Google Calendar events
- sends simple logistics emails and replies to the latest thread
- can be used over WhatsApp through OpenClaw, or tested locally through the webhook

The main safety rule is simple: nothing gets ordered without an explicit final confirmation.

## A few example messages

| Message | What happens |
|---------|-------------|
| `add milk, eggs, bananas` | Adds items to the Amazon cart |
| `remove sparkling water` | Removes an item from the Amazon cart |
| `what's in my cart?` | Returns the current cart summary |
| `review my cart` | Returns a fuller cart review |
| `place order` | Shows the final cart summary and asks for confirmation |
| `confirm order` | Places the order |
| `cancel` | Clears a pending confirmation |
| `put dinner with Alex on the calendar for Friday at 7pm` | Creates a calendar event |
| `email Taylor and ask if Friday at 7 works` | Sends a simple logistics email |
| `reply that Tuesday works for us` | Replies to the latest known email thread |
| `summarize my inbox` | Summarizes recent unread inbox activity |

## How it works

Rocky is purposefully narrow.

Much of it is not AI-powered at all.

- common grocery requests are handled with built-in parsing first
- there is hard-coded handling for ordinary phrases like `a couple apples` or `a few lemons`
- I have also hard-coded some preferences, so meat, dairy, and eggs default to organic
- real actions happen locally through Playwright and official Google APIs, so I am not burning tokens just to click buttons or create calendar events
- only the messier language falls back to AI when Rocky needs help understanding what I am actually asking for

The AI bit is slightly cheeky. I am basically hacking into Claude Code CLI and using the built-in model there rather than wiring this up to the Claude API directly. That means all of the AI-powered parts are routed through my normal Claude subscription instead of a separate API account with per-use billing.

Maybe Anthropic close that loophole one day. For now it works for me, and it is a lot cheaper than paying API prices for a family assistant.

I did not want this to be a vague general AI demo. I wanted something small, useful, and trustworthy enough to actually use in family life.

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run amazon:login
npm run dev
```

Then in another terminal:

```bash
bash scripts/test-message.sh "add milk, eggs, bananas"
```

That local webhook path is the easiest way to try the project without setting up any messaging integration first.

## Optional integrations

### OpenClaw

OpenClaw is not included in this repo. If you want Rocky to receive and send WhatsApp messages through OpenClaw, install it separately and point its webhook at:

```text
http://127.0.0.1:3457/webhook/whatsapp
```

If `openclaw` is not on your `PATH`, set `OPENCLAW_BIN` in `.env`.

### Google Calendar

1. Create a Google Cloud OAuth client for a Desktop app with Calendar API access.
2. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
3. Run `npm run google:auth`.
4. Copy the printed `GOOGLE_REFRESH_TOKEN` into `.env`.
5. Set `GOOGLE_CALENDAR_ENABLED=true`.

### Gmail

1. Reuse your Google OAuth client or create one with Gmail scopes.
2. Put `GOOGLE_EMAIL_CLIENT_ID` and `GOOGLE_EMAIL_CLIENT_SECRET` in `.env`, or reuse the shared Google keys.
3. Run `npm run gmail:auth`.
4. Copy the printed `GOOGLE_EMAIL_REFRESH_TOKEN` into `.env`.
5. Set `GOOGLE_EMAIL_ENABLED=true`.

## Project shape

- [Product spec](SPEC.md)
- [Architecture](docs/architecture.md)
- [Setup](docs/setup.md)
- [Operations](docs/operations.md)
- [Email spec](docs/email-spec.md)
- [OpenClaw integration notes](docs/integrations/openclaw.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Development

```bash
npm test
npm run build
```
