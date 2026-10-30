# Smaran Bolna — "Your voice. Their care."

One family medicine-reminder app. One administrator, one phone, many family profiles.
Reminders become due on the server. The app shows an incoming **Sathi** screen. **Only after Answer** does the existing ElevenLabs agent (Mummy or Papa) start. No transcripts, no recordings, no phone calls.

This repository is **one Next.js app** that deploys as **one Vercel project** (website + API together).

## What you need

1. **Node.js 22 LTS** on your computer (not Node 26).
2. An **ElevenLabs API key** starting with `sk_` and the two existing agent IDs (Mummy and Papa).
3. For the live internet site: a **free Postgres database** (Neon is easiest) and a **Vercel** account.

Your local SQLite file in `data/` is never deleted and is never uploaded to GitHub.

## Run on your computer (Windows)

```
cd "C:\Users\shukl\Downloads\bolna smaran"
copy .env.example .env.local
```

Put your real `sk_` key and agent IDs into `.env.local`. Leave `DATABASE_URL` empty to use the local SQLite file.

```
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Open **http://localhost:8787**

Voice check (does not start a call):

```
npm.cmd run check:voice -- --live
```

## Database

| Where | Database |
|---|---|
| Your PC, `DATABASE_URL` empty | SQLite file `data/smaran.db` |
| Vercel production | **PostgreSQL** via `DATABASE_URL` (required). Not SQLite. |

Create a free database: [neon.tech](https://neon.tech) → New project → copy the connection string (it starts with `postgresql://`).

## Reminders on Vercel

There is no always-on server. Due reminders are recorded when:

1. **You open the app** — `/api/incoming` and `/api/today` run the scheduler. This is how on-time in-app reminders work.
2. **Once a day** — Vercel Hobby Cron calls `/api/cron/tick` at `00:00 UTC` (`vercel.json`). Hobby does **not** allow hourly or per-minute Cron.

A once-daily Cron **cannot** fire at each medicine time. It is only a daily backup to record overdue slots in the database. It does not show the incoming screen, start ElevenLabs, or mean a reminder was delivered.

**If the phone is locked or the app is closed**, the incoming call screen cannot appear until you open Smaran Bolna again. This app does **not** claim a notification was delivered in that case.

## Deploy to Vercel (simple)

1. Open [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New → Project** → import **oye-durgesh/Smaran.** (this repository).
3. Leave **Root Directory** as `.` (the repository root). Framework: Next.js.
4. Add these **Environment Variables** (Production):

   - `ELEVENLABS_API_KEY` — your `sk_…` secret
   - `MUMMY_ELEVENLABS_AGENT_ID`
   - `PAPA_ELEVENLABS_AGENT_ID`
   - `DATABASE_URL` — the Postgres connection string from Neon
   - `AUTH_SECRET` — any long random password you invent
   - `CRON_SECRET` — another long random password
   - `APP_URL` — after the first deploy, set this to `https://your-app.vercel.app`

5. Click **Deploy**.
6. Open the URL Vercel shows you.

Never put `NEXT_PUBLIC_` in front of the ElevenLabs key. Never paste secrets into GitHub.

## Call rules (unchanged)

1. Reminder becomes due.
2. Incoming screen only.
3. **Answer** asks the server for a signed ElevenLabs session, then the existing agent speaks.
4. **Decline** never starts ElevenLabs.
5. Answering does **not** mark medicine taken.

Dadi has no agent. Durgesh does not need one. Mummy and Papa keep their existing ElevenLabs configuration; this app does not change their prompts, voices or language.
