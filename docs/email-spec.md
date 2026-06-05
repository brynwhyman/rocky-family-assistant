# Rocky Email Skill

Rocky email v1 is designed for logistics and household admin, not open-ended autonomous correspondence.

## Initial capabilities

- save or update email contacts
- send a new email
- reply to the latest known thread
- summarize unread inbox activity
- watch or unwatch a thread
- summarize the latest thread

## Supported command shapes

- `email Harry and ask if Friday at 7 works`
- `Harry's email is harry@example.com`
- `save harry@example.com for Harry`
- `send Julia an email saying I'm running 10 minutes late`
- `reply that Tuesday works for us`
- `summarize my inbox`
- `show me unread emails from Harry`
- `keep an eye on that thread`
- `stop watching that thread`
- `summarize that thread`

## Safety posture

- Rocky can send direct emails you explicitly ask for.
- Rocky can reply directly to simple logistics threads.
- Rocky should always report back in WhatsApp about what came in or what it sent.
- Rocky writes as Rocky, acting as a household assistant rather than impersonating a person.
- Rocky should not be relied on yet for nuanced, sensitive, financial, or legal communication.

## Auth

Rocky uses the official Gmail API and its own Google OAuth refresh token.

Use:

```bash
npm run gmail:auth
```

Then copy the printed `GOOGLE_EMAIL_REFRESH_TOKEN` into `.env` and set:

```bash
GOOGLE_EMAIL_ENABLED=true
GOOGLE_EMAIL_WATCHER_INTERVAL_MS=60000
```
