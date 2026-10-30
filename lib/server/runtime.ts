import path from 'node:path';
import type { Express } from 'express';
import { agentConfigFromEnv } from './agents.js';
import { createApp } from './app.js';
import { openDatabase, type DB } from './db.js';

let dbPromise: Promise<DB> | null = null;
let app: Express | null = null;

export function getDb(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = openDatabase({
      databaseUrl: process.env.DATABASE_URL,
      file: process.env.DB_FILE ?? path.join(process.cwd(), 'data', 'smaran.db'),
    });
  }
  return dbPromise;
}

export async function getExpressApp(): Promise<Express> {
  if (!app) {
    const db = await getDb();
    app = createApp({ db, agents: agentConfigFromEnv() });
  }
  return app;
}
