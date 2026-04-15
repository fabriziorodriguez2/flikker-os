export type WidgetType = 'BADGE' | 'REVIEW_LIST' | 'REVIEW_GRID';
export type WidgetStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface Widget {
  id: string;
  businessId: string;
  name: string;
  status: WidgetStatus;
  type: WidgetType;
  publicToken: string;
  title: string | null;
  maxItems: number;
  showAuthorName: boolean;
  showDate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetCreateInput {
  name: string;
  type: WidgetType;
  title: string;
  maxItems: number;
  showAuthorName: boolean;
  showDate: boolean;
}

export interface WidgetEmbedInfo {
  widgetId: string;
  publicToken: string;
  publicUrl: string;
  embedType: string;
}

export interface WidgetPreviewReview {
  id?: string;
  rating: number;
  authorDisplayName: string | null;
  reviewedAt?: string | null;
  content: string | null;
}
