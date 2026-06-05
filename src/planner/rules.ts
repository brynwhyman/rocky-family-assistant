import { GroceryAction, GroceryItem, Session } from "../types/grocery";

const VIEW_PATTERNS = ["what's in my cart", "whats in my cart", "what is in my cart", "view cart", "show cart"];
const REVIEW_PATTERNS = ["review my cart", "review cart", "check my cart"];
const CHECKOUT_PATTERNS = ["place order", "checkout", "order now", "submit order"];
const CONFIRM_PATTERNS = ["confirm order", "confirm checkout", "yes place order", "yes, place order"];
const CANCEL_PATTERNS = ["cancel", "never mind", "nevermind", "stop"];
const HELP_PATTERNS = [
  "what can you do",
  "what do you do",
  "how can you help",
  "help",
  "what can rocky do",
  "what do you help with",
];
const GREETING_PATTERNS = [
  "hey",
  "hi",
  "hello",
  "yo",
  "hiya",
  "hey rocky",
  "hi rocky",
  "hello rocky",
];
const GROUP_ONBOARDING_PATTERNS = [
  /(?:we(?:'re| are)|i(?:'m| am))\s+adding\s+([a-z][a-z\s'-]{0,40}?)\s+to\s+the\s+group(?:\s+chat)?/i,
  /(?:we(?:'re| are)|i(?:'m| am))\s+inviting\s+([a-z][a-z\s'-]{0,40}?)\s+to\s+the\s+group(?:\s+chat)?/i,
];

const DAIRY_KEYWORDS = ["milk", "cheese", "yogurt", "butter", "cream", "kefir", "half and half", "cream cheese", "ice cream"];
const EGG_KEYWORDS = ["egg", "eggs"];
const MEAT_KEYWORDS = ["chicken", "beef", "steak", "pork", "lamb", "turkey", "sausage", "bacon", "meat"];

const PROTECTED_PHRASES: Array<{ pattern: RegExp; token: string; restored: string }> = [
  {
    pattern: /ben\s+(?:and|&)\s+jerr(?:y|i)['’]s/gi,
    token: "ben_jerrys",
    restored: "ben and jerry's",
  },
];

export function parseDeterministicAction(text: string, session: Session): GroceryAction | null {
  const raw = text.trim();
  const normalized = normalize(raw);

  if (!normalized) return null;

  if (VIEW_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return emptyAction("view_cart", raw);
  }

  if (REVIEW_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return emptyAction("review_cart", raw);
  }

  if (CANCEL_PATTERNS.includes(normalized)) {
    return emptyAction("cancel", raw);
  }

  if (session.pendingConfirmation && CONFIRM_PATTERNS.includes(normalized)) {
    return {
      action: "checkout",
      items: [],
      calendarEvent: null,
      email: null,
      confirmed: true,
      clarification_needed: null,
      raw_message: raw,
    };
  }

  if (CHECKOUT_PATTERNS.includes(normalized)) {
    return {
      action: "checkout",
      items: [],
      calendarEvent: null,
      email: null,
      confirmed: false,
      clarification_needed: null,
      raw_message: raw,
    };
  }

  if (normalized.startsWith("add ")) {
    return {
      action: "add_items",
      items: parseItems(raw.slice(4)),
      calendarEvent: null,
      email: null,
      confirmed: false,
      clarification_needed: null,
      raw_message: raw,
    };
  }

  if (normalized.startsWith("remove ")) {
    return {
      action: "remove_items",
      items: parseItems(raw.slice(7), { removal: true }),
      calendarEvent: null,
      email: null,
      confirmed: false,
      clarification_needed: null,
      raw_message: raw,
    };
  }

  return null;
}

export function looksLikeExplicitCommand(text: string, session?: Session): boolean {
  const normalized = normalize(text.trim());
  if (!normalized) return false;

  if (VIEW_PATTERNS.some((pattern) => normalized.includes(pattern))) return true;
  if (REVIEW_PATTERNS.some((pattern) => normalized.includes(pattern))) return true;
  if (CANCEL_PATTERNS.includes(normalized)) return true;
  if (CHECKOUT_PATTERNS.includes(normalized)) return true;
  if (CONFIRM_PATTERNS.includes(normalized)) return true;
  if (normalized.startsWith("add ")) return true;
  if (normalized.startsWith("remove ")) return true;
  if (session?.pendingConfirmation && /^confirm\b/.test(normalized)) return true;

  return false;
}

export function isHelpRequest(text: string): boolean {
  const normalized = normalize(text.trim());
  if (!normalized) return false;
  return HELP_PATTERNS.includes(normalized);
}

export function isGreetingRequest(text: string): boolean {
  const normalized = normalize(text.trim());
  if (!normalized) return false;
  return GREETING_PATTERNS.includes(normalized);
}

export function extractGroupOnboardingName(text: string): string | null {
  const trimmed = text.trim();
  for (const pattern of GROUP_ONBOARDING_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return toDisplayName(match[1]);
    }
  }
  return null;
}

function emptyAction(action: GroceryAction["action"], raw: string): GroceryAction {
  return {
    action,
    items: [],
    calendarEvent: null,
    email: null,
    confirmed: false,
    clarification_needed: null,
    raw_message: raw,
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDisplayName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseItems(value: string, options?: { removal?: boolean }): GroceryItem[] {
  return splitItemPhrases(value)
    .map((phrase) => buildItemFromPhrase(phrase, options))
    .filter((item): item is GroceryItem => item !== null);
}

function splitItemPhrases(value: string): string[] {
  let working = value.toLowerCase().replace(/[’]/g, "'").trim();

  for (const protectedPhrase of PROTECTED_PHRASES) {
    working = working.replace(protectedPhrase.pattern, protectedPhrase.token);
  }

  const parts = working
    .replace(/\s*,\s*/g, ",")
    .split(",")
    .flatMap((part) => splitOnListAnd(part))
    .map((part) => restoreProtectedPhrases(part.trim()))
    .filter(Boolean);

  return parts;
}

function splitOnListAnd(part: string): string[] {
  if (!part.includes(" and ")) return [part];

  const pieces = part.split(/\s+and\s+/g).map((piece) => piece.trim()).filter(Boolean);
  return pieces.length > 1 ? pieces : [part];
}

function restoreProtectedPhrases(value: string): string {
  let restored = value;
  for (const protectedPhrase of PROTECTED_PHRASES) {
    restored = restored.replaceAll(protectedPhrase.token, protectedPhrase.restored);
  }
  return restored;
}

function buildItemFromPhrase(rawPhrase: string, options?: { removal?: boolean }): GroceryItem | null {
  const phrase = normalize(rawPhrase);
  if (!phrase) return null;

  let working = phrase;
  let quantity = 1;
  let unit: string | null = null;
  const notes: string[] = [];

  if (working.startsWith("a few ")) {
    quantity = 3;
    notes.push('Interpreted "a few" as 3.');
    working = working.slice("a few ".length);
  } else if (working.startsWith("a couple of ")) {
    quantity = 2;
    notes.push('Interpreted "a couple" as 2.');
    working = working.slice("a couple of ".length);
  } else if (working.startsWith("a couple ")) {
    quantity = 2;
    notes.push('Interpreted "a couple" as 2.');
    working = working.slice("a couple ".length);
  } else {
    const numeric = working.match(/^(\d+)\s+(.+)$/);
    if (numeric) {
      quantity = parseInt(numeric[1], 10);
      working = numeric[2];
    }
  }

  working = working.replace(/^(some|the|an|a)\s+/, "").trim();
  if (!working) return null;

  if (!options?.removal && /\bbanana(s)?\b/.test(working)) {
    unit = "bunch";
    notes.push("Interpreted bananas as 1 bunch.");
    working = "bananas";
  }

  if (!options?.removal && /\bchicken breast\b/.test(working)) {
    unit = unit ?? "pack";
    notes.push("Interpreted chicken breast as 1 pack.");
    working = "chicken breast";
  }

  const category = inferCategory(working);
  if (!options?.removal && category) {
    notes.push(`Will default ${category} items to organic.`);
  }

  return {
    name: singularizeIfNeeded(working),
    quantity,
    unit,
    brand: null,
    size: null,
    notes: notes.length > 0 ? notes.join(" ") : null,
  };
}

function inferCategory(value: string): "meat" | "eggs" | "dairy" | null {
  if (EGG_KEYWORDS.some((keyword) => value.includes(keyword))) return "eggs";
  if (MEAT_KEYWORDS.some((keyword) => value.includes(keyword))) return "meat";
  if (DAIRY_KEYWORDS.some((keyword) => value.includes(keyword))) return "dairy";
  return null;
}

function singularizeIfNeeded(value: string): string {
  if (value === "eggs") return "eggs";
  if (value === "bananas") return "bananas";
  if (value === "lemons") return "lemons";
  return value;
}
