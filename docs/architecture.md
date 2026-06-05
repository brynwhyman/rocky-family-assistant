# Architecture

## Overview

```text
Inbound message or local test
        │
        ▼
  Local server              localhost:3457   src/app/server.ts
        │
        ├─► Router           src/app/routing.ts
        ├─► Planner          src/planner/claude.ts
        │     └─ returns structured GroceryAction
        └─► Executor         src/executor/
              ├─ amazon.ts   add/remove/view/checkout
              ├─ cart.ts     cart helpers
              ├─ checkout.ts explicit confirmation gate
              ├─ calendar.ts Google Calendar integration
              └─ email.ts    Gmail integration
```

## Key design decisions

### Deterministic first, model second

Common commands are handled with deterministic parsers first. Rocky only falls back to Claude Code CLI when the request is too messy for the rule-based path.

### Local executor

Browser automation is fully local. Playwright uses a dedicated persistent profile under `state/browser-profiles/<profile>` so Amazon sessions can survive restarts without mixing with normal browsing.

### Explicit checkout gate

`checkout` is never called automatically. Order placement requires an explicit follow-up such as `confirm order`, and the server stores pending confirmation state between messages.

### Transport adapter boundary

The core app can be exercised locally with `scripts/test-message.sh`. Messaging bridges such as OpenClaw sit outside the core repo and can call `POST /webhook/whatsapp` for inbound traffic while Rocky uses an injected `sendReply` implementation for outbound replies.

## Happy path

1. A message reaches Rocky through the local test helper or a messaging bridge.
2. The server routes the message and extracts the user text.
3. Rocky loads sender session state and preferences.
4. The planner returns a structured action.
5. Guardrails decide whether the action is allowed immediately or needs confirmation.
6. The executor performs the action locally.
7. Rocky saves updated session state and sends a reply.

## Guardrail stops

The executor halts and asks for help on:
- login or sign-in pages
- OTP or 2FA prompts
- CAPTCHA pages
- payment or address changes without explicit confirmation
- unexpected browser state

## Optional integrations

- OpenClaw can be installed separately to bridge Rocky to WhatsApp.
- Google Calendar adds event creation and attendee support.
- Gmail adds sending, replying, inbox summaries, and watched-thread notifications.
