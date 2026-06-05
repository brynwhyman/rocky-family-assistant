import { execFile } from "child_process";
import { promisify } from "util";
import { appLogger } from "../util/logging";

const execFileAsync = promisify(execFile);
const openclawBin = process.env.OPENCLAW_BIN ?? "openclaw";

export async function sendReply(jid: string, text: string): Promise<void> {
  const target = normalizeTarget(jid);
  const chunks = chunkMessage(text);

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]!;

    try {
      const { stdout } = await execFileAsync(
        openclawBin,
        ["message", "send", "--target", target, "--message", chunk, "--json"],
        {
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
          env: { ...process.env, TERM: "dumb" },
        }
      );

      appLogger.info("Reply sent", {
        jid,
        target,
        chunk: i + 1,
        chunkCount: chunks.length,
        preview: chunk.slice(0, 60),
        result: stdout.trim().slice(0, 200),
      });
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      throw new Error(`OpenClaw CLI send failed: ${details}`);
    }
  }
}

export function normalizeTarget(jid: string): string {
  if (jid.includes("@g.us")) {
    return jid;
  }

  const digits = jid.replace(/[^\d]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function chunkMessage(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [""];
  if (normalized.length <= 1400) return [normalized];

  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= 1400) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= 1400) {
      current = paragraph;
      continue;
    }

    const lines = paragraph.split("\n");
    let lineChunk = "";
    for (const line of lines) {
      const candidate = lineChunk ? `${lineChunk}\n${line}` : line;
      if (candidate.length <= 1400) {
        lineChunk = candidate;
      } else {
        if (lineChunk) chunks.push(lineChunk);
        lineChunk = line;
      }
    }
    if (lineChunk) {
      current = lineChunk;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
