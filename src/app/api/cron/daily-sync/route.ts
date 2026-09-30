import { syncMarketing } from '@/lib/marketing-sync';
import { NextResponse } from "next/server";
import { syncAll } from "@/lib/sync";
import { passport } from "@/lib/passport";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  if (process.env.DATABASE_URL) await (await passport()).expire();
  const [result, marketing] = await Promise.all([syncAll(), syncMarketing()]);
  return NextResponse.json({ ok: true, result, marketing });
}
