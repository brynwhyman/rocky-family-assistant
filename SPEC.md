# Grocery Assistant Spec

## Product goal

A WhatsApp-based family grocery assistant that can update an Amazon cart, explain what it inferred, and place the final order only after sending a clear WhatsApp cart summary.

## UX principles

- Sound like a trusted family assistant, not a branded bot.
- Give immediate feedback that the message was received.
- Prefer better answers over raw speed, but keep normal interactions under 15 seconds when possible.
- Default to reasonable guesses and say what was inferred instead of stopping the flow.
- Keep a reviewable trail in WhatsApp so the user can trust what is about to be ordered.

## Tone

Short, calm, practical.

Good acknowledgement examples:
- Got it, I'm on it.
- On it, I'll update the cart.
- I've got it.
- Working on it now.

Avoid playful assistant branding or exaggerated tone.

## Core flows

### Add / remove / view cart

1. Send a short acknowledgement right away.
2. Update or inspect the cart.
3. Reply with:
   - exactly what changed
   - what was inferred
   - the current cart summary
   - a cart link

### Order placement

1. User says `place order`.
2. Assistant sends a final WhatsApp summary of exactly what is in the cart.
3. Include any guesses or defaults that were applied.
4. Include a cart link.
5. Only place the final order after explicit confirmation.

## Confidence policy

- Guess by default when the guess is reasonable.
- Always say what was inferred.
- Only stop to ask when the interpretation would be risky or highly ambiguous.

## Interpretation rules

### Quantities

- `a couple` = 2
- `a few` = 3
- unspecified quantity = 1

### Defaults

- `bananas` = 1 bunch
- `chicken breast` = 1 pack
- simple pantry/produce requests should map to preference-backed defaults when available

### Organic defaults

All meat, eggs, and dairy should default to organic.

If organic is unavailable, choose the closest sensible option and say so in the summary.

## Parsing strategy

Use deterministic parsing first for common flows:
- `add ...`
- `remove ...`
- `what's in my cart`
- `review my cart`
- `place order`
- `confirm order`
- `cancel`

Only use Claude CLI for messier free-form requests that deterministic parsing cannot confidently map.

## Definition of done for V1

For a message like `add a few lemons, chicken breast, eggs` the assistant should:
- acknowledge receipt immediately
- interpret `a few lemons` as 3 lemons
- interpret `chicken breast` as 1 pack
- default chicken breast and eggs to organic
- update the Amazon cart
- send a WhatsApp summary of exactly what was added
- include a cart link

For checkout, the assistant should:
- send a final cart summary in WhatsApp
- include any guesses/defaults applied
- include a cart link
- only place the order after explicit confirmation
