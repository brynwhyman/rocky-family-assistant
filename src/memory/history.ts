import fs from "fs/promises";
import path from "path";
import { Session } from "../types/grocery";
import { config } from "../app/config";

const sessionsDir = path.join(config.paths.state, "sessions");

function sessionPath(jid: string): string {
  // Sanitise JID for use as a filename
  const safe = jid.replace(/[^a-zA-Z0-9@._-]/g, "_");
  return path.join(sessionsDir, `${safe}.json`);
}

export async function loadSession(jid: string): Promise<Session> {
  try {
    const raw = await fs.readFile(sessionPath(jid), "utf-8");
    const parsed = JSON.parse(raw) as Partial<Session>;
    return {
      jid: parsed.jid ?? jid,
      pendingConfirmation: parsed.pendingConfirmation ?? false,
      pendingCart: parsed.pendingCart ?? null,
      lastEmailThreadId: parsed.lastEmailThreadId ?? null,
      lastMessageAt: parsed.lastMessageAt ?? new Date().toISOString(),
      lastSummary: parsed.lastSummary ?? null,
    };
  } catch {
    return {
      jid,
      pendingConfirmation: false,
      pendingCart: null,
      lastEmailThreadId: null,
      lastMessageAt: new Date().toISOString(),
      lastSummary: null,
    };
  }
}

export async function saveSession(session: Session): Promise<void> {
  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(
    sessionPath(session.jid),
    JSON.stringify(session, null, 2),
    "utf-8"
  );
}

export async function clearSession(jid: string): Promise<void> {
  try {
    await fs.unlink(sessionPath(jid));
  } catch {
    // Nothing to clear
  }
}

export async function listSessions(): Promise<Session[]> {
  try {
    const files = await fs.readdir(sessionsDir);
    const sessions = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          try {
            const raw = await fs.readFile(path.join(sessionsDir, file), "utf-8");
            const parsed = JSON.parse(raw) as Partial<Session>;
            if (!parsed.jid) return null;
            return {
              jid: parsed.jid,
              pendingConfirmation: parsed.pendingConfirmation ?? false,
              pendingCart: parsed.pendingCart ?? null,
              lastEmailThreadId: parsed.lastEmailThreadId ?? null,
              lastMessageAt: parsed.lastMessageAt ?? new Date().toISOString(),
              lastSummary: parsed.lastSummary ?? null,
            } satisfies Session;
          } catch {
            return null;
          }
        })
    );

    return sessions.filter((session): session is Session => Boolean(session));
  } catch {
    return [];
  }
}
