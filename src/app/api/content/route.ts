import { hasDashboardSession } from "@/lib/require-dashboard-session";
import { NextResponse } from "next/server";
import { deleteContent, isDatabaseConfigured, listContent, upsertContent } from "@/lib/db";
import type { ContentItem } from "@/lib/content-types";
import { isTrustedMutation } from "@/lib/request-security";

export async function GET() { if (!await hasDashboardSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); return NextResponse.json({ items: await listContent(), persistent: isDatabaseConfigured() }); }

export async function POST(request: Request) { if (!await hasDashboardSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted mutation request." }, { status: 403 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Persistence pending: configure DATABASE_URL before editing content." }, { status: 503 });
  const item = await request.json() as ContentItem;
  if (!item.id || !item.title || !item.scheduledAt) return NextResponse.json({ error: "Title and scheduled date are required." }, { status: 400 });
  await upsertContent(item); return NextResponse.json({ ok: true, item });
}

export async function DELETE(request: Request) { if (!await hasDashboardSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Untrusted mutation request." }, { status: 403 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Persistence pending: configure DATABASE_URL before deleting content." }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteContent(id); return NextResponse.json({ ok: true });
}
