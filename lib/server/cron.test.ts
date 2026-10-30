import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { GET as cronTick } from '../../app/api/cron/tick/route';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { tick } from './engine.js';
import { fromIst } from './time.js';

describe('duplicate reminder prevention', () => {
  it('tick twice does not create two primary occurrences for the same slot', async () => {
    const db = await openDb(':memory:');
    const now = fromIst('2026-10-30', '10:00');
    await db.prepare(`INSERT INTO family_members (id,name,relationship,agent_key,is_demo,created_at) VALUES (?,?,?,?,0,?)`)
      .run('m1', 'Mummy', 'Mother', 'mummy', now.toISOString());
    await db.prepare(`INSERT INTO medicines (id,member_id,name,dose_units,frequency,times,food,stock_qty,stock_unit,low_stock_threshold,is_demo,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`).run('med1', 'm1', 'Test', 1, 'once_daily', '["10:00"]', 'after', 10, 'tablets', 2, now.toISOString());
    await db.prepare(`INSERT INTO reminders (id,member_id,medicine_id,time,repeat,voice_enabled,conversation_enabled,is_demo,created_at)
      VALUES (?,?,?,?, 'daily',1,1,0,?)`).run('r1', 'm1', 'med1', '10:00', now.toISOString());
    await tick(db, () => now);
    await tick(db, () => now);
    const rows = await db.prepare(`SELECT * FROM reminder_outcomes WHERE reminder_id='r1' AND kind='primary'`).all();
    expect(rows).toHaveLength(1);
  });
});

describe('Vercel Hobby cron', () => {
  it('uses a once-daily schedule, not hourly', () => {
    const cfg = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(cfg.crons).toHaveLength(1);
    expect(cfg.crons[0].path).toBe('/api/cron/tick');
    expect(cfg.crons[0].schedule).toBe('0 0 * * *');
    expect(cfg.crons[0].schedule).not.toMatch(/^\d+ \* /);
  });
});

describe('cron HTTP', () => {
  it('rejects missing bearer when CRON_SECRET is set', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret';
    try {
      const res = await cronTick(new Request('http://localhost/api/cron/tick'));
      expect(res.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});

describe('cron secret', () => {
  it('Express API still records due reminders via /api/incoming without starting ElevenLabs', async () => {
    const db = await openDb(':memory:');
    const now = fromIst('2026-10-30', '10:00');
    const fetchFn = vi.fn();
    const api = request(createApp({ db, clock: () => now, agents: { apiKey: 'k', mummyAgentId: 'agent_mummy', papaAgentId: 'agent_papa' }, fetchFn: fetchFn as any }));
    const r = await api.post('/api/account').send({ name: 'Durgesh', email: 'd@example.com', password: 'password123' });
    const auth = { Authorization: `Bearer ${r.body.token}` };
    await api.post('/api/family').set(auth).send({ name: 'Mummy', relationship: 'Mother' });
    const fam = (await api.get('/api/family').set(auth)).body.find((f: any) => f.name === 'Mummy');
    const med = await api.post('/api/medicines').set(auth).send({ member_id: fam.id, name: 'Metformin', frequency: 'once_daily', times: ['10:00'] });
    await api.post('/api/reminders').set(auth).send({ medicine_id: med.body.id, time: '10:00', repeat: 'once', date: '2026-10-30' });
    const inc = await api.get('/api/incoming').set(auth);
    expect(inc.body.incoming).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
