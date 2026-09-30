import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validSession } from "./dashboard-session";
export async function hasDashboardSession() { return validSession((await cookies()).get(SESSION_COOKIE)?.value); }
export async function requireDashboardSession() { if (!await hasDashboardSession()) redirect("/login"); }
