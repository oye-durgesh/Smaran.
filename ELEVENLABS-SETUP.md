# Connecting your two existing ElevenLabs agents

You do **not** create or change any agent's voice, language or prompt. You only (A) copy 3 values, and (B) add one small "tool"
to each agent so it can tell the app whether the medicine was taken.
The ElevenLabs screens change often, so button names below may differ slightly.

## A. Add the 3 values (about 5 minutes)
1. Open the file named `.env.example` in the project and save a copy named `.env` (same folder).
2. At elevenlabs.io: your profile picture → **API Keys** → create/copy a key → paste after `ELEVENLABS_API_KEY=`.
3. **Agents** → open the **Mummy** agent → copy its **Agent ID** → paste after `MUMMY_ELEVENLABS_AGENT_ID=`.
4. Open the **Papa** agent → copy its Agent ID → paste after `PAPA_ELEVENLABS_AGENT_ID=`.
5. Check: `npm run check:voice` (no call is made). All three lines should say OK.
6. Test the real link: `npm run check:voice -- --live`. It asks ElevenLabs to accept the key and agent IDs. **It does not start a call.**
   Tell me the result and I will mark this step as verified.

## B. Add the outcome tool to BOTH agents (this does not touch the prompt, voice or language)
In each agent: **Tools → Add tool → Client tool**, then fill in exactly:

- **Name:** `report_medicine_outcome`  (must match exactly)
- **Wait for response:** on
- **Description** (paste this; it tells the agent when to use the tool):
  > Call this once, at the end of the reminder, to report the result. Use "taken" ONLY if the person clearly says they have ALREADY taken this medicine. If they say they will take it later, are about to take it, or the answer is unclear, do NOT use "taken": use "follow_up" (they will take it later; set follow_up_minutes) or "unconfirmed" (unclear or no answer). Use "not_taken" if they clearly say they did not take it and will not now.
- **Parameters** (add two):
  1. `outcome` — type **String** — required — description: `One of: taken, not_taken, follow_up, unconfirmed`
  2. `follow_up_minutes` — type **Number** — not required — description: `Minutes until the next reminder, only for follow_up`

Save each agent. Nothing else about the agent changes.

## What the app guarantees (tested)
- The microphone and ElevenLabs start only after **Answer**. **Decline** never starts either.
- Medicine is marked **taken** only if the agent's tool says `taken` during a live call, or you tap "Yes, medicine taken".
  Answering the call, an unclear reply, or a dropped call never marks it taken.
- No transcript, text or audio is shown or saved. The app ignores all message events.
