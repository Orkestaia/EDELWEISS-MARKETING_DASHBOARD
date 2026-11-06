import { sameOrigin } from "../dashboard-session";
import type { SupplierService } from "./service";
import { SupplierError } from "./validation";

type Load = () => Promise<SupplierService>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  return json({ error: error instanceof SupplierError ? error.message : "Could not access purchases. Keep your entries and try again." }, error instanceof SupplierError ? error.status : 503);
}
async function readBody(request: Request) {
  const limit = 65536, advertised = request.headers.get("content-length");
  if (advertised && Number(advertised) > limit) throw new SupplierError("The import exceeds 64 KB.", 413);
  if (!request.body) throw new SupplierError("The import body is missing.");
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0, body = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) { await reader.cancel(); throw new SupplierError("The import exceeds 64 KB.", 413); }
      body += decoder.decode(next.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof SupplierError) throw error;
    throw new SupplierError("Enter valid JSON in UTF-8.");
  } finally { reader.releaseLock(); }
}
export async function supplierGet(authorized: boolean, load: Load) {
  if (!authorized) return json({ error: "Unauthorized" }, 401);
  try { return json(await (await load()).view()); } catch (error) { return failure(error); }
}
export async function supplierPost(request: Request, authorized: boolean, load: Load) {
  if (!authorized) return json({ error: "Unauthorized" }, 401);
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  try {
    const raw = await readBody(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SupplierError("Enter a valid object.");
    const { action, actor, ...data } = raw as Record<string, unknown>;
    if (action !== "supplier" && action !== "invoice" && action !== "upsertinvoice") throw new SupplierError("Choose a valid action.");
    const service = await load();
    return json(action === "supplier" ? await service.saveSupplier(data, actor as string) : await service.importInvoice(data, actor as string));
  } catch (error) { return failure(error); }
}
