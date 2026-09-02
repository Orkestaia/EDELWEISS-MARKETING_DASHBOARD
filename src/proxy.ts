import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/cron/sync') return NextResponse.next();
  const username = process.env.DASHBOARD_BASIC_USER;
  const password = process.env.DASHBOARD_BASIC_PASSWORD;
  if (!username || !password) {
    if (!process.env.VERCEL_ENV) return NextResponse.next();
    return new NextResponse('Dashboard access is not configured.', { status: 503 });
  }
  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      const [candidateUser, candidatePassword] = atob(header.slice(6)).split(':');
      if (candidateUser === username && candidatePassword === password) return NextResponse.next();
    } catch { /* malformed authorization header */ }
  }
  return new NextResponse('Authentication required.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Edelweiss Marketing Studio", charset="UTF-8"', 'Cache-Control': 'no-store' } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
