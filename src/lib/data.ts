import Papa from 'papaparse';
import { readFile } from 'node:fs/promises';

const SHEET_ID = '1Y0U5fpS8AnCU0iiQELSVyBxCHYbxMNrbeiJmaF4V77I';
const sheetCsv = (gid: string) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
const META_ADS_CSV_URL = sheetCsv('341991106');
const EMAIL_CAMPAIGNS_CSV_URL = sheetCsv('651168549');
const EMAIL_SUBSCRIBERS_CSV_URL = EMAIL_CAMPAIGNS_CSV_URL;
const ORDERS_CSV_URL = sheetCsv('27254474');
const SPECIAL_ORDERS_CSV_URL = sheetCsv('1454652480');
const WHOLESALE_CSV_URL = sheetCsv('150858658');

async function loadCsv(url: string, fallbackFile?: URL): Promise<string> {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.text();
  } catch {
    if (!fallbackFile) return '';
    return readFile(fallbackFile, 'utf8').catch(() => '');
  }
}

export interface MetaAdData {
  campaignName: string;
  status: string;
  spend: number;
  reach: number;
  impressions: number;
  frequency: number;
  results: number;
  costPerResult: number;
  cpm: number;
  linkClicks: number;
  cpcLink: number;
  ctrLink: number;
  clicksAll: number;
  ctrAll: number;
  cpcAll: number;
  landingPageViews: number;
  costPerLpv: number;
  notes: string;
}

export interface EmailCampaignData {
  sendingDate: string;
  campaignId: string;
  campaignName: string;
  subject: string;
  sent: number;
  delivered: number;
  deliveredRate: number;
  totalOpens: number;
  openRate: number;
  clicked: number;
  clickRate: number;
  clickToOpenRate?: number;
  unsubscribed: number;
  unsubRate?: number;
  complaints?: number;
  complaintsRate?: number;
  appleMppOpens?: number;
}

export interface EmailSubscriberData {
  snapshotDate: string;
  emailsSent: number;
  deliveredRate: number;
  estimatedOpenersRate: number;
  trackableOpenersRate: number;
  uniqueClickersRate: number;
  bouncedRate: number;
  hardBounceRate: number;
  softBounceRate: number;
  complaintRate: number;
  blockedRate: number;
  newSubscribers7d?: number;
  totalSubscribers?: number;
  birthdaysProvided?: number;
  notes: string;
}

export interface OrderData { orderId: string; receivedAt: string; pickupDate: string; pickupTime: string; customerName: string; customerEmail: string; customerPhone: string; items: string; totalUsd: number; notes: string; state: string; isTest: boolean; }
export interface SpecialOrderData { receivedAt: string; name: string; email: string; phone: string; eventType: string; eventDate: string; guests: number; message: string; }
export interface WholesaleInquiryData { receivedAt: string; businessName: string; contactName: string; email: string; phone: string; businessType: string; message: string; qualityNote: string; }
export interface OrdersAndRequestsData { orders: OrderData[]; specialOrders: SpecialOrderData[]; wholesale: WholesaleInquiryData[]; }

const parseNumber = (val: string | undefined): number => {
  if (!val) return 0;
  // Handle European format "35,22" -> 35.22 and remove % signs
  const cleaned = val.replace('%', '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export async function fetchMetaAdsData(): Promise<MetaAdData[]> {
  const csvText = await loadCsv(META_ADS_CSV_URL, new URL('../../meta.csv', import.meta.url));

  return new Promise((resolve) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = (results.data as Record<string, string>[]).map((row) => ({
          campaignName: row['Campaign Name'] || row['Campaign name'] || '',
          status: row['Status'] || row['Campaign delivery'] || '',
          spend: parseNumber(row['Spend ($)'] || row['Amount spent (USD)']),
          reach: parseNumber(row['Reach']),
          impressions: parseNumber(row['Impressions']),
          frequency: parseNumber(row['Frequency']),
          results: parseNumber(row['Results']),
          costPerResult: parseNumber(row['Cost per Result ($)'] || row['Cost per results']),
          cpm: parseNumber(row['CPM ($)'] || row['CPM (cost per 1,000 impressions) (USD)']),
          linkClicks: parseNumber(row['Link Clicks'] || row['Link clicks']),
          cpcLink: parseNumber(row['CPC Link ($)'] || row['CPC (cost per link click) (USD)']),
          ctrLink: parseNumber(row['CTR Link (%)'] || row['CTR (link click-through rate)']),
          clicksAll: parseNumber(row['Clicks (All)'] || row['Clicks (all)']),
          ctrAll: parseNumber(row['CTR (All) (%)'] || row['CTR (all)']),
          cpcAll: parseNumber(row['CPC (All) ($)'] || row['CPC (all) (USD)']),
          landingPageViews: parseNumber(row['Landing Page Views'] || row['Landing page views']),
          costPerLpv: parseNumber(row['Cost per LPV ($)'] || row['Cost per landing page view (USD)']),
          notes: row['Notes'] || '',
        }));
        resolve(data.map((campaign) => ({
          ...campaign,
          frequency: campaign.reach ? campaign.impressions / campaign.reach : 0,
          costPerResult: campaign.results ? campaign.spend / campaign.results : 0,
          cpm: campaign.impressions ? campaign.spend / campaign.impressions * 1000 : 0,
          cpcLink: campaign.linkClicks ? campaign.spend / campaign.linkClicks : 0,
          ctrLink: campaign.impressions ? campaign.linkClicks / campaign.impressions * 100 : 0,
          ctrAll: campaign.impressions ? campaign.clicksAll / campaign.impressions * 100 : 0,
          cpcAll: campaign.clicksAll ? campaign.spend / campaign.clicksAll : 0,
          costPerLpv: campaign.landingPageViews ? campaign.spend / campaign.landingPageViews : 0,
        })));
      },
    });
  });
}

export async function fetchEmailCampaignData(): Promise<EmailCampaignData[]> {
  let csvText = await loadCsv(EMAIL_CAMPAIGNS_CSV_URL, new URL('../../email.csv', import.meta.url));

  // The email CSV has 6 lines of header/summary before the actual table starts.
  // We need to strip those lines to parse safely with headers.
  const lines = csvText.split('\n');
  const headerIndex = lines.findIndex(line => line.startsWith('Sending Date,Campaign ID'));
  
  if (headerIndex !== -1) {
    csvText = lines.slice(headerIndex).join('\n');
  }

  return new Promise((resolve) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const data = rows.filter(row => !row['record_type'] || row['record_type'] === 'campaign').map((row) => {
          const sent = parseNumber(row['sent'] || row['Sent']); const delivered = parseNumber(row['delivered'] || row['Delivered']); const opens = parseNumber(row['unique_opens'] || row['Total Opens']); const clicks = parseNumber(row['unique_clicks'] || row['Clicked']);
          return { sendingDate: row['occurred_at'] || row['Sending Date'] || '', campaignId: row['campaign_id'] || row['Campaign ID'] || '', campaignName: row['campaign_name'] || row['Campaign Name'] || '', subject: row['subject'] || row['Subject'] || '', sent, delivered, deliveredRate: sent ? delivered / sent * 100 : parseNumber(row['Delivered Rate']), totalOpens: opens, appleMppOpens: parseNumber(row['Apple MPP Opens']), openRate: delivered ? opens / delivered * 100 : parseNumber(row['Trackable Open Rate']), clicked: clicks, clickRate: delivered ? clicks / delivered * 100 : parseNumber(row['Click Rate']), unsubscribed: parseNumber(row['unsubscribed'] || row['Unsubscribed']), complaints: parseNumber(row['complaints'] || row['Complaints']) };
        });
        resolve(data);
      },
    });
  });
}

export async function fetchEmailSubscriberData(): Promise<EmailSubscriberData[]> {
  let csvText = await loadCsv(EMAIL_SUBSCRIBERS_CSV_URL);
  
  // The subscriber CSV has 6 lines of header before the actual data starts.
  // We need to strip those lines.
  const lines = csvText.split('\n');
  const headerIndex = lines.findIndex(line => line.startsWith('Snapshot Date,Emails Sent,Delivered %,Estimated Openers %'));
  
  if (headerIndex !== -1) {
    csvText = lines.slice(headerIndex).join('\n');
  }

  return new Promise((resolve) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const eventRows = rows.filter(row => row['record_type'] === 'subscriber');
        const grouped = new Map<string, Record<string, string>[]>(); eventRows.forEach(row => { const date = (row['occurred_at'] || '').slice(0, 10); grouped.set(date, [...(grouped.get(date) || []), row]); });
        const normalized: Record<string, string>[] = [...grouped.entries()].map(([date, entries]) => ({ 'Snapshot Date': date, 'News subscribers 7D': String(entries.filter(x => String(x['new_subscriber']).toUpperCase() === 'TRUE').length), Notes: `${entries.filter(x => String(x['birthday_provided']).toUpperCase() === 'TRUE').length} birthdays provided` }));
        const sourceRows: Record<string, string>[] = normalized.length ? normalized : rows;
        const data = sourceRows.map((row) => ({
          snapshotDate: row['Snapshot Date'] || '',
          emailsSent: parseNumber(row['Emails Sent']),
          deliveredRate: parseNumber(row['Delivered %']),
          estimatedOpenersRate: parseNumber(row['Estimated Openers %']),
          trackableOpenersRate: parseNumber(row['Trackable Openers %']),
          uniqueClickersRate: parseNumber(row['Unique Clickers %']),
          bouncedRate: parseNumber(row['Bounced %']),
          hardBounceRate: parseNumber(row['Hard Bounce %']),
          softBounceRate: parseNumber(row['Soft Bounce %']),
          complaintRate: parseNumber(row['Complaint %']),
          blockedRate: parseNumber(row['Blocked %']),
          newSubscribers7d: parseNumber(row['News suscribers 7D'] || row['News subscribers 7D']),
          notes: row['Notes'] || '',
        }));
        resolve(data);
      },
    });
  });
}

async function parseRows(url: string): Promise<Record<string, string>[]> { const text = await loadCsv(url); if (!text) return []; const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }); return parsed.data; }

export async function fetchOrdersAndRequestsData(): Promise<OrdersAndRequestsData> {
  const [ordersRows, specialRows, wholesaleRows] = await Promise.all([parseRows(ORDERS_CSV_URL), parseRows(SPECIAL_ORDERS_CSV_URL), parseRows(WHOLESALE_CSV_URL)]);
  return {
    orders: ordersRows.map(row => ({ orderId: row.order_id || '', receivedAt: row.received_at || '', pickupDate: row.pickup_date || '', pickupTime: row.pickup_time || '', customerName: row.customer_name || '', customerEmail: row.customer_email || '', customerPhone: row.customer_phone || '', items: row.items || '', totalUsd: parseNumber(row.total_usd), notes: row.notes || '', state: row.clover_state || '', isTest: String(row.is_likely_test).toLowerCase() === 'true' })),
    specialOrders: specialRows.map(row => ({ receivedAt: row.received_at || '', name: row.name || '', email: row.email || '', phone: row.phone || '', eventType: row.event_type || '', eventDate: row.event_date || '', guests: parseNumber(row.guests_approx), message: row.message || '' })),
    wholesale: wholesaleRows.map(row => ({ receivedAt: row.received_at || '', businessName: row.business_name || '', contactName: row.contact_name || '', email: row.email || '', phone: row.phone || '', businessType: row.business_type || '', message: row.message || '', qualityNote: row.data_quality_note || '' })),
  };
}
