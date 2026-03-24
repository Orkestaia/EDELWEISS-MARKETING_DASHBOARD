import Papa from 'papaparse';

const META_ADS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTPg-tZgSaVhulvg6y-AUJsFQvEC5Q7gtQU8hBHG6IQx19pKckFhLMafKWZTeaR6A/pub?output=csv';
const EMAIL_CAMPAIGNS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vThdpRjnDv4l-2JNXF_JrLh18dp0bTlyrMxj6MKqlUrxfX6oFKxd-7oHugLSc3ZH7NBu850JDEXdzqi/pub?output=csv';
const EMAIL_SUBSCRIBERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vThdpRjnDv4l-2JNXF_JrLh18dp0bTlyrMxj6MKqlUrxfX6oFKxd-7oHugLSc3ZH7NBu850JDEXdzqi/pub?gid=847482942&single=true&output=csv';

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
  unsubscribed: number;
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
  const res = await fetch(META_ADS_CSV_URL, { next: { revalidate: 60 } });
  const csvText = await res.text();

  return new Promise((resolve) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data.map((row: any) => ({
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
  const res = await fetch(EMAIL_CAMPAIGNS_CSV_URL, { next: { revalidate: 60 } });
  let csvText = await res.text();

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
        const data = results.data.map((row: any) => ({
          sendingDate: row['Sending Date'] || '',
          campaignId: row['Campaign ID'] || '',
          campaignName: row['Campaign Name'] || '',
          subject: row['Subject'] || '',
          sent: parseNumber(row['Sent']),
          delivered: parseNumber(row['Delivered']),
          deliveredRate: parseNumber(row['Delivered Rate']),
          totalOpens: parseNumber(row['Total Opens']),
          openRate: parseNumber(row['Trackable Open Rate']), 
          clicked: parseNumber(row['Clicked']),
          clickRate: parseNumber(row['Click Rate']),
          unsubscribed: parseNumber(row['Unsubscribed']),
        }));
        resolve(data);
      },
    });
  });
}

export async function fetchEmailSubscriberData(): Promise<EmailSubscriberData[]> {
  const res = await fetch(EMAIL_SUBSCRIBERS_CSV_URL, { next: { revalidate: 60 } });
  let csvText = await res.text();
  
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
        const data = results.data.map((row: any) => ({
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
          notes: row['Notes'] || '',
        }));
        resolve(data);
      },
    });
  });
}
