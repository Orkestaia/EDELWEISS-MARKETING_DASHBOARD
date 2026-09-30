import { NextResponse } from "next/server";
import { createSession, secureEqual, SESSION_COOKIE, sameOrigin } from "@/lib/dashboard-session";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const password = form.get("password");
  if (typeof password !== "string" || password.length > 256 || !process.env.DASHBOARD_PASSWORD || !secureEqual(password, process.env.DASHBOARD_PASSWORD)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }
  let session: string;
  try { session = createSession(); } catch { return new Response("Authentication is not configured", { status: 503 }); }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(SESSION_COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 28800 });
  return response;
}
