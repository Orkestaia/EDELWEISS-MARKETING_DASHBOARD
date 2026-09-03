import { fetchMetaAdsData, fetchEmailCampaignData, fetchEmailSubscriberData, fetchOrdersAndRequestsData } from '@/lib/data';
import { DashboardTabs } from '@/components/DashboardTabs';
import { readContentStore } from '@/lib/content-store';
import { fetchBrevoCampaigns, fetchBrevoSubscribers } from '@/lib/marketing-adapters';

export const dynamic = 'force-dynamic'; // Always fetch the latest data on request

export default async function Home() {
  const [metaData, emailData, subscriberData, ordersData, contentStore] = await Promise.all([
    fetchMetaAdsData(),
    fetchBrevoCampaigns().catch(() => fetchEmailCampaignData()),
    fetchBrevoSubscribers().catch(() => fetchEmailSubscriberData()),
    fetchOrdersAndRequestsData(),
    readContentStore()
  ]);

  return (
    <DashboardTabs metaData={metaData} emailData={emailData} subscriberData={subscriberData} ordersData={ordersData} contentItems={contentStore.items} persistence={contentStore.storage} />
  );
}
