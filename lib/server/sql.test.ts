import { describe, expect, it } from 'vitest';
import { toPostgresSql } from './db.js';

describe('SQL translation for Postgres', () => {
  it('rewrites INSERT OR IGNORE occurrences to ON CONFLICT DO NOTHING', () => {
    const sql = `INSERT OR IGNORE INTO reminder_outcomes (id,reminder_id,scheduled_for,kind,state,is_demo,created_at)
                          VALUES (?,?,?,'primary','scheduled',?,?)`;
    const out = toPostgresSql(sql);
    expect(out).toContain('INSERT INTO reminder_outcomes');
    expect(out).toContain('ON CONFLICT (reminder_id, scheduled_for, kind) DO NOTHING');
    expect(out).toContain('$1');
    expect(out).not.toContain('?');
  });

  it('rewrites INSERT OR REPLACE settings upsert', () => {
    const out = toPostgresSql('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)');
    expect(out).toContain('ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value');
    expect(out).toBe('INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value');
  });
});
