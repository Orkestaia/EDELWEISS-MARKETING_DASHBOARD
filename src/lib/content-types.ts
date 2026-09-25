export const FORMATS = ["Reel", "Carousel", "Post", "Story", "Email", "Ad"] as const;
export const STATUSES = ["Idea", "Pending recording", "Material received", "Editing", "Review", "Approved", "Published"] as const;
export const OWNERS = ["Aitor", "Edelweiss", "Shared"] as const;
export const MATERIAL_SOURCES = ["Aitor prepares", "Alex & Valentina record", "Reuse existing material", "No Edelweiss action"] as const;

export type ContentFormat = (typeof FORMATS)[number];
export type ContentStatus = (typeof STATUSES)[number];
export type ContentOwner = (typeof OWNERS)[number];
export type MaterialSource = (typeof MATERIAL_SOURCES)[number];

export interface ContentItem {
  id: string;
  title: string;
  scheduledAt: string;
  platform: string;
  format: ContentFormat;
  category: string;
  campaign: string;
  objective: string;
  owner: ContentOwner;
  status: ContentStatus;
  priority: "Low" | "Medium" | "High";
  materialSource: MaterialSource;
  hook: string;
  creativeIdea: string;
  script: string;
  finalCopy: string;
  cta: string;
  shotList: string;
  instructions: string;
  assetLinks: string[];
  driveUrl: string;
  internalNotes: string;
  publishedAt: string;
  deadline: string;
  duration: string;
  orientation: string;
  visualReference: string;
  delivered: boolean;
  metrics: { reach: number; views: number; retention: number; saves: number; shares: number; comments: number; clicks: number; attributedSales: number };
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  description: string;
  notes: string;
}

export interface SyncStatus {
  provider: "brevo" | "meta" | "instagram";
  configured: boolean;
  status: "pending" | "running" | "success" | "error";
  lastSyncedAt: string | null;
  message: string;
}

export interface MarketingSnapshot {
  provider: string;
  externalId: string;
  snapshotDate: string;
  level: string;
  payload: Record<string, unknown>;
}

export interface InstagramAnalytics {
  configured: boolean;
  lastSyncedAt: string | null;
  account: { followers: number | null; reach: number | null; profileViews: number | null; websiteClicks: number | null };
  followerChange: number | null;
  media: Array<{ id: string; caption: string; type: string; timestamp: string; permalink: string; reach: number | null; views: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null; totalInteractions: number | null }>;
  recommendations: Array<{ title: string; detail: string; confidence: "early signal" | "reliable" }>;
}

export interface BrevoCampaignMetric {
  id: string;
  name: string;
  subject: string;
  sentAt: string;
  sent: number;
  delivered: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  hardBounces: number;
  softBounces: number;
  unsubscribed: number;
}

export interface BrevoAnalytics {
  configured: boolean;
  source: "brevo-api" | "google-sheets-fallback" | "unavailable";
  message: string;
  campaigns: BrevoCampaignMetric[];
  current: { sent: number; delivered: number; opens: number; uniqueOpens: number; clicks: number; uniqueClicks: number; bounces: number; unsubscribed: number };
  previous: { sent: number; delivered: number; opens: number; uniqueOpens: number; clicks: number; uniqueClicks: number; bounces: number; unsubscribed: number };
}

export type OperationsSource = "clover" | "website" | "email" | "manual";
export type OperationsKind = "online-order" | "special-request";
export type OperationsStatus = "new" | "needs-review" | "confirmed" | "in-production" | "ready" | "completed" | "cancelled";

export interface OperationsItem {
  id: string;
  externalId: string | null;
  source: OperationsSource;
  kind: OperationsKind;
  status: OperationsStatus;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  summary: string;
  requestedFor: string | null;
  totalCents: number | null;
  currency: string;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsOverview {
  configured: boolean;
  items: OperationsItem[];
  sources: Array<{ id: OperationsSource; label: string; configured: boolean; note: string }>;
}
