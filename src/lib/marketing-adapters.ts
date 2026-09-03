import 'server-only';
import type { EmailCampaignData, EmailSubscriberData, MetaAdData } from './data';

export interface AdapterResult<T> { source: 'api' | 'sheets' | 'pending'; data: T[]; error?: string; }

export async function fetchBrevoCampaigns(): Promise<EmailCampaignData[]> {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_NOT_CONFIGURED');
  const response = await fetch('https://api.brevo.com/v3/emailCampaigns?limit=100&sort=desc&status=sent&statistics=globalStats', { headers: { 'api-key': key, accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`BREVO_${response.status}`);
  const payload = await response.json() as { campaigns?: Array<Record<string, unknown>> };
  return (payload.campaigns || []).map((campaign) => {
    const statistics = (campaign.statistics || {}) as Record<string, unknown>;
    const stats = (statistics.globalStats || (statistics.campaignStats as Array<Record<string, number>> | undefined)?.[0] || statistics) as Record<string, number>;
    const sent = Number(stats.sent || 0); const delivered = Math.max(0, sent - Number(stats.hardBounces || 0) - Number(stats.softBounces || 0));
    return { sendingDate: String(campaign.sentDate || campaign.scheduledAt || ''), campaignId: String(campaign.id || ''), campaignName: String(campaign.name || ''), subject: String(campaign.subject || ''), sent, delivered, deliveredRate: sent ? delivered / sent * 100 : 0, totalOpens: Number(stats.uniqueViews || stats.viewed || 0), openRate: delivered ? Number(stats.uniqueViews || 0) / delivered * 100 : 0, clicked: Number(stats.uniqueClicks || 0), clickRate: delivered ? Number(stats.uniqueClicks || 0) / delivered * 100 : 0, unsubscribed: Number(stats.unsubscriptions || 0), complaints: Number(stats.complaints || 0) };
  });
}

type BrevoContact = { createdAt?: string; emailBlacklisted?: boolean; attributes?: Record<string, unknown> };

export async function fetchBrevoSubscribers(): Promise<EmailSubscriberData[]> {
  const key = process.env.BREVO_API_KEY; if (!key) throw new Error('BREVO_NOT_CONFIGURED');
  const listId = process.env.BREVO_LIST_ID; const contacts: BrevoContact[] = []; let offset = 0; let total = 0;
  do {
    const path = listId ? `/contacts/lists/${listId}/contacts` : '/contacts';
    const response = await fetch(`https://api.brevo.com/v3${path}?limit=500&offset=${offset}&sort=desc`, { headers: { 'api-key': key, accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`BREVO_CONTACTS_${response.status}`);
    const payload = await response.json() as { contacts?: BrevoContact[]; count?: number };
    contacts.push(...(payload.contacts || [])); total = Number(payload.count || contacts.length); offset += 500;
  } while (contacts.length < total && offset < 10000);
  const birthdayAttribute = process.env.BREVO_BIRTHDAY_ATTRIBUTE || 'DOB';
  const active = contacts.filter(contact => !contact.emailBlacklisted);
  const byDate = new Map<string, { subscribers: number; birthdays: number }>();
  active.forEach(contact => {
    const date = String(contact.createdAt || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const day = byDate.get(date) || { subscribers: 0, birthdays: 0 };
    day.subscribers += 1;
    if (contact.attributes?.[birthdayAttribute]) day.birthdays += 1;
    byDate.set(date, day);
  });
  let cumulativeSubscribers = active.length - [...byDate.values()].reduce((sum, day) => sum + day.subscribers, 0);
  let cumulativeBirthdays = active.filter(contact => Boolean(contact.attributes?.[birthdayAttribute]) && !/^\d{4}-\d{2}-\d{2}$/.test(String(contact.createdAt || '').slice(0, 10))).length;
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, day], index, days) => {
    cumulativeSubscribers += day.subscribers; cumulativeBirthdays += day.birthdays;
    const sevenDayStart = Math.max(0, index - 6);
    const newSubscribers7d = days.slice(sevenDayStart, index + 1).reduce((sum, [, entry]) => sum + entry.subscribers, 0);
    return { snapshotDate: date, emailsSent: 0, deliveredRate: 0, estimatedOpenersRate: 0, trackableOpenersRate: 0, uniqueClickersRate: 0, bouncedRate: 0, hardBounceRate: 0, softBounceRate: 0, complaintRate: 0, blockedRate: 0, newSubscribers: day.subscribers, newSubscribers7d, totalSubscribers: cumulativeSubscribers, birthdaysProvided: cumulativeBirthdays, notes: `${day.birthdays} new contacts with ${birthdayAttribute}` };
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
