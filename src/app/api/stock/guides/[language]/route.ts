import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { stockAuthorized, stockJson } from "@/lib/stock/http";

export const runtime = "nodejs";
const filenames: Record<string, string> = { en: "edelweiss-stock-guide-en.pdf", es: "edelweiss-stock-guide-es.pdf" };
export async function GET(_request: Request, { params }: { params: Promise<{ language: string }> }) {
  if (!await stockAuthorized()) return stockJson({ error: "Unauthorized" }, 401);
  const { language } = await params;
  const filename = Object.hasOwn(filenames, language) ? filenames[language] : null;
  if (!filename) return stockJson({ error: "Guide not found." }, 404);
  try {
    const bytes = await readFile(join(process.cwd(), "resources", "stock-guides", filename));
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return stockJson({ error: "The guide could not be loaded. Please try again." }, 503); }
}
