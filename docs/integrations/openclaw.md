# OpenClaw Integration

OpenClaw is optional and is not bundled with this repository.

Use it only if you want Rocky to receive and send WhatsApp messages through an external gateway instead of local webhook tests.

## What Rocky expects

- OpenClaw should forward inbound WhatsApp messages to `http://127.0.0.1:3457/webhook/whatsapp`.
- The `openclaw` CLI should be available on `PATH`, or `OPENCLAW_BIN` should point to it explicitly.

## Why it is separate

- OpenClaw is an external dependency with its own installation and pairing flow.
- This repo does not ship gateway config dumps, local tokens, paired-device state, or operator-specific launch scripts.
- Keeping the integration separate makes the core Rocky project easier to audit and publish.
