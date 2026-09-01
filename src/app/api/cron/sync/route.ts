import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization')?.replace('Bearer ', '') || '';
  if (!secret || auth.length !== secret.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(secret))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const response = await fetch(new URL('/api/sync', request.url), { method: 'POST', cache: 'no-store' });
  return Response.json(await response.json(), { status: response.status });
}
