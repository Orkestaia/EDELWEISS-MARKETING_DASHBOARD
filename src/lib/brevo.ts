import "server-only";
import type { EmailCampaignData } from "./data";
import type { BrevoAnalytics, BrevoCampaignMetric } from "./content-types";

const num = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const emptyTotals = () => ({ sent: 0, delivered: 0, opens: 0, uniqueOpens: 0, clicks: 0, uniqueClicks: 0, bounces: 0, unsubscribed: 0 });
const aggregate = (campaigns: BrevoCampaignMetric[]) => campaigns.reduce((total, item) => ({ sent: total.sent + item.sent, delivered: total.delivered + item.delivered, opens: total.opens + item.opens, uniqueOpens: total.uniqueOpens + item.uniqueOpens, clicks: total.clicks + item.clicks, uniqueClicks: total.uniqueClicks + item.uniqueClicks, bounces: total.bounces + item.hardBounces + item.softBounces, unsubscribed: total.unsubscribed + item.unsubscribed }), emptyTotals());

function periods(campaigns: BrevoCampaignMetric[]) {
  const now = Date.now(); const thirty = 30 * 86400000;
  const current = campaigns.filter((item) => { const time = Date.parse(item.sentAt); return Number.isFinite(time) && time >= now - thirty; });
  const previous = campaigns.filter((item) => { const time = Date.parse(item.sentAt); return Number.isFinite(time) && time < now - thirty && time >= now - 2 * thirty; });
  return { current: aggregate(current), previous: aggregate(previous) };
}

function sheetsFallback(rows: EmailCampaignData[], message: string): BrevoAnalytics {
  const campaigns: BrevoCampaignMetric[] = rows.map((row) => ({ id: row.campaignId, name: row.campaignName, subject: row.subject, sentAt: row.sendingDate, sent: row.sent, delivered: row.delivered, opens: row.totalOpens, uniqueOpens: 0, clicks: row.clicked, uniqueClicks: 0, hardBounces: 0, softBounces: 0, unsubscribed: row.unsubscribed }));
  const totals = periods(campaigns);
  return { configured: Boolean(process.env.BREVO_API_KEY), source: campaigns.length ? "google-sheets-fallback" : "unavailable", message, campaigns, ...totals };
}

export async function fetchBrevoAnalytics(fallback: EmailCampaignData[]): Promise<BrevoAnalytics> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return sheetsFallback(fallback, "BREVO_API_KEY is pending. Reporting continues from Google Sheets.");
  try {
    const url = new URL("https://api.brevo.com/v3/emailCampaigns");
    url.searchParams.set("status", "sent"); url.searchParams.set("statistics", "globalStats"); url.searchParams.set("limit", "100"); url.searchParams.set("sort", "desc"); url.searchParams.set("excludeHtmlContent", "true");
    const response = await fetch(url, { cache: "no-store", headers: { accept: "application/json", "api-key": key }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Brevo returned ${response.status}`);
    const body = await response.json() as { campaigns?: Array<Record<string, unknown>> };
    const campaigns = (body.campaigns ?? []).map((campaign): BrevoCampaignMetric => {
      const stats = (campaign.statistics as Record<string, unknown> | undefined)?.globalStats as Record<string, unknown> | undefined ?? {};
      return { id: String(campaign.id ?? ""), name: String(campaign.name ?? "Untitled campaign"), subject: String(campaign.subject ?? ""), sentAt: String(campaign.sentDate ?? campaign.scheduledAt ?? campaign.createdAt ?? ""), sent: num(stats.sent), delivered: num(stats.delivered), opens: num(stats.viewed), uniqueOpens: num(stats.uniqueViews), clicks: num(stats.clickers), uniqueClicks: num(stats.uniqueClicks), hardBounces: num(stats.hardBounces), softBounces: num(stats.softBounces), unsubscribed: num(stats.unsubscriptions) };
    });
    return { configured: true, source: "brevo-api", message: `${campaigns.length} campaigns loaded directly from Brevo.`, campaigns, ...periods(campaigns) };
  } catch (error) { return sheetsFallback(fallback, `Brevo is configured but unavailable (${error instanceof Error ? error.message : "request failed"}). Google Sheets is active as fallback.`); }
}
