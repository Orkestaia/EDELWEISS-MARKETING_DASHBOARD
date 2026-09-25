import { hasDashboardSession } from "@/lib/require-dashboard-session";
import { NextResponse } from "next/server";
import { syncAll, syncBrevo, syncInstagram, syncMeta } from "@/lib/sync";
import { isTrustedMutation } from "@/lib/request-security";

export async function POST(request: Request) { if (!await hasDashboardSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted synchronization request." }, { status: 403 });
  const provider = new URL(request.url).searchParams.get("provider") ?? "all";
  try {
    const result = provider === "brevo" ? await syncBrevo() : provider === "meta" ? await syncMeta() : provider === "instagram" ? await syncInstagram() : await syncAll();
    return NextResponse.json({ ok: true, result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Synchronization failed" }, { status: 500 }); }
}
