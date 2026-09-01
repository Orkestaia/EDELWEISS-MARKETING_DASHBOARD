import 'server-only';
import type { EmailCampaignData, MetaAdData } from './data';

export interface AdapterResult<T> { source: 'api' | 'sheets' | 'pending'; data: T[]; error?: string; }

export async function fetchBrevoCampaigns(): Promise<EmailCampaignData[]> {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_NOT_CONFIGURED');
  const response = await fetch('https://api.brevo.com/v3/emailCampaigns?limit=100&sort=desc', { headers: { 'api-key': key, accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`BREVO_${response.status}`);
  const payload = await response.json() as { campaigns?: Array<Record<string, unknown>> };
  return (payload.campaigns || []).map((campaign) => {
    const stats = (campaign.statistics || {}) as Record<string, number>;
    const sent = Number(stats.sent || 0); const delivered = Math.max(0, sent - Number(stats.hardBounces || 0) - Number(stats.softBounces || 0));
    return { sendingDate: String(campaign.sentDate || campaign.scheduledAt || ''), campaignId: String(campaign.id || ''), campaignName: String(campaign.name || ''), subject: String(campaign.subject || ''), sent, delivered, deliveredRate: sent ? delivered / sent * 100 : 0, totalOpens: Number(stats.uniqueViews || stats.viewed || 0), openRate: delivered ? Number(stats.uniqueViews || 0) / delivered * 100 : 0, clicked: Number(stats.uniqueClicks || 0), clickRate: delivered ? Number(stats.uniqueClicks || 0) / delivered * 100 : 0, unsubscribed: Number(stats.unsubscriptions || 0), complaints: Number(stats.complaints || 0) };
  });
}

export async function fetchMetaInsights(): Promise<MetaAdData[]> {
  const token = process.env.META_ACCESS_TOKEN; const account = process.env.META_AD_ACCOUNT_ID; const version = process.env.META_API_VERSION || 'v23.0';
  if (!token || !account) throw new Error('META_NOT_CONFIGURED');
  const fields = 'campaign_name,spend,reach,impressions,frequency,clicks,ctr,cpc,cpm,actions,cost_per_action_type';
  const url = new URL(`https://graph.facebook.com/${version}/act_${account.replace(/^act_/, '')}/insights`);
  url.searchParams.set('level', 'campaign'); url.searchParams.set('date_preset', 'maximum'); url.searchParams.set('fields', fields); url.searchParams.set('limit', '500'); url.searchParams.set('access_token', token);
  const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`META_${response.status}`);
  const payload = await response.json() as { data?: Array<Record<string, unknown>> };
  return (payload.data || []).map((row) => { const actions = (row.actions || []) as Array<{ action_type: string; value: string }>; const results = Number(actions[0]?.value || 0); const spend = Number(row.spend || 0); return { campaignName: String(row.campaign_name || ''), status: 'API', spend, reach: Number(row.reach || 0), impressions: Number(row.impressions || 0), frequency: Number(row.frequency || 0), results, costPerResult: results ? spend / results : 0, cpm: Number(row.cpm || 0), linkClicks: Number(actions.find(a => a.action_type === 'link_click')?.value || 0), cpcLink: Number(row.cpc || 0), ctrLink: Number(row.ctr || 0), clicksAll: Number(row.clicks || 0), ctrAll: Number(row.ctr || 0), cpcAll: Number(row.cpc || 0), landingPageViews: Number(actions.find(a => a.action_type === 'landing_page_view')?.value || 0), costPerLpv: 0, notes: '' }; });
}
