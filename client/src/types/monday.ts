export interface MondayNotStartedItem {
  id: string;
  name: string;
  updated_at?: string;
  group?: {
    id: string;
    title: string;
  };
  column_values?: { id: string; text: string | null }[];
}

export interface MondayItemPreview {
  id: string;
  name: string;
  body: string;
  people: string;
  priority: string;
  images: MondayPreviewImage[];
}

export interface MondayPreviewImage {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sourceUrl?: string;
}
