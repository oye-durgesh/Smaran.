# Smaran Bolna — "Your voice. Their care."

Family medicine-reminder app. One administrator, one phone, many family profiles.
Reminders become due on the server, the app shows an incoming "Sathi" call screen, and **only after Answer** the
existing ElevenLabs agent (Mummy or Papa) is started. No transcripts, no recordings, no phone calls.

## Node.js version (required)

Use **Node.js 22 LTS** (for example 22.14.x). Do not use Node 24 or Node 26.

`better-sqlite3@11.10.0` is installed in the **server** workspace. That release ships Windows prebuilt binaries for Node 22, so `npm install` does not need Visual Studio / `node-gyp`. Node 26 has no matching prebuild, so install falls back to a native rebuild and fails.

The repo pins this with `engines` in each `package.json`, `.nvmrc`, `.node-version`, and `.npmrc` (`engine-strict=true`).

### Windows: install Node 22 LTS, reinstall, start

1. Uninstall Node.js 26 (or any non-22 version) from **Settings → Apps**, or keep it only if you use nvm-windows to switch versions.
2. Download **Windows Installer (.msi) x64** for **22 LTS** from [https://nodejs.org/en/download](https://nodejs.org/en/download) (choose “LTS” / 22.x).
3. Run the installer. Leave **npm** checked. Finish, then **close every PowerShell, CMD, and Cursor terminal**.
4. Open a **new** PowerShell and confirm:
   ```
   node -v
   npm.cmd -v
   ```
   `node -v` must start with `v22.`. If PowerShell says scripts are disabled, always use `npm.cmd` instead of `npm`.
5. Go to the project folder:
   ```
   cd "C:\Users\shukl\Downloads\bolna smaran"
   ```
6. Remove old installs (this does not delete source or `data/` databases):
   ```
   if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
   if (Test-Path server\node_modules) { Remove-Item -Recurse -Force server\node_modules }
   if (Test-Path web\node_modules) { Remove-Item -Recurse -Force web\node_modules }
   ```
7. Install from the **repo root** (workspaces install `server` and `web` together):
   ```
   npm.cmd install
   ```
8. Copy env if needed, then production build and start:
   ```
   copy .env.example .env
   npm.cmd run build
   npm.cmd start
   ```
9. Open **http://localhost:8787**

Development mode (API on 8787, Vite on 5173): `npm.cmd run dev`

## Run it
```
npm install
cp .env.example .env     # then fill in the three ElevenLabs values
npm run build            # builds the app
npm start                # http://localhost:8787
npm test                 # automated tests (simulated clock, fake ElevenLabs)
npm run dev              # development mode (API 8787 + app 5173)
```
The original design export is in `project/` and `chats/` (visual source of truth); its instructions are in `HANDOFF-README.md`.

## Configuration (server `.env` only, never in the browser)
| Value | Where to get it |
|---|---|
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile → API Keys |
| `MUMMY_ELEVENLABS_AGENT_ID` | elevenlabs.io → Agents → Mummy agent → Agent ID |
| `PAPA_ELEVENLABS_AGENT_ID` | same, for the Papa agent |

Agents are chosen automatically from the family member's name (`Mummy` → Mummy agent, `Papa` → Papa agent; Dadi and others: none).
The app never creates or edits agents.

## Known limits
- **Locked phone / closed app:** the server scheduler runs continuously, but the incoming-call screen is shown by the app,
  which checks every 10 s while open and when you return to it. Closed-app Web Push (VAPID keys + service worker) is **not built yet**.
- **Structured outcome:** the app listens for a client tool named `report_medicine_outcome` (`outcome`: taken / not_taken /
  follow_up / unconfirmed, optional `follow_up_minutes`). Your existing agents need that tool added in ElevenLabs for the
  result to arrive automatically. Without it the call ends as *unconfirmed*, nothing is marked taken, and the administrator
  taps the real result on the outcome screen.
- The real ElevenLabs connection is **untested** (no credentials here). Everything up to the signed-URL request is tested.
- Voice-based health-reading entry (optional in the brief) is not built; manual entry is.
