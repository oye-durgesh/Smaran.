import { getExpressApp } from '@/lib/server/runtime';
import { expressToFetch } from '@/lib/server/express-to-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function handle(req: Request) {
  const app = await getExpressApp();
  return expressToFetch(app, req);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;
