import Papa from 'papaparse';
import { readFile } from 'node:fs/promises';

const META_ADS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1yV-aTSES68tPit8O17e0-tJAlHssBxJqQerlXbgvhPI/export?format=csv&gid=681302842';
const EMAIL_CAMPAIGNS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1tThcq-gGpWQ2DKZbMqiRv21YkeDuZAxjZMLnmejsrss/export?format=csv&gid=254736409';
const EMAIL_SUBSCRIBERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1tThcq-gGpWQ2DKZbMqiRv21YkeDuZAxjZMLnmejsrss/export?format=csv&gid=847482942';

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
  notes: string;
}

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
          campaignName: row['Campaign Name'] || '',
          status: row['Status'] || '',
          spend: parseNumber(row['Spend ($)']),
          reach: parseNumber(row['Reach']),
          impressions: parseNumber(row['Impressions']),
          frequency: parseNumber(row['Frequency']),
          results: parseNumber(row['Results']),
          costPerResult: parseNumber(row['Cost per Result ($)']),
          cpm: parseNumber(row['CPM ($)']),
          linkClicks: parseNumber(row['Link Clicks']),
          cpcLink: parseNumber(row['CPC Link ($)']),
          ctrLink: parseNumber(row['CTR Link (%)']),
          clicksAll: parseNumber(row['Clicks (All)']),
          ctrAll: parseNumber(row['CTR (All) (%)']),
          cpcAll: parseNumber(row['CPC (All) ($)']),
          landingPageViews: parseNumber(row['Landing Page Views']),
          costPerLpv: parseNumber(row['Cost per LPV ($)']),
          notes: row['Notes'] || '',
        }));
        resolve(data);
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
        const data = (results.data as Record<string, string>[]).map((row) => ({
          sendingDate: row['Sending Date'] || '',
          campaignId: row['Campaign ID'] || '',
          campaignName: row['Campaign Name'] || '',
          subject: row['Subject'] || '',
          sent: parseNumber(row['Sent']),
          delivered: parseNumber(row['Delivered']),
          deliveredRate: parseNumber(row['Delivered Rate']),
          totalOpens: parseNumber(row['Total Opens']),
          appleMppOpens: parseNumber(row['Apple MPP Opens']),
          openRate: parseNumber(row['Trackable Open Rate']), 
          clicked: parseNumber(row['Clicked']),
          clickRate: parseNumber(row['Click Rate']),
          clickToOpenRate: parseNumber(row['Click-to-Open Rate'] || row['Click-to-Open rate']),
          unsubscribed: parseNumber(row['Unsubscribed']),
          unsubRate: parseNumber(row['Unsub Rate'] || row['Unsubscription rate']),
          complaints: parseNumber(row['Complaints']),
          complaintsRate: parseNumber(row['Complaints Rate'] || row['Complaints rate']),
        }));
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
        const data = (results.data as Record<string, string>[]).map((row) => ({
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
