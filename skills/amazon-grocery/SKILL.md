---
name: amazon-grocery
description: Hybrid WhatsApp grocery assistant — cloud planner + local Playwright executor. Converts free-text grocery messages into structured Amazon cart actions. Checkout requires explicit confirmation.
---

# Amazon Grocery Skill

This skill is invoked by the local server when a grocery message arrives.

## Supported actions

| Action | Trigger words |
|--------|--------------|
| `add_items` | "add", "get", "buy", "I need", "order" |
| `remove_items` | "remove", "take out", "delete", "cancel" |
| `view_cart` | "what's in my cart", "show cart", "cart" |
| `review_cart` | "review", "check cart", "full cart" |
| `checkout` | "place order", "submit order", "checkout now", "buy now" |
| `cancel` | "cancel", "never mind", "stop" |

## Checkout gate

`checkout` requires a two-step confirmation:

1. User says "place order" → server replies with cart summary + confirmation prompt.
2. User says "confirm order" → executor proceeds to checkout.

Any other response clears the pending confirmation and does nothing.

## Executor behaviour

The executor uses Playwright with a dedicated persistent Chromium profile so the
Amazon session can stay logged in between runs.

It stops and sends a help message on:
- Login / OTP / CAPTCHA pages
- Payment or address edit pages
- Unexpected page states
- Total exceeding `maxOrderTotalGBP` in `state/preferences.json`

## Preference resolution

Items are matched using `state/preferences.json`:
1. Brand preference (if set)
2. Size preference (if set)
3. Organic preference flag
4. First search result otherwise

Substitutions always ask unless a substitution rule exists in preferences.
