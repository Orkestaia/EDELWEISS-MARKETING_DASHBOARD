import "server-only";

export function isTrustedMutation(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host) {
    try { return new URL(origin).host === host; }
    catch { return false; }
  }
  const secret = process.env.DASHBOARD_WRITE_SECRET;
  return Boolean(secret && request.headers.get("x-dashboard-secret") === secret);
}
