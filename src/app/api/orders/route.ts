import { hasDashboardSession } from '@/lib/require-dashboard-session';
import { fetchOrdersAndRequestsData } from '@/lib/data';
export async function GET() {
 if (!await hasDashboardSession()) return Response.json({error:'Unauthorized'},{status:401});
 return Response.json(await fetchOrdersAndRequestsData(), {headers:{'Cache-Control':'private, no-store'}});
}
