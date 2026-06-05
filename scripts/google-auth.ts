import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const port = parseInt(process.env.GOOGLE_OAUTH_PORT ?? "4589", 10);
const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
const scopes = ["https://www.googleapis.com/auth/calendar.events"];

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");
authUrl.searchParams.set("scope", scopes.join(" "));
authUrl.searchParams.set("state", state);

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname !== "/oauth2/callback") {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.statusCode = 400;
    res.end(`Google returned an error: ${error}`);
    console.error(`Google returned an error: ${error}`);
    shutdown(1);
    return;
  }

  if (!code || returnedState !== state) {
    res.statusCode = 400;
    res.end("Invalid OAuth callback.");
    console.error("OAuth callback was missing code or had invalid state.");
    shutdown(1);
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const text = await tokenResponse.text();
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${text}`);
    }

    const json = JSON.parse(text) as { refresh_token?: string };
    if (!json.refresh_token) {
      throw new Error("No refresh token returned. Try revoking access and running again.");
    }

    res.end("Rocky is connected to Google Calendar. You can close this tab.");
    console.log("\nCopy this into your .env:\n");
    console.log(`GOOGLE_CALENDAR_ENABLED=true`);
    console.log(`GOOGLE_REFRESH_TOKEN=${json.refresh_token}`);
    shutdown(0);
  } catch (err) {
    res.statusCode = 500;
    res.end("Token exchange failed. Check the terminal for details.");
    console.error(String(err));
    shutdown(1);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Open this URL to connect Rocky's Google account:\n\n${authUrl.toString()}\n`);
});

function shutdown(code: number) {
  server.close(() => process.exit(code));
}
