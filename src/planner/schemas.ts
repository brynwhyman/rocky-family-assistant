import { z } from "zod";

export const GroceryItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive().default(1),
  unit: z.string().nullable().default(null),
  brand: z.string().nullable().default(null),
  size: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const CalendarEventSchema = z.object({
  title: z.string(),
  startIso: z.string(),
  endIso: z.string(),
  timeZone: z.string(),
  attendees: z.array(z.string().email()).default([]),
  location: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const EmailActionSchema = z.object({
  to: z.array(z.string().email()).default([]),
  contactQuery: z.string().nullable().default(null),
  subject: z.string().nullable().default(null),
  body: z.string().nullable().default(null),
  filter: z.string().nullable().default(null),
  threadId: z.string().nullable().default(null),
});

export const GroceryActionSchema = z.object({
  action: z.enum([
    "add_items",
    "remove_items",
    "view_cart",
    "review_cart",
    "create_calendar_event",
    "send_email",
    "save_email_contact",
    "reply_email",
    "summarize_inbox",
    "watch_email_thread",
    "unwatch_email_thread",
    "summarize_email_thread",
    "checkout",
    "cancel",
    "unknown",
  ]),
  items: z.array(GroceryItemSchema).default([]),
  calendarEvent: CalendarEventSchema.nullable().default(null),
  email: EmailActionSchema.nullable().default(null),
  confirmed: z.boolean().default(false),
  clarification_needed: z.string().nullable().default(null),
  raw_message: z.string(),
});

export type GroceryActionParsed = z.infer<typeof GroceryActionSchema>;
