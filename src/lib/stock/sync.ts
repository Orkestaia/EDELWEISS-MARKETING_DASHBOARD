import { maineDate, shiftDate } from "./domain";
import { FeedError, FeedWindowError, type FeedSource } from "./feed";
import type { StockService } from "./service";

export async function syncStock(service: StockService, feed: FeedSource, now = new Date(), budgetMs = 200000) {
  const token = await service.acquireSync();
  if (!token) return { status: "busy", message: "A stock sync is already running.", stored: 0 };
  const started = Date.now();
  let stored = 0, partial = 0;
  try {
    await service.saveCatalog(await feed.items());
    const today = maineDate(now);
    const missing = await service.missingDates(today);
    const recent = Array.from({ length: 7 }, (_, i) => shiftDate(today, -i - 1));
    const dates = [...new Set([...recent, ...missing])];
    let attempted = 0, outside = 0;
    let oldestAvailable: string | null = null;
    for (const date of dates) {
      if (Date.now() - started > budgetMs) break;
      if (oldestAvailable && date < oldestAvailable) { outside++; attempted++; continue; }
      let snapshot;
      try { snapshot = await feed.sales(date); }
      catch (error) {
        if (error instanceof FeedWindowError && date < error.oldestAvailable) { oldestAvailable = error.oldestAvailable; outside++; attempted++; continue; }
        throw error;
      }
      await service.saveSnapshot(snapshot);
      attempted++;
      if (snapshot.complete) stored++; else partial++;
    }
    const remaining = dates.length - attempted + partial;
    const status = remaining === 0 ? "ok" : "partial";
    const message = `${stored} complete day(s) saved or refreshed. ${remaining} day(s) still pending${partial ? ` (${partial} incomplete)` : ""}.${outside ? ` ${outside} outside Clover's available window.` : ""}`;
    await service.logSync(status, message);
    return { status, message, stored };
  } catch (error) {
    const message = `${error instanceof FeedError ? error.message : "Stock sync failed."} ${stored} complete day(s) saved; retry to continue.`;
    await service.logSync("error", message);
    return { status: "error", message, stored };
  } finally { await service.releaseSync(token); }
}
