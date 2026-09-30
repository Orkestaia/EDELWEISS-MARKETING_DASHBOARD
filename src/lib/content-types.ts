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
