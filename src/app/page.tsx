import { requireDashboardSession } from '@/lib/require-dashboard-session';
import { getSyncStatuses, isDatabaseConfigured, listSnapshots } from '@/lib/db';
import { buildInstagramAnalytics } from '@/lib/instagram-analytics';
import { fetchMetaAdsData, fetchEmailCampaignData, fetchEmailSubscriberData, fetchOrdersAndRequestsData } from '@/lib/data';
import { DashboardTabs } from '@/components/DashboardTabs';
import { readContentStore } from '@/lib/content-store';
import { fetchBrevoCampaigns, fetchBrevoSubscribers } from '@/lib/marketing-adapters';

export const dynamic = 'force-dynamic'; // Always fetch the latest data on request

export default async function Home() {
  await requireDashboardSession();
  const [syncStatuses, snapshots] = await Promise.all([getSyncStatuses(), listSnapshots("instagram")]);
  const status = syncStatuses.find(s => s.provider === "instagram");
  const instagram = buildInstagramAnalytics(snapshots, status?.configured ?? false, status?.lastSyncedAt ?? null);
  const [metaData, emailData, subscriberData, ordersData, contentStore] = await Promise.all([
    fetchMetaAdsData(),
    fetchBrevoCampaigns().catch(() => fetchEmailCampaignData()),
    fetchBrevoSubscribers().catch(() => fetchEmailSubscriberData()),
    fetchOrdersAndRequestsData(),
    readContentStore()
  ]);

  return (
    <DashboardTabs metaData={metaData} emailData={emailData} subscriberData={subscriberData} ordersData={ordersData} contentItems={contentStore.items} persistence={contentStore.storage} syncStatuses={syncStatuses} instagram={instagram} persistent={isDatabaseConfigured()} />
  );
}
