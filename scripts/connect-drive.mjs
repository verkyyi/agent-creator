#!/usr/bin/env node
// Admin path for Google Drive: get a Drive refresh token with the existing DESKTOP ("installed")
// OAuth client and store it in the macOS Keychain as GOOGLE_DRIVE_REFRESH_TOKEN (account crewbrain).
// The server (scripts/start.sh) loads it and hands it to the HydraDB connector.
//
//   node scripts/connect-drive.mjs            # store in this Mac's Keychain
//   node scripts/connect-drive.mjs --push-mini # also store it in the mini's GUI-session Keychain
//
// The client JSON is read at runtime from SSM (never written to disk or printed); the loopback
// flow uses PKCE, scope drive.readonly, access_type=offline, prompt=consent. Secrets go to
// `security -i` on stdin, never argv. Output is only "stored".
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PARAM = process.env.GOOGLE_OAUTH_SSM_PARAM ?? "/always-on-claude/gmail-mcp/google-oauth-client-json";
const PROFILE = process.env.GOOGLE_OAUTH_SSM_PROFILE ?? "default";
const REGION = process.env.GOOGLE_OAUTH_SSM_REGION ?? "us-east-1";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const MINI = process.env.MINI_HOST ?? "macmini.tail435588.ts.net";

function clientFromSsm() {
  const raw = execFileSync("aws", ["ssm", "get-parameter", "--profile", PROFILE, "--region", REGION, "--name", PARAM, "--with-decryption", "--query", "Parameter.Value", "--output", "text"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const j = JSON.parse(raw);
  const c = j.installed ?? j.web;
  if (!c?.client_id || !c?.client_secret) throw new Error("the SSM parameter has no client_id/client_secret");
  return { id: c.client_id, secret: c.client_secret };
}

const b64u = (b) => b.toString("base64url");
// A value for `security -i`: double-quoted, with quotes and backslashes escaped.
const q = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const addCmd = (token) => `add-generic-password -U -a crewbrain -s GOOGLE_DRIVE_REFRESH_TOKEN -w ${q(token)}\n`;

function securityStdin(cmd, args = ["-i"], bin = "security") {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["pipe", "ignore", "inherit"] });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
    p.stdin.end(cmd);
  });
}

async function main() {
  const client = clientFromSsm();
  const verifier = b64u(randomBytes(32));
  const challenge = b64u(createHash("sha256").update(verifier).digest());
  const state = b64u(randomBytes(16));

  const code = await new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname !== "/") { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
      res.writeHead(ok ? 200 : 400, { "content-type": "text/plain" }).end(ok ? "CrewBrain: Google Drive connected. You can close this tab." : "CrewBrain: sign-in failed.");
      srv.close();
      ok ? resolve(u.searchParams.get("code")) : reject(new Error(u.searchParams.get("error") ?? "bad state"));
    });
    srv.listen(0, "127.0.0.1", () => {
      const redirect = `http://127.0.0.1:${srv.address().port}/`;
      srv.redirect = redirect;
      const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: client.id, redirect_uri: redirect, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent",
        code_challenge: challenge, code_challenge_method: "S256", state,
      });
      console.log("Opening Google sign-in in your browser…");
      try { execFileSync("open", [url]); } catch { console.log(`Open this URL:\n${url}`); }
    });
    setTimeout(() => { srv.close(); reject(new Error("timed out after 5 minutes")); }, 5 * 60_000).unref();
    globalThis.__srv = srv;
  });

  const redirect = globalThis.__srv.redirect;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) throw new Error(`token exchange failed (${r.status} ${j.error ?? ""})`);

  await securityStdin(addCmd(j.refresh_token));
  if (process.argv.includes("--push-mini")) {
    await securityStdin(addCmd(j.refresh_token), [MINI, "sudo -n launchctl asuser 501 sudo -n -u verkyyi security -i"], "ssh");
  }
  console.log("stored");
}

main().catch((e) => { console.error(`connect-drive: ${e.message}`); process.exit(1); });
