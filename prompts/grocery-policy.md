# Grocery Policy

These rules are enforced by the executor and guardrails layer.

## Order confirmation

- `place order` or `checkout` always requires a second explicit message to proceed.
- Accepted confirmation phrases: `confirm order`, `place order now`, `submit order`,
  `checkout now`, `buy now`.
- "looks good", "ok", "yeah", "fine" are NOT sufficient to place an order.
- Confirmation must come in the same session. A new conversation clears any pending state.

## Substitutions

- If the requested item is unavailable, ask before substituting.
- If the user has a substitution preference recorded in `state/preferences.json`,
  apply it silently and mention it in the cart summary.
- Never silently substitute a more expensive item for a cheaper one without flagging it.

## Guardrail stops — halt and ask for help on

- Login / sign-in page
- OTP or 2FA prompt
- CAPTCHA
- Payment method edit page
- Address change page
- Any checkout page reached without explicit `confirmed: true`
- Basket total unexpectedly more than 50% higher than last known total
- Any page that does not look like a normal Amazon shopping flow

## Item preferences

Preferences are stored in `state/preferences.json`. When matching items:

1. Prefer the user's stated brand if available.
2. Prefer the user's stated size if available.
3. Prefer organic if `organicPreference: true`.
4. Use first search result if no preference is set.

## Response style

- Keep replies short — one or two sentences plus a bullet-list cart summary.
- Use plain text, no markdown formatting (WhatsApp renders it poorly).
- Quantities and prices should be on one line per item.
- End every cart summary with the estimated total if visible.
- Always tell the user what you did, not what you are going to do.
