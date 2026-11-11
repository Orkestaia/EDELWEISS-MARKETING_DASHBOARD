import type { Family } from "./types";

/** A single product's inputs. Pars run from Monday through Sunday. */
export interface PlanningProduct {
  key: string;
  family: Family;
  pars: readonly number[];
  unitsPerTray: number;
  bufferK: number;
  targetSelloutTime: string;
}

/** Final daily sales for this product; missing dates are not zero-sales days. */
export interface PlanningSale {
  date: string;
  units: number;
  /** v1.2 counter-only denominator; online payments do not train sell-out curves. */
  inStoreUnits?: number;
  hourly: Readonly<Record<string, number>>;
  complete?: boolean;
  /** Optional explicit evidence, never inferred from a historical stock count. */
  soldOut?: boolean;
  soldOutAt?: string | null;
}

export interface PlanningClose {
  date: string;
  baked: number | null;
  leftover: number | null;
  soldOut: boolean;
  soldOutAt: string | null;
  status: "draft" | "closed";
}

export interface PlanningEvent {
  id: string;
  dateFrom: string;
  dateTo: string;
  name: string;
  factor: number;
  scope: "all" | "family" | "product";
  scopeValue: string | null;
  closed: boolean;
}

export interface PlanningSettings {
  baseWeeks: number;
  censorCap: number;
  closingTime: string;
}

export interface PlanInput {
  date: string;
  product: PlanningProduct;
  sales: readonly PlanningSale[];
  closes: readonly PlanningClose[];
  events: readonly PlanningEvent[];
  settings: PlanningSettings;
  preorders: number;
}

export interface DemandCorrection {
  date: string;
  units: number;
  demand: number;
  soldOut: boolean;
  soldOutAt: string | null;
  share: number | null;
  correctionFactor: number;
  capped: boolean;
}

export interface PlanExplanation {
  base: number;
  baseSource: "history" | "par";
  manualPar: number;
  sampleDates: string[];
  sampleCount: number;
  standardDeviation: number;
  buffer: number;
  seasonFactor: 1;
  seasonReason: string;
  eventFactor: number;
  events: { id: string; name: string; factor: number; closed: boolean }[];
  corrections: DemandCorrection[];
  warnings: string[];
  summary: string;
  closed: boolean;
  preordersRequireReview: boolean;
}

export interface PlanResult {
  suggested: number;
  planned: number;
  preorders: number;
  explain: PlanExplanation;
}
