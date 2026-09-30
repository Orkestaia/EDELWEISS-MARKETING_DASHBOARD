import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, validSession } from "@/lib/dashboard-session";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/auth/login" || path.startsWith("/api/passport/") || path.startsWith("/api/cron/")) return NextResponse.next();
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return path.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
