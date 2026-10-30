import type { Express } from 'express';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';

/** Run an Express app against a Fetch Request (Next.js / Vercel). */
export async function expressToFetch(app: Express, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const bodyBuf = req.method === 'GET' || req.method === 'HEAD' ? null : Buffer.from(await req.arrayBuffer());

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const nodeReq = Readable.from(bodyBuf ?? []) as IncomingMessage;
    nodeReq.method = req.method;
    nodeReq.url = url.pathname + url.search;
    nodeReq.headers = Object.fromEntries(req.headers.entries());
    (nodeReq as any).socket = { remoteAddress: '127.0.0.1' };

    const headers = new Headers();
    let status = 200;
    const nodeRes: any = {
      statusCode: 200,
      headersSent: false,
      setHeader(k: string, v: string | number | string[]) {
        headers.set(k, Array.isArray(v) ? v.join(',') : String(v));
      },
      getHeader(k: string) { return headers.get(k) ?? undefined; },
      removeHeader(k: string) { headers.delete(k); },
      writeHead(code: number, h?: Record<string, string>) {
        status = code;
        nodeRes.statusCode = code;
        nodeRes.headersSent = true;
        if (h) for (const [k, v] of Object.entries(h)) headers.set(k, v);
      },
      write(chunk: unknown, enc?: unknown, cb?: unknown) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        if (typeof enc === 'function') enc();
        if (typeof cb === 'function') cb();
        return true;
      },
      end(chunk?: unknown) {
        if (chunk) nodeRes.write(chunk);
        status = nodeRes.statusCode || status;
        resolve(new Response(Buffer.concat(chunks), { status, headers }));
      },
      on() { return nodeRes; },
      once() { return nodeRes; },
      emit() { return false; },
      cork() {},
      uncork() {},
    };

    try {
      app(nodeReq, nodeRes);
    } catch (e) {
      reject(e);
    }
  });
}
