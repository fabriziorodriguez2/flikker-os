export type WidgetType = "BADGE" | "REVIEW_LIST" | "REVIEW_GRID";
export type WidgetMode = "toast" | "carousel" | "grid";
export type WidgetPosition = "bottom_left" | "bottom_right";
export type WidgetStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

export interface Widget {
  id: string;
  businessId: string;
  name: string;
  status: WidgetStatus;
  type: WidgetType;
  mode: WidgetMode;
  position: WidgetPosition;
  publicToken: string;
  title: string | null;
  maxItems: number;
  minStars: number;
  primaryColor: string | null;
  rotationSeconds: number;
  showAuthorName: boolean;
  showDate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetCreateInput {
  name: string;
  type: WidgetType;
  mode: WidgetMode;
  position: WidgetPosition;
  title: string;
  maxItems: number;
  minStars: number;
  primaryColor: string;
  rotationSeconds: number;
  showAuthorName: boolean;
  showDate: boolean;
}

export interface WidgetEmbedInfo {
  widgetId: string;
  publicToken: string;
  publicUrl: string;
  embedType: string;
  snippet: string;
}

export interface WidgetPreviewReview {
  id?: string;
  rating: number;
  authorDisplayName: string | null;
  reviewedAt?: string | null;
  content: string | null;
}
