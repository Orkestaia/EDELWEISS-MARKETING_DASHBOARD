import { cookies } from "next/headers";
import { SESSION_COOKIE, validSession } from "@/lib/dashboard-session";
import { suppliers } from "@/lib/suppliers";
import { supplierGet, supplierPost } from "@/lib/suppliers/access";

export const runtime = "nodejs";
async function authorized() { return validSession((await cookies()).get(SESSION_COOKIE)?.value); }
export async function GET() { return supplierGet(await authorized(), suppliers); }
export async function POST(request: Request) { return supplierPost(request, await authorized(), suppliers); }
