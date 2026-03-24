import { fetchMetaAdsData, fetchEmailData } from '@/lib/data';
import { DashboardTabs } from '@/components/DashboardTabs';

export const revalidate = 60; // Revalidate every 60 seconds

export default async function Home() {
  const [metaData, emailData] = await Promise.all([
    fetchMetaAdsData(),
    fetchEmailData()
  ]);

  return (
    <main className="min-h-screen bg-[#020617] text-slate-50 relative selection:bg-indigo-500/30">
      {/* Background gradients for premium feel */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] rounded-full bg-purple-600/10 blur-[150px]" />
        <div className="absolute top-[40%] right-[10%] w-[30%] h-[30%] rounded-full bg-emerald-600/5 blur-[100px]" />
      </div>

      <div className="p-4 md:p-8 lg:p-12">
        <DashboardTabs metaData={metaData} emailData={emailData} />
      </div>
    </main>
  );
}
