import fs from 'node:fs';
import path from 'node:path';

export type RunResult = { changes: number };
export type Stmt = {
  get: (...args: unknown[]) => Promise<any>;
  all: (...args: unknown[]) => Promise<any[]>;
  run: (...args: unknown[]) => Promise<RunResult>;
};
export type DB = {
  dialect: 'sqlite' | 'postgres';
  prepare: (sql: string) => Stmt;
  exec: (sql: string) => Promise<void>;
  transaction: <T>(fn: () => Promise<T>) => Promise<T>;
};

const SQLITE_SCHEMA = `
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
`;

export const POSTGRES_SCHEMA = `
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
`;

export function toPostgresSql(sql: string): string {
  const ignoreOutcomes = /INSERT OR IGNORE INTO reminder_outcomes/i.test(sql);
  let s = sql
    .replace(/ORDER BY rowid/gi, 'ORDER BY created_at ASC, id ASC')
    .replace(/\(f\.agent_key IS NOT NULL\) AS has_voice/gi, '(f.agent_key IS NOT NULL)::int AS has_voice')
    .replace(/\(agent_key IS NOT NULL\) AS has_voice/gi, '(agent_key IS NOT NULL)::int AS has_voice')
    .replace(
      /INSERT OR REPLACE INTO app_settings \(key,value\) VALUES \(\?,\?\)/gi,
      'INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    )
    .replace(/INSERT OR IGNORE INTO reminder_outcomes/gi, 'INSERT INTO reminder_outcomes');
  if (ignoreOutcomes) s = `${s.trimEnd()} ON CONFLICT (reminder_id, scheduled_for, kind) DO NOTHING`;
  let i = 0;
  return s.replace(/\?/g, () => `$${++i}`);
}

function wrapSqlite(raw: import('better-sqlite3').Database): DB {
  return {
    dialect: 'sqlite',
    prepare(sql: string): Stmt {
      const stmt = raw.prepare(sql);
      return {
        get: async (...args) => stmt.get(...args),
        all: async (...args) => stmt.all(...args) as any[],
        run: async (...args) => ({ changes: stmt.run(...args).changes }),
      };
    },
    exec: async (sql: string) => { raw.exec(sql); },
    transaction: async (fn) => {
      raw.exec('BEGIN');
      try {
        const out = await fn();
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export async function openSqlite(file: string): Promise<DB> {
  const Database = (await import('better-sqlite3')).default;
  const resolved = file === ':memory:' ? ':memory:' : path.resolve(file);
  if (resolved !== ':memory:') fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const raw = new Database(resolved);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.exec(SQLITE_SCHEMA);
  return wrapSqlite(raw);
}

export async function openPostgres(databaseUrl: string): Promise<DB> {
  const postgres = (await import('postgres')).default;
  const local = /localhost|127\.0\.0\.1/i.test(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 20, connect_timeout: 30, ssl: local ? false : 'require' });
  await sql.unsafe(POSTGRES_SCHEMA);
  return {
    dialect: 'postgres',
    prepare(sqliteSql: string): Stmt {
      const text = toPostgresSql(sqliteSql);
      const runQuery = (args: unknown[]) => sql.unsafe(text, args as (string | number | boolean | null)[]);
      return {
        get: async (...args) => {
          const rows = await runQuery(args);
          return rows[0];
        },
        all: async (...args) => {
          const rows = await runQuery(args);
          return [...rows];
        },
        run: async (...args) => {
          const rows = await runQuery(args);
          return { changes: rows.count ?? 0 };
        },
      };
    },
    exec: async (sqliteSql: string) => { await sql.unsafe(toPostgresSql(sqliteSql)); },
    transaction: async (fn) => sql.begin(async () => fn()) as Promise<any>,
  };
}

/** Local: SQLite file or :memory:. Production: DATABASE_URL (Postgres). Never uses Vercel /tmp as durable storage. */
export async function openDatabase(opts?: { file?: string; databaseUrl?: string }): Promise<DB> {
  const url = opts?.databaseUrl ?? process.env.DATABASE_URL;
  if (url) return openPostgres(url);
  const file = opts?.file ?? process.env.DB_FILE ?? path.join(process.cwd(), 'data', 'smaran.db');
  return openSqlite(file);
}

/** @deprecated use openDatabase — kept for tests that pass a file path */
export async function openDb(file: string): Promise<DB> {
  return openSqlite(file);
}
