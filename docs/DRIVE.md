# Google Drive → company brain

An owner connects one real Google Drive folder. HydraDB's `google_drive` connector syncs it into
the tenant's database (`crewbrain_<tenant>`), in a collection that belongs to that sandbox alone
(`drive_<sandboxId>`), and copies each file's Drive sharing (permission capture).

- The folder's resource rule is **Office only** (`__private__`), so nothing reaches a helper until
  the owner relabels a file in the Brain view (that sends `PATCH /context/{id}/metadata` with the
  new acl, mapped like `aclFor()`).
- Per HydraDB, a file's own Drive sharing wins over the folder rule: "Files shared with anyone or
  with a customer in Drive keep that sharing." CrewBrain still applies its own check on top: a
  helper only uses a Drive file whose CrewBrain lock lets its audience in.
- `acl_warning` (from `GET /connectors/{id}/status`, or on a file) is shown to the owner as is.
- The refresh token goes to HydraDB once (connector credentials) and is never stored by CrewBrain.

## Where it is allowed

Only in a real workspace, never the public demo. Both must hold:

1. `ALLOW_REAL_CONNECTORS=1` in the server's environment, and
2. an owner flag: `"realConnectors": true` on the owner in the sandbox JSON, or the sandbox id
   listed in `REAL_CONNECTOR_SANDBOXES` (comma-separated; `default` for the legacy sandbox).

Otherwise the button and the creator's `connect_drive` card say "Available in your own CrewBrain
workspace" and no OAuth starts.

## Two ways to connect

### A. Admin path (works today with the existing desktop client)

The current OAuth client (SSM `/always-on-claude/gmail-mcp/google-oauth-client-json`, profile
`default`, us-east-1, GCP project `gen-lang-client-0295065839`) is a **Desktop ("installed")
client** whose only redirect is `http://localhost`. It cannot serve the web callback below.

```sh
node scripts/connect-drive.mjs              # consent in the browser, stores the token in this Mac's Keychain
node scripts/connect-drive.mjs --push-mini  # also into the mini's GUI-session Keychain
```

It reads the client JSON from SSM at runtime (never written or printed), runs the loopback flow
(`http://127.0.0.1:<random port>/`, PKCE, `drive.readonly`, `access_type=offline`,
`prompt=consent`) and stores `GOOGLE_DRIVE_REFRESH_TOKEN` via `security -i` on stdin. It prints only
`stored`. With that token loaded, "Connect Google Drive" skips Google sign-in and goes straight to
the folder picker.

### B. Web flow (needs a Web application client)

1. Google Cloud console → APIs & Services → Credentials → Create credentials → OAuth client ID →
   **Web application**.
2. Authorized redirect URI:
   `https://macmini.tail435588.ts.net:10000/crewbrain/oauth/google/callback`
   (override with `GOOGLE_OAUTH_REDIRECT_URI`).
3. Store the client in the Keychain:
   `security add-generic-password -U -a crewbrain -s GOOGLE_OAUTH_CLIENT_ID -w`
   `security add-generic-password -U -a crewbrain -s GOOGLE_OAUTH_CLIENT_SECRET -w`
   (`-w` last with no value prompts, so the secret never lands in shell history).
4. Do not store `GOOGLE_DRIVE_REFRESH_TOKEN`, or the server uses the admin path instead.

The flow: authorization code, `access_type=offline`, `prompt=consent`, scope
`https://www.googleapis.com/auth/drive.readonly`; `state` is single-use, expires in 10 minutes and
is bound to the owner's session, member and sandbox.

## Google Cloud project checklist

- **Google Drive API** enabled in the project (APIs & Services → Library → Google Drive API).
- OAuth consent screen: if its publishing status is **Testing**, the Google account that connects
  must be listed under **Test users**. Testing-mode refresh tokens expire after 7 days; publish the
  app (or reconnect) for a lasting connection.
- Scope `drive.readonly` is required. Optional
  `admin.directory.group.member.readonly` (Workspace admin only) expands Google Group shares; without
  it a file shared only with a group is visible to nobody in HydraDB.

## Keychain items (account `crewbrain`), loaded by `scripts/start.sh`

| Item | Needed for |
| - | - |
| `HYDRA_DB_API_KEY` | everything HydraDB |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | optional; when absent, start.sh reads them from the SSM parameter above |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | admin path (written by `scripts/connect-drive.mjs`) |

## API (owner session)

- `GET /api/drive`: availability, connection state, folders while picking, file count, `aclWarning`
  (polls HydraDB status at most every 10 s; when active, mirrors synced files as local records).
- `POST /api/drive/connect`: `{ url }` to Google, or the connection (admin path).
- `POST /api/drive/folder` `{ folderId }`: configure that one folder with acl `["__private__"]`.
- `GET /oauth/google/callback`: Google's redirect target.
