import { config } from "../app/config";
import { CalendarEventDraft, ExecutorResult } from "../types/grocery";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GoogleEventResponse {
  htmlLink?: string;
}

export async function createCalendarEvent(event: CalendarEventDraft): Promise<ExecutorResult> {
  if (!config.googleCalendar.enabled) {
    return {
      status: "blocked",
      message:
        "I haven't been connected to Rocky's calendar yet. Once you connect the Google account, I can start putting things on the calendar.",
      cart: null,
      blockedReason: "calendar_not_configured",
    };
  }

  const accessToken = await getGoogleAccessToken();
  const created = await insertCalendarEvent(accessToken, event);
  const summary = formatEventSummary(event);
  const inviteText =
    event.attendees.length > 0
      ? ` I invited ${formatAttendees(event.attendees)} too.`
      : "";
  const linkText = created.htmlLink ? `\n\nCalendar: ${created.htmlLink}` : "";

  return {
    status: "ok",
    message: `Got it — I put ${summary} on the calendar.${inviteText}${linkText}`,
    cart: null,
  };
}

async function getGoogleAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleCalendar.clientId,
      client_secret: config.googleCalendar.clientSecret,
      refresh_token: config.googleCalendar.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token refresh failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as GoogleTokenResponse;
  if (!json.access_token) {
    throw new Error("Google token refresh returned no access token");
  }
  return json.access_token;
}

async function insertCalendarEvent(
  accessToken: string,
  event: CalendarEventDraft
): Promise<GoogleEventResponse> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.googleCalendar.calendarId)}/events?sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.notes ?? undefined,
        location: event.location ?? undefined,
        start: {
          dateTime: event.startIso,
          timeZone: event.timeZone,
        },
        end: {
          dateTime: event.endIso,
          timeZone: event.timeZone,
        },
        attendees: event.attendees.map((email) => ({ email })),
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google event creation failed: ${response.status} ${body.slice(0, 200)}`);
  }

  return (await response.json()) as GoogleEventResponse;
}

function formatEventSummary(event: CalendarEventDraft): string {
  const start = new Date(event.startIso);
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timeZone,
  });

  return `"${event.title}" for ${formatter.format(start)}`;
}

function formatAttendees(attendees: string[]): string {
  if (attendees.length === 1) return attendees[0]!;
  if (attendees.length === 2) return `${attendees[0]} and ${attendees[1]}`;
  return `${attendees.slice(0, -1).join(", ")}, and ${attendees.at(-1)}`;
}
