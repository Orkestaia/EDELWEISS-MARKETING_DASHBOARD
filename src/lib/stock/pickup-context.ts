import { isPickupAwareFeed } from "./feed";
import { maineDate, shiftDate } from "./domain";
import type { OnlinePickup, SalesFeed } from "./types";

export interface PickupContext { pickups: readonly OnlinePickup[]; complete: boolean; coveredOrderIds?: readonly string[] }
export interface FeedDay { date: string; complete: boolean; payload: SalesFeed; generatedAt: string }
export function pickupContext(days: readonly FeedDay[], today = maineDate()): PickupContext {
  const complete = new Set(days.filter(day => day.complete && isPickupAwareFeed(day.payload)).map(day => day.date));
  return { complete: Array.from({ length: 90 }, (_, i) => shiftDate(today, -i - 1)).every(date => complete.has(date)),
    pickups: days.flatMap(day => isPickupAwareFeed(day.payload) ? day.payload.onlinePickups : []) };
}
