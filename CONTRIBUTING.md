# Contributing

Thanks for taking a look at Rocky.

This project is opinionated on purpose. It is trying to be a useful, local-first assistant for real household tasks, not a general demo of everything AI can do. The best contributions usually make it more reliable, easier to reason about, or easier for someone new to run.

## Good contribution areas

- Clearer setup and debugging docs
- Better tests around parsing, guardrails, and browser automation
- Safer defaults for actions with real-world consequences
- Cleaner adapter boundaries for optional integrations
- Simpler local development workflows

## Before opening a pull request

1. Run `npm test`.
2. Run `npm run build`.
3. Keep changes focused and explain the tradeoffs in plain language.
4. If the change affects ordering, email, or calendar behavior, call out user-facing risks clearly.

## Style

- Prefer small, readable changes over broad refactors.
- Keep the tone practical and direct.
- Avoid adding “magical AI” framing where ordinary software design is doing the real work.
- Preserve explicit confirmation gates for sensitive actions.

## Reporting bugs

When possible, include:

- what you expected to happen
- what actually happened
- the exact message or command you used
- relevant logs or screenshots
- whether the issue is in local testing or through an optional integration such as OpenClaw

## Security

Please do not open public issues for secrets, tokens, account data, or anything that could expose a live integration. Use the process in [SECURITY.md](SECURITY.md) instead.
