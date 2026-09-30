import { NextResponse } from "next/server";
import { SESSION_COOKIE, sameOrigin } from "@/lib/dashboard-session";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
