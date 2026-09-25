import { fetchMetaAdsData, fetchEmailCampaignData, fetchEmailSubscriberData } from '@/lib/data';
import { DashboardTabs } from '@/components/DashboardTabs';
import { getSyncStatuses, isDatabaseConfigured, listCampaigns, listContent, listOperationsItems, listSnapshots } from '@/lib/db';
import { buildInstagramAnalytics } from '@/lib/instagram-analytics';
import { fetchBrevoAnalytics } from '@/lib/brevo';
import { requireDashboardSession } from '@/lib/require-dashboard-session';

export const dynamic = 'force-dynamic'; // Always fetch the latest data on request

export default async function Home() {
  await requireDashboardSession();
  const emailDataPromise = fetchEmailCampaignData();
  const [metaData, emailData, subscriberData, content, campaigns, syncStatuses, instagramSnapshots, brevo, operationsItems] = await Promise.all([
    fetchMetaAdsData(), emailDataPromise, fetchEmailSubscriberData(), listContent(), listCampaigns(), getSyncStatuses(), listSnapshots('instagram'), emailDataPromise.then(fetchBrevoAnalytics), listOperationsItems()
  ]);
  const instagramStatus = syncStatuses.find((status) => status.provider === 'instagram');
  const instagram = buildInstagramAnalytics(instagramSnapshots, instagramStatus?.configured ?? false, instagramStatus?.lastSyncedAt ?? null);

  return (
    <main className="min-h-screen"><div className="p-3 md:p-6 lg:px-8">
        <DashboardTabs metaData={metaData} emailData={emailData} subscriberData={subscriberData} content={content} campaigns={campaigns} syncStatuses={syncStatuses} instagram={instagram} brevo={brevo} operations={{ configured: Boolean(process.env.CLOVER_MERCHANT_ID || process.env.N8N_INGEST_SECRET), items: operationsItems, sources: [{ id: 'clover', label: 'Clover online orders', configured: Boolean(process.env.CLOVER_MERCHANT_ID), note: 'Pendiente de revisar el proyecto de preorder, su modelo de pedidos y el método oficial de acceso a Clover.' }, { id: 'website', label: 'Website special requests', configured: Boolean(process.env.N8N_INGEST_SECRET), note: 'Preparado para recibir eventos firmados desde n8n cuando conozcamos el formulario y el payload real.' }] }} persistent={isDatabaseConfigured()} />
      </div>
    </main>
  );
}
