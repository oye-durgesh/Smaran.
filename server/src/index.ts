import dotenv from 'dotenv';
import path0 from 'node:path';
import { fileURLToPath as f0 } from 'node:url';
dotenv.config({ path: path0.resolve(path0.dirname(f0(import.meta.url)), '../../.env') });
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import { createApp } from './app.js';
import { agentConfigFromEnv } from './agents.js';
import { openDb } from './db.js';
import { tick } from './engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 22) {
  console.error(
    `Smaran Bolna requires Node.js 22 LTS. You are running ${process.version}. ` +
      `better-sqlite3 was installed for NODE_MODULE_VERSION 127 (Node 22) and will not load on this runtime.`,
  );
  process.exit(1);
}

const rawDb = process.env.DB_FILE?.trim();
const dbFile =
  !rawDb || rawDb === ':memory:'
    ? rawDb || path.join(dataDir, 'smaran.db')
    : path.isAbsolute(rawDb)
      ? rawDb
      : path.resolve(root, rawDb);
console.log(`Resolved database path: ${dbFile === ':memory:' ? ':memory:' : path.resolve(dbFile)}`);
console.log(`data directory: ${dataDir} exists=${fs.existsSync(dataDir)}`);
const db = openDb(dbFile);
const clock = () => new Date();
const app = createApp({ db, clock, agents: agentConfigFromEnv() });

// Background scheduler: runs on the server whether or not the app is open.
setInterval(() => { try { tick(db, clock); } catch (e) { console.error('tick failed'); } }, 15_000);

const dist = path.join(root, 'web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Smaran Bolna API on http://localhost:${port}`));
