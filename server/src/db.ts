import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

function describeOpenFailure(file: string, err: unknown): Error {
  const e = err as NodeJS.ErrnoException;
  const detail = e?.stack || e?.message || String(err);
  if (e?.code === 'ERR_DLOPEN_FAILED' || /NODE_MODULE_VERSION/.test(e?.message ?? '')) {
    return new Error(
      `Cannot load better-sqlite3 (native addon ABI mismatch). ` +
        `This app requires Node.js 22 LTS (NODE_MODULE_VERSION 127). ` +
        `You are running Node ${process.version} (NODE_MODULE_VERSION ${process.versions.modules}). ` +
        `Install Node 22, then from the repo root run: npm.cmd install\n${detail}`,
    );
  }
  return new Error(`Cannot open SQLite database at ${file}: ${e?.message || err}\n${detail}`);
}

export function openDb(file: string): DB {
  const resolved = file === ':memory:' ? ':memory:' : path.resolve(file);
  if (resolved !== ':memory:') {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
  }
  console.log(`Opening SQLite database: ${resolved}`);
  let db: Database.Database;
  try {
    db = new Database(resolved);
  } catch (err) {
    throw describeOpenFailure(resolved, err);
  }
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, relationship TEXT NOT NULL,
  avatar TEXT, notes TEXT,
  agent_key TEXT CHECK (agent_key IN ('mummy','papa')),
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL, strength TEXT, dosage TEXT, dose_units INTEGER NOT NULL DEFAULT 1,
  frequency TEXT NOT NULL CHECK (frequency IN ('once_daily','twice_daily','three_daily','custom')),
  times TEXT NOT NULL DEFAULT '[]',
  food TEXT NOT NULL DEFAULT 'not_specified' CHECK (food IN ('before','after','with','not_specified')),
  start_date TEXT, end_date TEXT,
  stock_qty INTEGER NOT NULL DEFAULT 0, stock_unit TEXT NOT NULL DEFAULT 'tablets',
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','discontinued')),
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  time TEXT NOT NULL,                       -- HH:MM, Asia/Kolkata
  repeat TEXT NOT NULL CHECK (repeat IN ('once','daily','weekdays')),
  date TEXT,                                -- for 'once'
  weekdays TEXT NOT NULL DEFAULT '[]',      -- JSON array 0-6
  voice_enabled INTEGER NOT NULL DEFAULT 1, conversation_enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
-- One row per occurrence of a reminder. Holds the state and the structured outcome only.
-- It never holds anything that was said during a call.
CREATE TABLE IF NOT EXISTS reminder_outcomes (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL,              -- UTC ISO
  kind TEXT NOT NULL DEFAULT 'primary' CHECK (kind IN ('primary','follow_up','retry')),
  state TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled','due','connecting','connected','processing','completed','pending','declined','missed','failed')),
  outcome TEXT CHECK (outcome IN ('taken','not_taken','follow_up','unconfirmed','missed','failed')),
  outcome_source TEXT CHECK (outcome_source IN ('agent','manual','system')),
  attempt INTEGER NOT NULL DEFAULT 0,
  rung_at TEXT, answered_at TEXT, ended_at TEXT, duration_sec INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  UNIQUE (reminder_id, scheduled_for, kind)
);
CREATE TABLE IF NOT EXISTS health_readings (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bp','glucose')),
  systolic INTEGER, diastolic INTEGER, glucose REAL,
  unit TEXT NOT NULL, measured_at TEXT NOT NULL, note TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  doctor TEXT NOT NULL, clinic TEXT, starts_at TEXT NOT NULL, notes TEXT,
  voice_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
  return db;
}
