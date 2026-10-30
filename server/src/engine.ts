import { randomUUID } from 'node:crypto';
import type { DB } from './db.js';
import { addMinutes, Clock, fromIst, istParts } from './time.js';

export const OUTCOMES = ['taken', 'not_taken', 'follow_up', 'unconfirmed', 'missed', 'failed'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const MISSED_AFTER_MIN = 30;   // due but never answered -> missed
const MAX_RETRIES = 2;                // after decline / miss
const DEFAULT_RETRY_MIN = 10;

export const uid = () => randomUUID();

export function getSetting(db: DB, key: string, fallback: string): string {
  const r = db.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as { value: string } | undefined;
  return r?.value ?? fallback;
}

/** Does this reminder fire on this IST date? */
function firesOn(r: any, date: string, weekday: number): boolean {
  if (r.status !== 'active') return false;
  if (r.repeat === 'once') return r.date === date;
  if (r.repeat === 'daily') return true;
  return (JSON.parse(r.weekdays) as number[]).includes(weekday);
}

/**
 * The scheduler heartbeat. Idempotent: safe to call every few seconds.
 *  1. creates today's occurrences (UNIQUE index prevents duplicates)
 *  2. moves scheduled -> due when the time arrives
 *  3. moves due -> missed (and queues a retry) when nobody answered in time
 */
export function tick(db: DB, clock: Clock) {
  const now = clock();
  const { date, weekday } = istParts(now);
  const reminders = db.prepare(`SELECT * FROM reminders WHERE status='active'`).all() as any[];
  const ins = db.prepare(`INSERT OR IGNORE INTO reminder_outcomes (id,reminder_id,scheduled_for,kind,state,is_demo,created_at)
                          VALUES (?,?,?,'primary','scheduled',?,?)`);
  for (const r of reminders) {
    if (firesOn(r, date, weekday)) ins.run(uid(), r.id, fromIst(date, r.time).toISOString(), r.is_demo, now.toISOString());
  }
  const nowIso = now.toISOString();
  db.prepare(`UPDATE reminder_outcomes SET state='due'
              WHERE state='scheduled' AND scheduled_for<=?
                AND reminder_id IN (SELECT id FROM reminders WHERE status='active')`).run(nowIso);

  const cutoff = addMinutes(now, -MISSED_AFTER_MIN).toISOString();
  const stale = db.prepare(`SELECT * FROM reminder_outcomes WHERE state='due' AND COALESCE(rung_at, scheduled_for)<=?`).all(cutoff) as any[];
  for (const o of stale) markUnanswered(db, o, 'missed', clock);
}

function markUnanswered(db: DB, o: any, state: 'missed' | 'declined', clock: Clock) {
  db.prepare(`UPDATE reminder_outcomes SET state=?, outcome=?, outcome_source='system', ended_at=? WHERE id=?`)
    .run(state, state === 'missed' ? 'missed' : null, clock().toISOString(), o.id);
  scheduleRetry(db, o, clock, getRetryMinutes(db));
}

const getRetryMinutes = (db: DB) => Number(getSetting(db, 'retry_minutes', String(DEFAULT_RETRY_MIN)));

function scheduleRetry(db: DB, o: any, clock: Clock, minutes: number) {
  if (o.attempt >= MAX_RETRIES) return;
  addOccurrence(db, o, 'retry', addMinutes(clock(), minutes), o.attempt + 1, clock);
}

function addOccurrence(db: DB, from: any, kind: 'follow_up' | 'retry', at: Date, attempt: number, clock: Clock) {
  db.prepare(`INSERT OR IGNORE INTO reminder_outcomes (id,reminder_id,scheduled_for,kind,state,attempt,is_demo,created_at)
              VALUES (?,?,?,?, 'scheduled', ?, ?, ?)`)
    .run(uid(), from.reminder_id, at.toISOString(), kind, attempt, from.is_demo, clock().toISOString());
}

export function decline(db: DB, id: string, clock: Clock) {
  const o = db.prepare('SELECT * FROM reminder_outcomes WHERE id=?').get(id) as any;
  if (!o || o.state !== 'due') return { ok: false as const, reason: 'not_due' };
  markUnanswered(db, o, 'declined', clock);
  return { ok: true as const };
}

/**
 * Atomically claims an occurrence for a call. Only one caller can ever win,
 * which is what prevents duplicate activation.
 */
export function claimForCall(db: DB, id: string, clock: Clock): boolean {
  const r = db.prepare(`UPDATE reminder_outcomes SET state='connecting', answered_at=? WHERE id=? AND state='due'`)
    .run(clock().toISOString(), id);
  return r.changes === 1;
}

export function setState(db: DB, id: string, from: string[], to: string) {
  const q = `UPDATE reminder_outcomes SET state=? WHERE id=? AND state IN (${from.map(() => '?').join(',')})`;
  return db.prepare(q).run(to, id, ...from).changes === 1;
}

export function failCall(db: DB, id: string, clock: Clock) {
  db.prepare(`UPDATE reminder_outcomes SET state='failed', outcome='failed', outcome_source='system', ended_at=? WHERE id=? AND state IN ('connecting','connected','processing')`)
    .run(clock().toISOString(), id);
}

export interface OutcomeInput { outcome: Outcome; source: 'agent' | 'manual'; followUpMinutes?: number; durationSec?: number }

/**
 * Applies a structured outcome. Only `taken` completes the dose and touches stock.
 * Anything ambiguous leaves the medicine pending.
 */
export function applyOutcome(db: DB, id: string, input: OutcomeInput, clock: Clock) {
  const o = db.prepare('SELECT * FROM reminder_outcomes WHERE id=?').get(id) as any;
  if (!o) return { ok: false as const, reason: 'not_found' };
  if (['completed'].includes(o.state)) return { ok: false as const, reason: 'already_completed' };
  // An outcome reported by the voice agent is only believable during a real call that this app started.
  // This blocks a stray or replayed report from marking a dose taken.
  if (input.source === 'agent' && !['connecting', 'connected', 'processing'].includes(o.state)) return { ok: false as const, reason: 'no_active_call' };
  const now = clock().toISOString();
  const state = input.outcome === 'taken' ? 'completed'
    : input.outcome === 'missed' ? 'missed'
    : input.outcome === 'failed' ? 'failed' : 'pending';

  const tx = db.transaction(() => {
    db.prepare(`UPDATE reminder_outcomes SET state=?, outcome=?, outcome_source=?, ended_at=?, duration_sec=? WHERE id=?`)
      .run(state, input.outcome, input.source, now, input.durationSec ?? null, id);
    if (input.outcome === 'taken') {
      const r = db.prepare('SELECT medicine_id FROM reminders WHERE id=?').get(o.reminder_id) as any;
      db.prepare(`UPDATE medicines SET stock_qty = MAX(0, stock_qty - dose_units) WHERE id=?`).run(r.medicine_id);
    }
    if (input.outcome === 'follow_up') {
      const mins = Math.min(Math.max(input.followUpMinutes ?? 15, 1), 240);
      addOccurrence(db, o, 'follow_up', addMinutes(clock(), mins), o.attempt, clock);
    }
  });
  tx();
  return { ok: true as const, state };
}

/** Counts for the home dashboard and family cards. Pending = needs attention. */
export function dashboard(db: DB, clock: Clock) {
  const { date } = istParts(clock());
  const start = fromIst(date, '00:00').toISOString();
  const end = fromIst(date, '23:59').toISOString();
  const rows = db.prepare(`
    SELECT o.*, r.member_id, m.name AS medicine_name, m.strength FROM reminder_outcomes o
    JOIN reminders r ON r.id=o.reminder_id JOIN medicines m ON m.id=r.medicine_id
    WHERE o.scheduled_for BETWEEN ? AND ?`).all(start, end) as any[];
  const completed = rows.filter(r => r.state === 'completed').length;
  const upcoming = rows.filter(r => r.state === 'scheduled').length;
  const pending = rows.filter(r => ['due', 'pending', 'declined', 'missed', 'failed', 'connecting', 'connected'].includes(r.state)).length;
  return { completed, upcoming, pending, total: rows.length };
}
