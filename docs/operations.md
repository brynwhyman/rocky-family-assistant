# Operations

## Daily use

### Start the server

```bash
npm run dev
```

### Run a local smoke test

```bash
bash scripts/test-message.sh "what's in my cart?"
```

### View logs

```bash
tail -f state/logs/app.log
tail -f state/logs/executor.log
```

## Session reset

Delete the sender-specific session file in `state/sessions/` if you want to clear a conversation's pending confirmation or last-known cart summary.

## Browser session reset

Delete the relevant profile folder under `state/browser-profiles/` if you want to start over with a fresh Amazon login.

## Security notes

- The server binds to localhost by default.
- `.env` and `state/` should never be committed.
- The browser profile may contain authenticated session data; treat it like a credential.
- `place order` always requires a second explicit `confirm order` message.
- The executor stops on CAPTCHA, OTP, login prompts, and unexpected page state.
