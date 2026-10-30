-- PostgreSQL schema for production (Neon / Vercel Postgres / any hosted Postgres).
-- Applied automatically on first connection. Safe to re-run (IF NOT EXISTS).

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
  time TEXT NOT NULL,
  repeat TEXT NOT NULL CHECK (repeat IN ('once','daily','weekdays')),
  date TEXT,
  weekdays TEXT NOT NULL DEFAULT '[]',
  voice_enabled INTEGER NOT NULL DEFAULT 1, conversation_enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminder_outcomes (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL,
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
  systolic INTEGER, diastolic INTEGER, glucose DOUBLE PRECISION,
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
