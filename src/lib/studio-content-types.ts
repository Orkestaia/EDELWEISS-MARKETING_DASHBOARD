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

