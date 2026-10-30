import { agentConfigFromEnv } from '@/lib/server/agents';
import { tick } from '@/lib/server/engine';
import { getDb } from '@/lib/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Vercel Hobby allows one Cron Job per day (not hourly).
 * This records due reminders in the database. It does not ring the phone
 * and does not guarantee medicine times. Exact-time incoming screens still
 * require the app to be open (/api/today and /api/incoming run tick()).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization') ?? '';
  if (secret && auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = await getDb();
  await tick(db, () => new Date());
  void agentConfigFromEnv;
  return Response.json({ ok: true, ticked: true });
}
