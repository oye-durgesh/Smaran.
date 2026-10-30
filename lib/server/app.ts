import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DB } from './db.js';
import { AgentConfig, AgentError, agentKeyFor, getSignedUrl } from './agents.js';
import { OUTCOMES, applyOutcome, claimForCall, dashboard, decline, failCall, getSetting, setState, tick, uid } from './engine.js';
import { clearDemo, loadDemo, resetDemo } from './seed.js';
import { Clock, istParts } from './time.js';

type Fetch = Parameters<typeof getSignedUrl>[2];
export interface AppDeps { db: DB; clock?: Clock; agents: AgentConfig; fetchFn?: Fetch }

const hash = (s: string) => {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return createHmac('sha256', secret).update(s).digest('hex');
  return createHash('sha256').update(s).digest('hex');
};
const wrap = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bool = z.boolean().transform(b => (b ? 1 : 0));

export function createApp({ db, clock = () => new Date(), agents, fetchFn }: AppDeps) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  const nowIso = () => clock().toISOString();
  const badRequest = (res: Response, e: z.ZodError) => res.status(400).json({ error: 'invalid_request', details: e.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
  const demoOf = async (memberId: string): Promise<number | null> => {
    const m = await db.prepare('SELECT is_demo FROM family_members WHERE id=?').get(memberId) as any;
    return m ? m.is_demo : null;
  };

  // ---------- account & auth (one administrator) ----------
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/account/status', wrap(async (_req, res) => res.json({ hasAccount: !!(await db.prepare(`SELECT 1 FROM app_settings WHERE key='account'`).get()) })));

  app.post('/api/account', wrap(async (req, res) => {
    if (await db.prepare(`SELECT 1 FROM app_settings WHERE key='account'`).get()) return res.status(409).json({ error: 'account_exists' });
    const p = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8), purpose: z.enum(['family', 'self']).optional() }).safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const salt = randomBytes(16).toString('hex');
    const pw = scryptSync(p.data.password, salt, 32).toString('hex');
    const token = randomBytes(32).toString('hex');
    const set = db.prepare('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)');
    await set.run('account', JSON.stringify({ name: p.data.name, email: p.data.email.toLowerCase(), salt, pw, purpose: p.data.purpose ?? 'family' }));
    await set.run('session', hash(token));
    res.status(201).json({ token, name: p.data.name });
  }));

  app.post('/api/login', wrap(async (req, res) => {
    const row = await db.prepare(`SELECT value FROM app_settings WHERE key='account'`).get() as any;
    const p = z.object({ email: z.string(), password: z.string() }).safeParse(req.body);
    if (!row || !p.success) return res.status(401).json({ error: 'invalid_credentials' });
    const a = JSON.parse(row.value);
    const ok = a.email === p.data.email.toLowerCase() &&
      timingSafeEqual(Buffer.from(scryptSync(p.data.password, a.salt, 32).toString('hex')), Buffer.from(a.pw));
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    const token = randomBytes(32).toString('hex');
    await db.prepare('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)').run('session', hash(token));
    res.json({ token, name: a.name });
  }));

  app.use('/api', (req, res, next) => { void (async () => {
    const t = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const row = await db.prepare(`SELECT value FROM app_settings WHERE key='session'`).get() as any;
    if (!t || !row || hash(t) !== row.value) return res.status(401).json({ error: 'unauthorized' });
    next();
  })().catch(next);
  });

  app.get('/api/me', wrap(async (_req, res) => {
    const a = JSON.parse((await db.prepare(`SELECT value FROM app_settings WHERE key='account'`).get() as any).value);
    res.json({ name: a.name, email: a.email, purpose: a.purpose });
  }));
  app.delete('/api/account', wrap(async (_req, res) => {
    // Full data deletion: everything, including the account.
    for (const t of ['reminder_outcomes', 'reminders', 'medicines', 'health_readings', 'appointments', 'family_members', 'app_settings']) await db.prepare(`DELETE FROM ${t}`).run();
    res.json({ ok: true });
  }));

  // ---------- family ----------
  app.get('/api/family', wrap(async (_req, res) => res.json(await db.prepare('SELECT id,name,relationship,avatar,notes,is_demo, (agent_key IS NOT NULL) AS has_voice FROM family_members ORDER BY created_at, id').all())));
  app.post('/api/family', wrap(async (req, res) => {
    const p = z.object({ name: z.string().min(1).max(60), relationship: z.string().min(1).max(40), notes: z.string().max(500).optional(), avatar: z.string().max(10).optional() }).safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const id = uid();
    await db.prepare('INSERT INTO family_members (id,name,relationship,avatar,notes,agent_key,is_demo,created_at) VALUES (?,?,?,?,?,?,0,?)')
      .run(id, p.data.name, p.data.relationship, p.data.avatar ?? null, p.data.notes ?? null, agentKeyFor(p.data.name), nowIso());
    res.status(201).json({ id });
  }));
  app.patch('/api/family/:id', wrap(async (req, res) => {
    const p = z.object({ name: z.string().min(1).max(60), relationship: z.string().min(1).max(40), notes: z.string().max(500).nullable().optional() }).safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const r = await db.prepare('UPDATE family_members SET name=?, relationship=?, notes=? WHERE id=?').run(p.data.name, p.data.relationship, p.data.notes ?? null, req.params.id);
    res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
  }));
  // Removal is explicit: the client must send confirm=true. It removes only this member's own records.
  app.delete('/api/family/:id', wrap(async (req, res) => {
    if (req.query.confirm !== 'true') return res.status(400).json({ error: 'confirmation_required' });
    const r = await db.prepare('DELETE FROM family_members WHERE id=?').run(req.params.id);
    res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
  }));

  // ---------- medicines ----------
  const medicineBody = z.object({
    member_id: z.string(), name: z.string().min(1).max(80), strength: z.string().max(40).optional(), dosage: z.string().max(60).optional(),
    dose_units: z.number().int().min(1).max(10).default(1),
    frequency: z.enum(['once_daily', 'twice_daily', 'three_daily', 'custom']),
    times: z.array(z.string()).max(8).default([]),
    food: z.enum(['before', 'after', 'with', 'not_specified']).default('not_specified'),
    start_date: date.optional(), end_date: date.optional(),
    stock_qty: z.number().int().min(0).default(0), stock_unit: z.string().max(20).default('tablets'),
    low_stock_threshold: z.number().int().min(0).default(5),
    status: z.enum(['active', 'discontinued']).default('active'),
  });
  app.get('/api/medicines', wrap(async (req, res) => {
    const rows = await db.prepare(`SELECT * FROM medicines ${req.query.member_id ? 'WHERE member_id=?' : ''} ORDER BY name`).all(...(req.query.member_id ? [req.query.member_id] : [])) as any[];
    res.json(rows.map(m => ({ ...m, times: JSON.parse(m.times), low_stock: m.stock_qty <= m.low_stock_threshold })));
  }));
  app.post('/api/medicines', wrap(async (req, res) => {
    const p = medicineBody.safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const demo = await demoOf(p.data.member_id);
    if (demo === null) return res.status(404).json({ error: 'member_not_found' });
    const d = p.data, id = uid();
    await db.prepare(`INSERT INTO medicines (id,member_id,name,strength,dosage,dose_units,frequency,times,food,start_date,end_date,stock_qty,stock_unit,low_stock_threshold,status,is_demo,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, d.member_id, d.name, d.strength ?? null, d.dosage ?? null, d.dose_units, d.frequency, JSON.stringify(d.times), d.food, d.start_date ?? null, d.end_date ?? null, d.stock_qty, d.stock_unit, d.low_stock_threshold, d.status, demo, nowIso());
    res.status(201).json({ id });
  }));
  app.patch('/api/medicines/:id', wrap(async (req, res) => {
    const p = medicineBody.omit({ member_id: true }).partial().safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const cur = await db.prepare('SELECT * FROM medicines WHERE id=?').get(req.params.id) as any;
    if (!cur) return res.status(404).json({ error: 'not_found' });
    const d = { ...cur, ...p.data, times: JSON.stringify(p.data.times ?? JSON.parse(cur.times)) };
    await db.prepare(`UPDATE medicines SET name=?,strength=?,dosage=?,dose_units=?,frequency=?,times=?,food=?,start_date=?,end_date=?,stock_qty=?,stock_unit=?,low_stock_threshold=?,status=? WHERE id=?`)
      .run(d.name, d.strength, d.dosage, d.dose_units, d.frequency, d.times, d.food, d.start_date, d.end_date, d.stock_qty, d.stock_unit, d.low_stock_threshold, d.status, req.params.id);
    res.json({ ok: true });
  }));
  app.delete('/api/medicines/:id', wrap(async (req, res) => { await db.prepare('DELETE FROM medicines WHERE id=?').run(req.params.id); res.json({ ok: true }); }));

  // ---------- reminders ----------
  const reminderBody = z.object({
    medicine_id: z.string(), time, repeat: z.enum(['once', 'daily', 'weekdays']),
    date: date.optional(), weekdays: z.array(z.number().int().min(0).max(6)).default([]),
    voice_enabled: z.boolean().default(true), conversation_enabled: z.boolean().default(true),
  }).refine(r => r.repeat !== 'once' || !!r.date, { message: 'date is required for one-time reminders', path: ['date'] })
    .refine(r => r.repeat !== 'weekdays' || r.weekdays.length > 0, { message: 'pick at least one weekday', path: ['weekdays'] });

  app.get('/api/reminders', wrap(async (_req, res) => {
    const rows = await db.prepare(`
    SELECT r.*, m.name AS medicine_name, m.strength, f.name AS member_name FROM reminders r
    JOIN medicines m ON m.id=r.medicine_id JOIN family_members f ON f.id=r.member_id WHERE r.status!='cancelled' ORDER BY r.time`).all() as any[];
    res.json(rows.map((r: any) => ({ ...r, weekdays: JSON.parse(r.weekdays) })));
  }));
  app.post('/api/reminders', wrap(async (req, res) => {
    const p = reminderBody.safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const med = await db.prepare('SELECT member_id,is_demo FROM medicines WHERE id=?').get(p.data.medicine_id) as any;
    if (!med) return res.status(404).json({ error: 'medicine_not_found' });
    if (req.body.member_id && req.body.member_id !== med.member_id) return res.status(400).json({ error: 'medicine_not_for_member' });
    const id = uid(), d = p.data;
    await db.prepare(`INSERT INTO reminders (id,member_id,medicine_id,time,repeat,date,weekdays,voice_enabled,conversation_enabled,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, med.member_id, d.medicine_id, d.time, d.repeat, d.date ?? null, JSON.stringify(d.weekdays), d.voice_enabled ? 1 : 0, d.conversation_enabled ? 1 : 0, med.is_demo, nowIso());
    await tick(db, clock);
    res.status(201).json({ id });
  }));
  app.patch('/api/reminders/:id', wrap(async (req, res) => {
    const p = z.object({ time: time.optional(), status: z.enum(['active', 'paused', 'cancelled']).optional(), repeat: z.enum(['once', 'daily', 'weekdays']).optional(), date: date.optional(), weekdays: z.array(z.number().int().min(0).max(6)).optional() }).safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const cur = await db.prepare('SELECT * FROM reminders WHERE id=?').get(req.params.id) as any;
    if (!cur) return res.status(404).json({ error: 'not_found' });
    const d = { ...cur, ...p.data, weekdays: JSON.stringify(p.data.weekdays ?? JSON.parse(cur.weekdays)) };
    await db.prepare('UPDATE reminders SET time=?,status=?,repeat=?,date=?,weekdays=? WHERE id=?').run(d.time, d.status, d.repeat, d.date, d.weekdays, req.params.id);
    // A changed time/pause must not leave a stale, not-yet-due occurrence behind.
    if (p.data.time || p.data.status === 'paused' || p.data.status === 'cancelled')
      await db.prepare(`DELETE FROM reminder_outcomes WHERE reminder_id=? AND state='scheduled'`).run(req.params.id);
    await tick(db, clock);
    res.json({ ok: true });
  }));

  // ---------- occurrences: the scheduler, incoming UI and call lifecycle ----------
  const occQuery = `SELECT o.id,o.state,o.outcome,o.kind,o.scheduled_for,o.duration_sec,o.is_demo,
      f.id AS member_id, f.name AS member_name, f.relationship, (f.agent_key IS NOT NULL) AS has_voice,
      m.name AS medicine_name, m.strength, r.voice_enabled, r.conversation_enabled
    FROM reminder_outcomes o JOIN reminders r ON r.id=o.reminder_id
    JOIN family_members f ON f.id=r.member_id JOIN medicines m ON m.id=r.medicine_id`;

  app.get('/api/today', wrap(async (_req, res) => {
    await tick(db, clock);
    const { date: d } = istParts(clock());
    const day = new Date(d + 'T00:00:00+05:30');
    const rows = await db.prepare(`${occQuery} WHERE o.scheduled_for BETWEEN ? AND ? ORDER BY o.scheduled_for`)
      .all(day.toISOString(), new Date(day.getTime() + 86400000 - 1).toISOString());
    res.json({ stats: await dashboard(db, clock), occurrences: rows, now: nowIso() });
  }));

  /** The app polls this. A returned row means "show the incoming reminder screen". It never starts a call. */
  app.get('/api/incoming', wrap(async (_req, res) => {
    await tick(db, clock);
    const row = await db.prepare(`${occQuery} WHERE o.state='due' AND r.voice_enabled=1 ORDER BY o.scheduled_for LIMIT 1`).get();
    res.json({ incoming: row ?? null });
  }));

  // Re-ring a reminder that was missed, declined, unclear or failed. Still only shows the incoming screen.
  app.post('/api/occurrences/:id/retry', wrap(async (req, res) => {
    const r = await db.prepare(`UPDATE reminder_outcomes SET state='due', rung_at=?, outcome=NULL, outcome_source=NULL, ended_at=NULL
      WHERE id=? AND state IN ('missed','declined','pending','failed')`).run(nowIso(), req.params.id);
    res.status(r.changes ? 200 : 409).json({ ok: !!r.changes });
  }));

  app.post('/api/occurrences/:id/decline', wrap(async (req, res) => {
    const r = await decline(db, req.params.id, clock);
    res.status(r.ok ? 200 : 409).json(r);
  }));

  // Event B: the ONLY place an ElevenLabs session is requested.
  app.post('/api/occurrences/:id/answer', wrap(async (req, res) => {
    const o = await db.prepare(`SELECT o.id, f.agent_key, r.conversation_enabled FROM reminder_outcomes o
      JOIN reminders r ON r.id=o.reminder_id JOIN family_members f ON f.id=r.member_id WHERE o.id=?`).get(req.params.id) as any;
    if (!o) return res.status(404).json({ error: 'not_found' });
    if (!o.conversation_enabled) return res.status(409).json({ error: 'conversation_disabled' });
    if (!o.agent_key) return res.status(422).json({ error: 'no_agent', message: 'No voice agent is configured for this family member.' });
    if (!await claimForCall(db, o.id, clock)) return res.status(409).json({ error: 'already_active_or_not_due' });
    try {
      const signedUrl = await getSignedUrl(o.agent_key, agents, fetchFn);
      res.json({ signedUrl, occurrence: await db.prepare(`${occQuery} WHERE o.id=?`).get(o.id) });
    } catch (e) {
      await failCall(db, o.id, clock);
      const code = e instanceof AgentError ? e.code : 'upstream';
      res.status(code === 'not_configured' ? 503 : 502).json({ error: code, message: e instanceof AgentError ? e.message : 'Voice service error.' });
    }
  }));

  app.post('/api/occurrences/:id/connected', wrap(async (req, res) => res.json({ ok: await setState(db, req.params.id, ['connecting'], 'connected') })));
  app.post('/api/occurrences/:id/processing', wrap(async (req, res) => res.json({ ok: await setState(db, req.params.id, ['connecting', 'connected'], 'processing') })));
  app.post('/api/occurrences/:id/failed', wrap(async (req, res) => { await failCall(db, req.params.id, clock); res.json({ ok: true }); }));

  app.post('/api/occurrences/:id/outcome', wrap(async (req, res) => {
    const p = z.object({ outcome: z.enum(OUTCOMES), source: z.enum(['agent', 'manual']).default('manual'), followUpMinutes: z.number().int().min(1).max(240).optional(), durationSec: z.number().int().min(0).max(7200).optional() }).strict().safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const r = await applyOutcome(db, req.params.id, p.data, clock);
    res.status(r.ok ? 200 : r.reason === 'not_found' ? 404 : 409).json(r);
  }));

  // ---------- health ----------
  const readingBody = z.object({
    member_id: z.string(), type: z.enum(['bp', 'glucose']),
    systolic: z.number().int().min(50).max(300).optional(), diastolic: z.number().int().min(30).max(200).optional(),
    glucose: z.number().min(10).max(1000).optional(), unit: z.string().max(10).optional(),
    measured_at: z.string().datetime(), note: z.string().max(200).optional(),
  }).refine(r => r.type !== 'bp' || (r.systolic && r.diastolic), { message: 'systolic and diastolic are required' })
    .refine(r => r.type !== 'glucose' || r.glucose !== undefined, { message: 'glucose value is required' });

  app.get('/api/readings', wrap(async (req, res) => {
    const days = Math.min(Number(req.query.days ?? 30), 366);
    const since = new Date(clock().getTime() - days * 86400000).toISOString();
    res.json(await db.prepare(`SELECT * FROM health_readings WHERE measured_at>=? ${req.query.member_id ? 'AND member_id=?' : ''} ORDER BY measured_at DESC`).all(since, ...(req.query.member_id ? [req.query.member_id] : [])));
  }));
  app.post('/api/readings', wrap(async (req, res) => {
    const p = readingBody.safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const demo = await demoOf(p.data.member_id);
    if (demo === null) return res.status(404).json({ error: 'member_not_found' });
    const d = p.data, id = uid();
    await db.prepare(`INSERT INTO health_readings (id,member_id,type,systolic,diastolic,glucose,unit,measured_at,note,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, d.member_id, d.type, d.systolic ?? null, d.diastolic ?? null, d.glucose ?? null, d.unit ?? (d.type === 'bp' ? 'mmHg' : 'mg/dL'), d.measured_at, d.note ?? null, demo, nowIso());
    res.status(201).json({ id });
  }));
  app.delete('/api/readings/:id', wrap(async (req, res) => { await db.prepare('DELETE FROM health_readings WHERE id=?').run(req.params.id); res.json({ ok: true }); }));

  // ---------- appointments ----------
  const apptBody = z.object({ member_id: z.string(), doctor: z.string().min(1).max(80), clinic: z.string().max(120).optional(), starts_at: z.string().datetime(), notes: z.string().max(500).optional(), voice_enabled: z.boolean().default(false) });
  app.get('/api/appointments', wrap(async (_req, res) => res.json(await db.prepare(`SELECT a.*, f.name AS member_name FROM appointments a JOIN family_members f ON f.id=a.member_id ORDER BY starts_at`).all())));
  app.post('/api/appointments', wrap(async (req, res) => {
    const p = apptBody.safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const demo = await demoOf(p.data.member_id);
    if (demo === null) return res.status(404).json({ error: 'member_not_found' });
    const d = p.data, id = uid();
    await db.prepare('INSERT INTO appointments (id,member_id,doctor,clinic,starts_at,notes,voice_enabled,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, d.member_id, d.doctor, d.clinic ?? null, d.starts_at, d.notes ?? null, d.voice_enabled ? 1 : 0, demo, nowIso());
    res.status(201).json({ id });
  }));
  app.patch('/api/appointments/:id', wrap(async (req, res) => {
    const p = apptBody.omit({ member_id: true }).partial().extend({ status: z.enum(['scheduled', 'cancelled']).optional() }).safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const cur = await db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id) as any;
    if (!cur) return res.status(404).json({ error: 'not_found' });
    const d = { ...cur, ...p.data, voice_enabled: p.data.voice_enabled === undefined ? cur.voice_enabled : p.data.voice_enabled ? 1 : 0 };
    await db.prepare('UPDATE appointments SET doctor=?,clinic=?,starts_at=?,notes=?,voice_enabled=?,status=? WHERE id=?').run(d.doctor, d.clinic, d.starts_at, d.notes, d.voice_enabled, d.status, req.params.id);
    res.json({ ok: true });
  }));

  // ---------- settings & demo ----------
  app.get('/api/settings', wrap(async (_req, res) => {
    res.json({
      retry_minutes: Number(await getSetting(db, 'retry_minutes', '10')),
      language: await getSetting(db, 'language', 'en'),
      notifications: await getSetting(db, 'notifications', 'on') === 'on',
      timezone: 'Asia/Kolkata',
      demo_loaded: Number((await db.prepare('SELECT COUNT(*) c FROM family_members WHERE is_demo=1').get() as any).c) > 0,
      voice_configured: { mummy: !!(agents.apiKey && agents.mummyAgentId), papa: !!(agents.apiKey && agents.papaAgentId) },
    });
  }));
  app.patch('/api/settings', wrap(async (req, res) => {
    const p = z.object({ retry_minutes: z.number().int().min(1).max(60).optional(), language: z.enum(['en', 'hi']).optional(), notifications: z.boolean().optional() }).safeParse(req.body);
    if (!p.success) return badRequest(res, p.error);
    const set = db.prepare('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)');
    if (p.data.retry_minutes) await set.run('retry_minutes', String(p.data.retry_minutes));
    if (p.data.language) await set.run('language', p.data.language);
    if (p.data.notifications !== undefined) await set.run('notifications', p.data.notifications ? 'on' : 'off');
    res.json({ ok: true });
  }));
  app.post('/api/demo/load', wrap(async (_req, res) => res.json({ loaded: await loadDemo(db, clock) })));
  app.post('/api/demo/reset', wrap(async (_req, res) => { await resetDemo(db, clock); res.json({ ok: true }); }));
  app.post('/api/demo/clear', wrap(async (_req, res) => { await clearDemo(db); res.json({ ok: true }); }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Never log request bodies. Only the error message.
    console.error('API error:', err instanceof Error ? err.message : 'unknown');
    res.status(500).json({ error: 'server_error' });
  });
  return app;
}
