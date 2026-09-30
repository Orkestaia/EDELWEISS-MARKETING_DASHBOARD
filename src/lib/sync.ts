import "server-only";
import { ensureSchema, isDatabaseConfigured, saveSnapshot, saveSyncRun } from "./db";

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(25000) });
      if (response.ok) return response;
      const body = await response.text();
      if (response.status < 500 && response.status !== 429) throw new Error(`${response.status}: ${body.slice(0, 240)}`);
      lastError = new Error(`${response.status}: ${body.slice(0, 240)}`);
    } catch (error) { lastError = error; }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed after retries");
}

export async function syncBrevo() {
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY is not configured");
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is required to store synchronization history");
  await ensureSchema();
  await saveSyncRun("brevo", "running", "Synchronization started");
  try {
    const url = new URL("https://api.brevo.com/v3/emailCampaigns");
    url.searchParams.set("status", "sent"); url.searchParams.set("statistics", "globalStats"); url.searchParams.set("limit", "100"); url.searchParams.set("sort", "desc"); url.searchParams.set("excludeHtmlContent", "true");
    const response = await fetchWithRetry(url.toString(), { headers: { accept: "application/json", "api-key": process.env.BREVO_API_KEY } });
    const data = await response.json() as { campaigns?: Array<Record<string, unknown>> };
    const rows = data.campaigns ?? [];
    for (const campaign of rows) {
      const date = String(campaign.sentDate ?? campaign.scheduledAt ?? campaign.createdAt ?? new Date().toISOString()).slice(0, 10);
      await saveSnapshot("brevo", String(campaign.id), date, "campaign", campaign);
    }
    await saveSyncRun("brevo", "success", `${rows.length} campaigns synchronized`, rows.length);
    return { provider: "brevo", records: rows.length };
  } catch (error) { const message = error instanceof Error ? error.message : "Unknown Brevo error"; await saveSyncRun("brevo", "error", message); throw error; }
}

export async function syncMeta() {
  const token = process.env.META_ACCESS_TOKEN;
  const rawAccount = process.env.META_AD_ACCOUNT_ID;
  if (!token || !rawAccount) throw new Error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID are required");
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is required to store synchronization history");
  await ensureSchema();
  await saveSyncRun("meta", "running", "Synchronization started");
  try {
    const version = process.env.META_GRAPH_API_VERSION;
    if (!version) throw new Error("META_GRAPH_API_VERSION is required so upgrades are explicit");
    const account = rawAccount.startsWith("act_") ? rawAccount : `act_${rawAccount}`;
    const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const url = new URL(`https://graph.facebook.com/${version}/${account}/insights`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("level", "ad");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("time_range", JSON.stringify({ since, until }));
    url.searchParams.set("fields", "date_start,date_stop,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,reach,impressions,cpm,clicks,ctr,cpc,frequency,actions,cost_per_action_type");
    url.searchParams.set("limit", "500");
    let next: string | undefined = url.toString();
    const rows: Array<Record<string, unknown>> = [];
    while (next && rows.length < 5000) {
      const response = await fetchWithRetry(next, { headers: { accept: "application/json" } });
      const body = await response.json() as { data?: Array<Record<string, unknown>>; paging?: { next?: string } };
      rows.push(...(body.data ?? [])); next = body.paging?.next;
    }
    for (const row of rows) await saveSnapshot("meta", String(row.ad_id ?? "unknown"), String(row.date_start), "ad", row);
    await saveSyncRun("meta", "success", `${rows.length} daily ad records synchronized`, rows.length);
    return { provider: "meta", records: rows.length };
  } catch (error) { const message = error instanceof Error ? error.message : "Unknown Meta error"; await saveSyncRun("meta", "error", message); throw error; }
}

async function graphJson(url: URL, token: string) {
  url.searchParams.set("access_token", token);
  const response = await fetchWithRetry(url.toString(), { headers: { accept: "application/json" } });
  return response.json() as Promise<Record<string, unknown>>;
}

export async function syncInstagram() {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const version = process.env.META_GRAPH_API_VERSION;
  if (!token || !accountId || !version) throw new Error("META_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID and META_GRAPH_API_VERSION are required");
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is required to store Instagram history");
  await ensureSchema();
  await saveSyncRun("instagram", "running", "Synchronization started");
  try {
    const today = new Date().toISOString().slice(0, 10);
    const accountUrl = new URL(`https://graph.facebook.com/${version}/${accountId}`);
    accountUrl.searchParams.set("fields", "id,username,name,profile_picture_url,followers_count,media_count");
    const account = await graphJson(accountUrl, token);
    const accountInsights: Array<Record<string, unknown>> = [];
    for (const name of ["reach", "profile_views", "website_clicks"]) {
      try {
        const url = new URL(`https://graph.facebook.com/${version}/${accountId}/insights`);
        url.searchParams.set("metric", name); url.searchParams.set("period", "day"); url.searchParams.set("metric_type", "total_value");
        const result = await graphJson(url, token); accountInsights.push(...((result.data as Array<Record<string, unknown>> | undefined) ?? []));
      } catch { /* Metric availability varies by account and Graph API version. */ }
    }
    const accountPayload = { ...account, insights: { data: accountInsights } };
    await saveSnapshot("instagram", accountId, today, "account", accountPayload);
    const mediaUrl = new URL(`https://graph.facebook.com/${version}/${accountId}/media`);
    mediaUrl.searchParams.set("fields", "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count"); mediaUrl.searchParams.set("limit", "50");
    const mediaResponse = await graphJson(mediaUrl, token);
    const media = (mediaResponse.data as Array<Record<string, unknown>> | undefined) ?? [];
    let stored = 0;
    for (const item of media) {
      const id = String(item.id ?? ""); if (!id) continue;
      const insights: Array<Record<string, unknown>> = [];
      const product = String(item.media_product_type ?? item.media_type ?? "");
      const metricNames = product === "REELS" ? ["reach", "views", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time"] : ["reach", "views", "saved", "shares", "total_interactions"];
      for (const name of metricNames) {
        try { const url = new URL(`https://graph.facebook.com/${version}/${id}/insights`); url.searchParams.set("metric", name); const result = await graphJson(url, token); insights.push(...((result.data as Array<Record<string, unknown>> | undefined) ?? [])); }
        catch { /* Store all supported metrics without failing the full sync. */ }
      }
      await saveSnapshot("instagram", id, String(item.timestamp ?? today).slice(0, 10), "media", { ...item, insights: { data: insights } }); stored++;
    }
    await saveSyncRun("instagram", "success", `${stored} Instagram media records synchronized`, stored);
    return { provider: "instagram", records: stored };
  } catch (error) { const message = error instanceof Error ? error.message : "Unknown Instagram error"; await saveSyncRun("instagram", "error", message); throw error; }
}

export async function syncAll() {
  const providers = ["brevo", "meta", "instagram"] as const;
  const results = await Promise.allSettled([syncBrevo(), syncMeta(), syncInstagram()]);
  return results.map((result, index) => result.status === "fulfilled" ? result.value : { provider: providers[index], error: result.reason instanceof Error ? result.reason.message : "Unknown error" });
}
