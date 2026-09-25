import { rewardRequest } from "@/lib/passport/http";
export async function POST(request: Request) { return rewardRequest(request, false); }
