import { fetchMetaAdsData, fetchEmailCampaignData, fetchEmailSubscriberData } from '@/lib/data';
import { DashboardTabs } from '@/components/DashboardTabs';
import { readContentStore } from '@/lib/content-store';

export const dynamic = 'force-dynamic'; // Always fetch the latest data on request

export default async function Home() {
  const [metaData, emailData, subscriberData, contentStore] = await Promise.all([
    fetchMetaAdsData(),
    fetchEmailCampaignData(),
    fetchEmailSubscriberData(),
    readContentStore()
  ]);

  return (
    <DashboardTabs metaData={metaData} emailData={emailData} subscriberData={subscriberData} contentItems={contentStore.items} persistence={contentStore.storage} />
  );
}
