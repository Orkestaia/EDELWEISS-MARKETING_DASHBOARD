import Link from "next/link";
import { requireDashboardSession } from "@/lib/require-dashboard-session";
import { StockDashboard } from "@/components/stock/StockDashboard";
import "./stock.css";
import "@/components/stock/planning-ui.css";
import "@/components/stock/analytics-ui.css";

export const dynamic = "force-dynamic";
export default async function StockPage() {
  await requireDashboardSession();
  return <main className="stock-shell"><div className="stock-brand"><Link href="/">← Marketing Studio</Link><span>Edelweiss · Biddeford, Maine</span><form action="/api/auth/logout" method="post"><button type="submit">Sign out</button></form></div><StockDashboard /></main>;
}
