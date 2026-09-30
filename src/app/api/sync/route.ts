import { hasDashboardSession } from '@/lib/require-dashboard-session';
import { sameOrigin } from '@/lib/dashboard-session';
import { syncMarketing } from '@/lib/marketing-sync';
import { readSyncHistory } from '@/lib/content-store';
import { syncBrevo, syncMeta, syncInstagram, syncAll } from '@/lib/sync';
export const runtime = 'nodejs';
export async function GET(request: Request) {
 if (!await hasDashboardSession()) return Response.json({error:'Unauthorized'},{status:401});
 if(new URL(request.url).searchParams.get('history')==='1') return Response.json({history:await readSyncHistory()});
 return Response.json({error:'Use POST to synchronize'},{status:405});
}
export async function POST(request: Request) {
 if (!await hasDashboardSession()) return Response.json({error:'Unauthorized'},{status:401});
 if (!sameOrigin(request)) return Response.json({error:'Forbidden'},{status:403});
 try {
 const p=new URL(request.url).searchParams.get('provider');
 if(!p) return Response.json(await syncMarketing());
 if(!['brevo','meta','instagram','all'].includes(p)) return Response.json({error:'Unknown provider'},{status:400});
 const result=await (p==='brevo'?syncBrevo():p==='meta'?syncMeta():p==='instagram'?syncInstagram():syncAll());
 return Response.json({ok:true,result});
 }catch {return Response.json({error:'Synchronization failed'},{status:503});}
}
