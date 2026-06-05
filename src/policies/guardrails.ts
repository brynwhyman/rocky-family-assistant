import { GroceryAction, Session, UserPreferences } from "../types/grocery";

export interface GuardrailResult {
  allowed: boolean;
  needsConfirmation: boolean;
  reason: string | null;
}

// ── Actions that require explicit checkout confirmation ────────────────────────

const CHECKOUT_ACTIONS = new Set(["checkout"]);

// ── Main guardrail check ───────────────────────────────────────────────────────

export function checkGuardrails(
  action: GroceryAction,
  session: Session,
  prefs: UserPreferences
): GuardrailResult {
  // Checkout gate: requires confirmed=true
  if (CHECKOUT_ACTIONS.has(action.action)) {
    if (!action.confirmed) {
      // Not yet confirmed — ask the user for explicit confirmation
      return {
        allowed: false,
        needsConfirmation: true,
        reason: null,
      };
    }

    if (!session.pendingConfirmation) {
      // confirmed=true but we never sent a confirmation prompt
      // (e.g. the user typed "confirm order" without a pending cart)
      return {
        allowed: false,
        needsConfirmation: false,
        reason:
          "There's no pending order to confirm. " +
          "Say \"review my cart\" first, then reply \"confirm order\".",
      };
    }

    // Both confirmed=true and pendingConfirmation=true → allow
    return { allowed: true, needsConfirmation: false, reason: null };
  }

  // All other actions (add, remove, view, review, cancel) are allowed
  return { allowed: true, needsConfirmation: false, reason: null };
}

// ── Total safety check (called from executor after cart read) ─────────────────

export function isTotalSafe(
  estimatedTotal: number | null,
  prefs: UserPreferences
): boolean {
  if (estimatedTotal == null) return true;
  return estimatedTotal <= prefs.maxOrderTotalUSD;
}
