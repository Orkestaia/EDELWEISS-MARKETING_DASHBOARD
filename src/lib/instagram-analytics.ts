import "server-only";
import type { InstagramAnalytics, MarketingSnapshot } from "./content-types";

const numberOrNull = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const metric = (payload: Record<string, unknown>, name: string) => {
  const insights = payload.insights as Record<string, unknown> | undefined;
  const data = insights?.data as Array<Record<string, unknown>> | undefined;
  const match = data?.find((entry) => entry.name === name);
  const values = match?.values as Array<Record<string, unknown>> | undefined;
  return numberOrNull(match?.total_value && typeof match.total_value === "object" ? (match.total_value as Record<string, unknown>).value : values?.at(-1)?.value);
};

export function buildInstagramAnalytics(snapshots: MarketingSnapshot[], configured: boolean, lastSyncedAt: string | null): InstagramAnalytics {
  const accounts = snapshots.filter((snapshot) => snapshot.level === "account");
  const latest = accounts[0]?.payload ?? {};
  const previous = accounts.find((snapshot) => numberOrNull(snapshot.payload.followers_count) !== null && snapshot.snapshotDate !== accounts[0]?.snapshotDate)?.payload;
  const followers = numberOrNull(latest.followers_count);
  const previousFollowers = numberOrNull(previous?.followers_count);
  const mediaById = new Map<string, MarketingSnapshot>();
  for (const snapshot of snapshots.filter((entry) => entry.level === "media")) if (!mediaById.has(snapshot.externalId)) mediaById.set(snapshot.externalId, snapshot);
  const media = [...mediaById.values()].map(({ externalId, payload }) => ({
    id: externalId, caption: String(payload.caption ?? "Untitled content"), type: String(payload.media_product_type ?? payload.media_type ?? "Post"), timestamp: String(payload.timestamp ?? ""), permalink: String(payload.permalink ?? ""), reach: metric(payload, "reach"), views: metric(payload, "views") ?? metric(payload, "plays"), likes: numberOrNull(payload.like_count), comments: numberOrNull(payload.comments_count), saves: metric(payload, "saved"), shares: metric(payload, "shares"), totalInteractions: metric(payload, "total_interactions"),
  })).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const recommendations: InstagramAnalytics["recommendations"] = [];
  const measured = media.filter((item) => item.reach !== null || item.totalInteractions !== null);
  if (measured.length >= 4) {
    const groups = new Map<string, { count: number; reach: number; interactions: number }>();
    for (const item of measured) { const current = groups.get(item.type) ?? { count: 0, reach: 0, interactions: 0 }; current.count++; current.reach += item.reach ?? 0; current.interactions += item.totalInteractions ?? ((item.likes ?? 0) + (item.comments ?? 0) + (item.saves ?? 0) + (item.shares ?? 0)); groups.set(item.type, current); }
    const ranked = [...groups.entries()].filter(([, value]) => value.count >= 2).sort((a, b) => (b[1].interactions / b[1].count) - (a[1].interactions / a[1].count));
    if (ranked[0]) recommendations.push({ title: `Prioritize ${ranked[0][0].toLowerCase()} content`, detail: `It currently leads average interactions across ${ranked[0][1].count} measured pieces. Keep the cadence sustainable and retest after the next recording session.`, confidence: measured.length >= 10 ? "reliable" : "early signal" });
    const best = [...measured].sort((a, b) => ((b.saves ?? 0) + (b.shares ?? 0)) - ((a.saves ?? 0) + (a.shares ?? 0)))[0];
    if (best && ((best.saves ?? 0) + (best.shares ?? 0)) > 0) recommendations.push({ title: "Reuse the most saveable idea", detail: `“${best.caption.slice(0, 80)}${best.caption.length > 80 ? "…" : ""}” leads saves and shares. Recut it into one Story and one complementary format instead of requesting a new shoot.`, confidence: measured.length >= 10 ? "reliable" : "early signal" });
  }
  return { configured, lastSyncedAt, account: { followers, reach: metric(latest, "reach"), profileViews: metric(latest, "profile_views"), websiteClicks: metric(latest, "website_clicks") }, followerChange: followers !== null && previousFollowers !== null ? followers - previousFollowers : null, media, recommendations };
}
