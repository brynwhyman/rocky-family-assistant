// ── Core domain types ──────────────────────────────────────────────────────────

export type GroceryActionType =
  | "add_items"
  | "remove_items"
  | "view_cart"
  | "review_cart"
  | "create_calendar_event"
  | "send_email"
  | "save_email_contact"
  | "reply_email"
  | "summarize_inbox"
  | "watch_email_thread"
  | "unwatch_email_thread"
  | "summarize_email_thread"
  | "checkout"
  | "cancel"
  | "unknown";

export interface GroceryItem {
  name: string;
  quantity: number;
  unit: string | null;
  brand: string | null;
  size: string | null;
  notes: string | null;
}

export interface GroceryAction {
  action: GroceryActionType;
  items: GroceryItem[];
  calendarEvent: CalendarEventDraft | null;
  email: EmailActionPayload | null;
  confirmed: boolean;
  clarification_needed: string | null;
  raw_message: string;
}

export interface CalendarEventDraft {
  title: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  attendees: string[];
  location: string | null;
  notes: string | null;
}

export interface EmailDraft {
  to: string[];
  subject: string;
  body: string;
  cc: string[];
}

export interface EmailSummaryItem {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string | null;
  unread: boolean;
}

export interface EmailWatch {
  threadId: string;
  label: string;
  createdAt: string;
  notifyJid: string;
  lastSeenMessageId: string | null;
  lastNotifiedMessageId: string | null;
}

export interface EmailActionPayload {
  to: string[];
  contactQuery: string | null;
  subject: string | null;
  body: string | null;
  filter: string | null;
  threadId: string | null;
}

// ── Cart types ─────────────────────────────────────────────────────────────────

export interface CartItem {
  name: string;
  brand: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  url: string | null;
}

export interface CartSummary {
  items: CartItem[];
  estimatedTotal: number | null;
  currency: string;
  itemCount: number;
}

// ── Executor result types ──────────────────────────────────────────────────────

export type ExecutorStatus =
  | "ok"
  | "blocked"
  | "needs_clarification"
  | "error";

export interface ExecutorResult {
  status: ExecutorStatus;
  message: string;
  cart: CartSummary | null;
  emailThreadId?: string;
  blockedReason?: string;
}

// ── Session types ──────────────────────────────────────────────────────────────

export interface Session {
  jid: string;
  pendingConfirmation: boolean;
  pendingCart: CartSummary | null;
  lastEmailThreadId: string | null;
  lastMessageAt: string;
  lastSummary: string | null;
}

// ── Preferences types ─────────────────────────────────────────────────────────

export type SubstitutionPolicy = "ask" | "allow" | "deny";

export interface ItemDefault {
  searchTerm: string;
  category?: string;
}

export interface UserPreferences {
  organicPreference: boolean;
  organicCategories: string[];       // e.g. ["dairy","eggs","meat"]
  deliveryPreference: "delivery" | "pickup";
  substitutionPolicy: SubstitutionPolicy;
  maxOrderTotalUSD: number;
  brands: Record<string, string | null>;
  sizes: Record<string, string | null>;
  itemDefaults: Record<string, ItemDefault>;
  avoid: string[];
}

export interface EmailContact {
  name: string;
  email: string;
}

// ── WhatsApp / OpenClaw types ──────────────────────────────────────────────────

export interface InboundMessage {
  jid: string;
  text: string;
  timestamp: number;
  messageId: string;
}
