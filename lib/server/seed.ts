import type { DB } from './db.js';
import { uid } from './engine.js';
import { agentKeyFor } from './agents.js';
import { addMinutes, Clock, fromIst, istParts } from './time.js';

export async function loadDemo(db: DB, clock: Clock) {
  if (Number(((await db.prepare('SELECT COUNT(*) c FROM family_members WHERE is_demo=1').get()) as any)?.c) > 0) return false;
  const now = clock();
  const iso = now.toISOString();
  const { date } = istParts(now);
  await db.transaction(async () => {
    const member = async (name: string, rel: string) => {
      const id = uid();
      await db.prepare(`INSERT INTO family_members (id,name,relationship,agent_key,is_demo,created_at) VALUES (?,?,?,?,1,?)`)
        .run(id, name, rel, agentKeyFor(name), iso);
      return id;
    };
    const med = async (m: string, name: string, strength: string, times: string[], stock: number, threshold = 7, food = 'after') => {
      const id = uid();
      const freq = times.length === 1 ? 'once_daily' : times.length === 2 ? 'twice_daily' : 'three_daily';
      await db.prepare(`INSERT INTO medicines (id,member_id,name,strength,dosage,dose_units,frequency,times,food,start_date,stock_qty,stock_unit,low_stock_threshold,is_demo,created_at)
                  VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,1,?)`)
        .run(id, m, name, strength, '1 tablet', freq, JSON.stringify(times), food, date, stock, 'tablets', threshold, iso);
      return id;
    };
    const rem = async (m: string, medId: string, time: string, state: string | null, outcome: string | null) => {
      const id = uid();
      await db.prepare(`INSERT INTO reminders (id,member_id,medicine_id,time,repeat,voice_enabled,conversation_enabled,is_demo,created_at)
                  VALUES (?,?,?,?, 'daily',1,1,1,?)`).run(id, m, medId, time, iso);
      if (state) await db.prepare(`INSERT INTO reminder_outcomes (id,reminder_id,scheduled_for,kind,state,outcome,outcome_source,is_demo,created_at)
                  VALUES (?,?,?,'primary',?,?,?,1,?)`).run(uid(), id, fromIst(date, time).toISOString(), state, outcome, outcome ? 'system' : null, iso);
      return id;
    };

    const mummy = await member('Mummy', 'Mother'), papa = await member('Papa', 'Father');
    const dadi = await member('Dadi', 'Grandmother'), me = await member('Durgesh', 'Self');
    void me;

    const met = await med(mummy, 'Metformin', '500mg', ['09:00'], 42);
    const gli = await med(mummy, 'Glimepiride', '1mg', ['14:00'], 20);
    const aml = await med(mummy, 'Amlodipine', '5mg', ['20:00'], 3);
    const pAml = await med(papa, 'Amlodipine', '5mg', ['08:00'], 28);
    const d3 = await med(papa, 'Vitamin D3', '60000 IU', ['20:00'], 12, 4, 'with');
    const dm = await med(dadi, 'Calcium (sample)', '500mg', ['14:00'], 18);

    await rem(mummy, met, '09:00', 'completed', 'taken');
    await rem(mummy, gli, '14:00', 'pending', 'not_taken');
    await rem(mummy, aml, '20:00', 'scheduled', null);
    await rem(papa, pAml, '08:00', 'completed', 'taken');
    await rem(papa, d3, '20:00', 'scheduled', null);
    const dr = await rem(dadi, dm, '14:00', 'missed', 'missed');
    await db.prepare(`INSERT INTO reminder_outcomes (id,reminder_id,scheduled_for,kind,state,attempt,is_demo,created_at)
                VALUES (?,?,?,'follow_up','scheduled',0,1,?)`).run(uid(), dr, addMinutes(now, 45).toISOString(), iso);

    for (let d = 0; d < 30; d += 2) {
      const at = new Date(now.getTime() - d * 86400000).toISOString();
      const sys = 124 + ((d * 7) % 17), dia = 80 + ((d * 5) % 9), glu = 110 + ((d * 11) % 38);
      await db.prepare(`INSERT INTO health_readings (id,member_id,type,systolic,diastolic,unit,measured_at,is_demo,created_at) VALUES (?,?,'bp',?,?,'mmHg',?,1,?)`).run(uid(), mummy, sys, dia, at, iso);
      await db.prepare(`INSERT INTO health_readings (id,member_id,type,glucose,unit,measured_at,is_demo,created_at) VALUES (?,?,'glucose',?,'mg/dL',?,1,?)`).run(uid(), mummy, glu, at, iso);
      if (d % 4 === 0) await db.prepare(`INSERT INTO health_readings (id,member_id,type,systolic,diastolic,unit,measured_at,is_demo,created_at) VALUES (?,?,'bp',?,?,'mmHg',?,1,?)`).run(uid(), papa, sys + 6, dia + 3, at, iso);
    }
    const appt = async (m: string, doc: string, clinic: string, days: number, time: string, notes: string) =>
      db.prepare(`INSERT INTO appointments (id,member_id,doctor,clinic,starts_at,notes,voice_enabled,is_demo,created_at) VALUES (?,?,?,?,?,?,1,1,?)`)
        .run(uid(), m, doc, clinic, fromIst(istParts(new Date(now.getTime() + days * 86400000)).date, time).toISOString(), notes, iso);
    await appt(mummy, 'Dr. Mehta (demo)', 'City Clinic', 3, '11:00', 'Routine diabetes check-up');
    await appt(papa, 'Dr. Rao (demo)', 'Apollo Heart Centre', 9, '16:30', 'Blood pressure review');
    await appt(dadi, 'Dr. Iyer (demo)', 'Sunrise Hospital', -12, '10:00', 'Past visit');
  });
  return true;
}

export async function clearDemo(db: DB) {
  await db.prepare('DELETE FROM family_members WHERE is_demo=1').run();
  for (const t of ['reminder_outcomes', 'reminders', 'medicines', 'health_readings', 'appointments'])
    await db.prepare(`DELETE FROM ${t} WHERE is_demo=1`).run();
}

export async function resetDemo(db: DB, clock: Clock) {
  await clearDemo(db);
  await loadDemo(db, clock);
}
