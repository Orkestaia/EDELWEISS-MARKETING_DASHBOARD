export const CONTENT_FORMATS = ['Reel', 'Carrusel', 'Post', 'Story', 'Email', 'Anuncio'] as const;
export const CONTENT_STATUSES = ['idea', 'pendiente de grabación', 'material recibido', 'edición', 'revisión', 'aprobado', 'publicado'] as const;
export const CONTENT_OWNERS = ['Aitor', 'Edelweiss', 'compartido'] as const;

export type ContentFormat = typeof CONTENT_FORMATS[number];
export type ContentStatus = typeof CONTENT_STATUSES[number];
export type ContentOwner = typeof CONTENT_OWNERS[number];

export interface ContentItem {
  id: string;
  title: string;
  scheduledAt: string;
  platforms: string[];
  format: ContentFormat;
  campaign: string;
  objective: string;
  owner: ContentOwner;
  status: ContentStatus;
  priority: 'alta' | 'media' | 'baja';
  hook: string;
  idea: string;
  script: string;
  copy: string;
  cta: string;
  shotList: string;
  instructions: string;
  fileLinks: string[];
  driveLink: string;
  notes: string;
  publishedAt: string;
  metrics: string;
  need?: {
    request: string;
    how: string;
    duration: string;
    orientation: string;
    deadline: string;
    reference: string;
    delivered: boolean;
  };
}

export interface ContentStore {
  items: ContentItem[];
  updatedAt: string;
  storage: 'redis' | 'seed';
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
