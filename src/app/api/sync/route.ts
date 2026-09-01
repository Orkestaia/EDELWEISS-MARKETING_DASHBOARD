import { fetchBrevoCampaigns, fetchMetaInsights } from '@/lib/marketing-adapters';
import { fetchEmailCampaignData, fetchMetaAdsData } from '@/lib/data';
import { appendSyncHistory, readSyncHistory } from '@/lib/content-store';

export const runtime = 'nodejs';

async function sync() {
  const startedAt = new Date().toISOString();
  async function retry<T>(operation: () => Promise<T>) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { return { data: await operation(), attempts: attempt }; }
      catch (error) { lastError = error; if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 250)); }
    }
    throw lastError;
  }
  const [brevo, meta] = await Promise.all([
    retry(fetchBrevoCampaigns).then(result => ({ source: 'api', ...result })).catch(async (error) => ({ source: process.env.BREVO_API_KEY ? 'error' : 'sheets', data: await fetchEmailCampaignData().catch(() => []), attempts: 3, error: error.message })),
    retry(fetchMetaInsights).then(result => ({ source: 'api', ...result })).catch(async (error) => ({ source: process.env.META_ACCESS_TOKEN ? 'error' : 'sheets', data: await fetchMetaAdsData().catch(() => []), attempts: 3, error: error.message })),
  ]);
  const result = { startedAt, completedAt: new Date().toISOString(), brevo, meta };
  await appendSyncHistory(result).catch(() => undefined);
  return result;
}

export async function GET(request: Request) { return new URL(request.url).searchParams.get('history') === '1' ? Response.json({ history: await readSyncHistory() }) : Response.json(await sync()); }
export async function POST() { return Response.json(await sync()); }
