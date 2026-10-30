import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { fromIst } from '../src/time.js';

const AGENTS = { apiKey: 'test-key', mummyAgentId: 'agent_mummy', papaAgentId: 'agent_papa' };
let now: Date;
let fetchFn: ReturnType<typeof vi.fn>;
let api: ReturnType<typeof request>;
let auth: { Authorization: string };
let db: ReturnType<typeof openDb>;

const get = (p: string) => api.get(p).set(auth);
const post = (p: string, b: object = {}) => api.post(p).set(auth).send(b);

beforeEach(async () => {
  now = fromIst('2026-10-30', '07:00');                  // 7:00 AM IST
  fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ signed_url: 'wss://signed.example/abc' }) }));
  db = openDb(':memory:');
  api = request(createApp({ db, clock: () => now, agents: AGENTS, fetchFn: fetchFn as any }));
  const r = await api.post('/api/account').send({ name: 'Durgesh', email: 'd@example.com', password: 'password123' });
  auth = { Authorization: `Bearer ${r.body.token}` };
  await post('/api/demo/load');
});

async function findOcc(member: string, medicine: string) {
  const { body } = await get('/api/today');
  return body.occurrences.find((o: any) => o.member_name === member && o.medicine_name === medicine);
}

describe('reminder → incoming → answer → outcome', () => {
  it('full Mummy Metformin workflow', async () => {
    // schedule a one-off test reminder for Mummy's Metformin
    const meds = (await get('/api/medicines')).body;
    const family = (await get('/api/family')).body;
    const mummy = family.find((f: any) => f.name === 'Mummy');
    const metformin = meds.find((m: any) => m.member_id === mummy.id && m.name === 'Metformin');
    const created = await post('/api/reminders', { medicine_id: metformin.id, time: '07:30', repeat: 'once', date: '2026-10-30' });
    expect(created.status).toBe(201);

    expect((await get('/api/incoming')).body.incoming).toBeNull();      // nothing due yet
    now = fromIst('2026-10-30', '07:30');                                // advance the test clock
    const incoming = (await get('/api/incoming')).body.incoming;
    expect(incoming.member_name).toBe('Mummy');
    expect(incoming.medicine_name).toBe('Metformin');
    expect(fetchFn).not.toHaveBeenCalled();                              // ElevenLabs NOT activated yet

    const ans = await post(`/api/occurrences/${incoming.id}/answer`);
    expect(ans.status).toBe(200);
    expect(ans.body.signedUrl).toBe('wss://signed.example/abc');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('get-signed-url?agent_id=agent_mummy');         // Mummy agent chosen
    expect(init.headers['xi-api-key']).toBe('test-key');
    expect(JSON.stringify(ans.body)).not.toContain('test-key');

    expect((await post(`/api/occurrences/${incoming.id}/outcome`, { outcome: 'taken', source: 'agent' })).status).toBe(200);
    const after = await get('/api/today');
    expect(after.body.occurrences.find((o: any) => o.id === incoming.id).state).toBe('completed');
  });

  it('Papa uses the Papa agent; Dadi has none', async () => {
    now = fromIst('2026-10-30', '20:00');
    const papa = await findOcc('Papa', 'Vitamin D3');
    await post(`/api/occurrences/${papa.id}/answer`);
    expect(fetchFn.mock.calls[0][0]).toContain('agent_id=agent_papa');

    const dadi = await findOcc('Dadi', 'Calcium (sample)');
    const r = await post(`/api/occurrences/${dadi.id}/answer`);
    expect(r.status).toBe(422);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('decline does not activate the agent and queues a retry', async () => {
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Mummy', 'Amlodipine');
    expect((await post(`/api/occurrences/${o.id}/decline`)).status).toBe(200);
    expect(fetchFn).not.toHaveBeenCalled();
    const rows = (await get('/api/today')).body.occurrences.filter((x: any) => x.medicine_name === 'Amlodipine' && x.member_name === 'Mummy');
    expect(rows.some((x: any) => x.kind === 'retry' && x.state === 'scheduled')).toBe(true);
  });

  it('prevents duplicate activation', async () => {
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Papa', 'Vitamin D3');
    const [a, b] = await Promise.all([post(`/api/occurrences/${o.id}/answer`), post(`/api/occurrences/${o.id}/answer`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('unclear / not_taken / unconfirmed outcomes never complete the dose or use stock', async () => {
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Papa', 'Vitamin D3');
    const stock = () => (db.prepare(`SELECT stock_qty FROM medicines WHERE name='Vitamin D3'`).get() as any).stock_qty;
    const before = stock();
    await post(`/api/occurrences/${o.id}/answer`);
    await post(`/api/occurrences/${o.id}/outcome`, { outcome: 'unconfirmed', source: 'agent' });
    expect((await findOcc('Papa', 'Vitamin D3')).state).toBe('pending');
    expect(stock()).toBe(before);
    await post(`/api/occurrences/${o.id}/outcome`, { outcome: 'taken', source: 'manual' });
    expect(stock()).toBe(before - 1);
  });

  it('agent-reported outcome is refused unless a call is actually active', async () => {
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Papa', 'Vitamin D3');       // due, but nobody answered
    const r = await post(`/api/occurrences/${o.id}/outcome`, { outcome: 'taken', source: 'agent' });
    expect(r.status).toBe(409);
    expect((await findOcc('Papa', 'Vitamin D3')).state).toBe('due');
    await post(`/api/occurrences/${o.id}/answer`);        // now a call is active
    expect((await post(`/api/occurrences/${o.id}/outcome`, { outcome: 'taken', source: 'agent' })).status).toBe(200);
  });

  it('a second agent report cannot change a finished dose', async () => {
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Papa', 'Vitamin D3');
    await post(`/api/occurrences/${o.id}/answer`);
    await post(`/api/occurrences/${o.id}/outcome`, { outcome: 'taken', source: 'agent' });
    expect((await post(`/api/occurrences/${o.id}/outcome`, { outcome: 'not_taken', source: 'agent' })).status).toBe(409);
  });

  it('follow_up creates another reminder', async () => {
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Papa', 'Vitamin D3');
    await post(`/api/occurrences/${o.id}/answer`);
    await post(`/api/occurrences/${o.id}/outcome`, { outcome: 'follow_up', source: 'agent', followUpMinutes: 15 });
    const rows = (await get('/api/today')).body.occurrences.filter((x: any) => x.medicine_name === 'Vitamin D3');
    expect(rows.find((x: any) => x.kind === 'follow_up')).toBeTruthy();
  });

  it('retry re-rings a missed reminder without starting a call', async () => {
    now = fromIst('2026-10-30', '20:00'); await get('/api/today');
    now = fromIst('2026-10-30', '20:45');
    const o = await findOcc('Papa', 'Vitamin D3');
    expect((await post(`/api/occurrences/${o.id}/retry`)).status).toBe(200);
    expect((await findOcc('Papa', 'Vitamin D3')).state).toBe('due');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('unanswered reminders become missed', async () => {
    now = fromIst('2026-10-30', '20:00');
    await get('/api/today');
    now = fromIst('2026-10-30', '20:45');
    expect((await findOcc('Papa', 'Vitamin D3')).state).toBe('missed');
  });

  it('handles ElevenLabs API failure', async () => {
    fetchFn.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Papa', 'Vitamin D3');
    expect((await post(`/api/occurrences/${o.id}/answer`)).status).toBe(502);
    expect((await findOcc('Papa', 'Vitamin D3')).state).toBe('failed');
  });

  it('handles network failure and missing configuration', async () => {
    fetchFn.mockRejectedValueOnce(new Error('net'));
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Mummy', 'Amlodipine');
    expect((await post(`/api/occurrences/${o.id}/answer`)).status).toBe(502);
    const app2 = request(createApp({ db, clock: () => now, agents: {}, fetchFn: fetchFn as any }));
    const p = await findOcc('Papa', 'Vitamin D3');
    expect((await app2.post(`/api/occurrences/${p.id}/answer`).set(auth)).status).toBe(503);
  });
});

describe('agent mapping', () => {
  it('Mummy and Papa get their agent; Dadi, Durgesh and others get none', async () => {
    const { agentKeyFor } = await import('../src/agents.js');
    expect([agentKeyFor('Mummy'), agentKeyFor(' papa '), agentKeyFor('Dadi'), agentKeyFor('Durgesh'), agentKeyFor('Me')]).toEqual(['mummy', 'papa', null, null, null]);
  });

  it('the session request carries only the agent id and key: no prompt, language or voice override', async () => {
    now = fromIst('2026-10-30', '20:00');
    const o = await findOcc('Papa', 'Vitamin D3');
    await post(`/api/occurrences/${o.id}/answer`);
    const [url, init] = fetchFn.mock.calls[0];
    expect(new URL(url).searchParams.get('agent_id')).toBe('agent_papa');
    expect([...new URL(url).searchParams.keys()]).toEqual(['agent_id']);
    expect(Object.keys(init)).toEqual(['headers']);              // no body, no method override
    expect(Object.keys(init.headers)).toEqual(['xi-api-key']);
  });

  it('only a member named Dadi cannot be given an agent by renaming tricks on a real record', async () => {
    const r = await post('/api/family', { name: 'Chacha', relationship: 'Uncle' });
    const fam = (await get('/api/family')).body.find((f: any) => f.id === r.body.id);
    expect(fam.has_voice).toBe(0);
  });
});

describe('data safety', () => {
  it('requires a login', async () => {
    expect((await api.get('/api/family')).status).toBe(401);
  });

  it('demo reset/clear never touches real records', async () => {
    const real = await post('/api/family', { name: 'Chacha', relationship: 'Uncle' });
    await post('/api/medicines', { member_id: real.body.id, name: 'RealMed', frequency: 'once_daily', times: ['09:00'] });
    await post('/api/demo/reset');
    await post('/api/demo/clear');
    const family = (await get('/api/family')).body;
    expect(family.map((f: any) => f.name)).toEqual(['Chacha']);
    expect((await get('/api/medicines')).body.map((m: any) => m.name)).toEqual(['RealMed']);
  });

  it('seeded records are flagged as demo', async () => {
    expect((await get('/api/family')).body.every((f: any) => f.is_demo === 1)).toBe(true);
  });

  it('removing a member needs confirmation and keeps other members', async () => {
    const a = await post('/api/family', { name: 'A', relationship: 'x' });
    expect((await api.delete(`/api/family/${a.body.id}`).set(auth)).status).toBe(400);
    expect((await api.delete(`/api/family/${a.body.id}?confirm=true`).set(auth)).status).toBe(200);
    expect((await get('/api/family')).body.length).toBe(4);
  });

  it('schema has no transcript or audio columns', () => {
    const cols = db.prepare(`SELECT m.name t, p.name c FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type='table'`).all() as any[];
    expect(cols.filter(x => /transcript|audio|message|recording/i.test(x.c))).toEqual([]);
  });

  it('rejects unknown fields on outcome so no dialogue can be sent in', async () => {
    const o = await findOcc('Papa', 'Vitamin D3');
    expect((await post(`/api/occurrences/${o.id}/outcome`, { outcome: 'taken', transcript: 'hello' })).status).toBe(400);
  });

  it('rejects a medicine that does not belong to the member', async () => {
    const meds = (await get('/api/medicines')).body;
    const fam = (await get('/api/family')).body;
    const papa = meds.find((m: any) => m.name === 'Vitamin D3');
    const mummy = fam.find((f: any) => f.name === 'Mummy');
    const r = await post('/api/reminders', { medicine_id: papa.id, member_id: mummy.id, time: '10:00', repeat: 'daily' });
    expect(r.status).toBe(400);
  });
});
