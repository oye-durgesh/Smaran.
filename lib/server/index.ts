/** Local and production entry is Next.js (`npm run dev` / Vercel). Express lives in `createApp`. */
export { createApp } from './app.js';
export { openDatabase, openDb } from './db.js';
export { getDb, getExpressApp } from './runtime.js';
