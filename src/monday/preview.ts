import { postMonday } from "./graphqlClient";
import { DEFAULT_MONDAY_API_URL, type MondayItemDetail } from "./types";

const MAX_PREVIEW_IMAGES = 6;
const MAX_PREVIEW_IMAGE_BYTES = 10 * 1024 * 1024;

export type MondayPreviewImage = {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sourceUrl: string;
};

type MondayAsset = {
  id: string;
  name: string | null;
  url: string | null;
  public_url: string | null;
  file_extension?: string | null;
};

type PreviewImageSource = {
  url: string;
  assetId?: string;
  fileName?: string;
};

export function parseBoardId(boardId: string | undefined): number | undefined {
  if (!boardId) return undefined;
  const parsed = Number(boardId);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCharCode(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCharCode(parseInt(value, 16)));
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n"),
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPreviewBody(item: MondayItemDetail): string {
  const updates = [...(item.updates ?? [])].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return aTime - bTime;
  });
  const chunks: string[] = [];

  for (const update of updates) {
    const updateText = stripHtml(update.body ?? "");
    if (updateText) chunks.push(updateText);

    const replies = [...(update.replies ?? [])].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return aTime - bTime;
    });
    for (const reply of replies) {
      const replyText = stripHtml(reply.body ?? "");
      if (!replyText) continue;
      const creator = reply.creator?.name ? `${reply.creator.name}: ` : "";
      chunks.push(`${creator}${replyText}`);
    }
  }

  return chunks.join("\n\n").trim();
}

function pushImageUrl(urls: Set<string>, rawUrl: string | undefined): void {
  if (!rawUrl) return;
  const url = decodeHtmlEntities(rawUrl).trim();
  if (!/^https?:\/\//i.test(url)) return;
  urls.add(url);
}

function pushImageSource(sources: Map<string, PreviewImageSource>, source: PreviewImageSource): void {
  if (!source.url) return;
  const key = source.assetId ? `asset:${source.assetId}` : source.url;
  if (!sources.has(key)) sources.set(key, source);
}

function extractAssetIdFromTag(tag: string): string | undefined {
  const match = tag.match(/\bdata-asset_id=["']?(\d+)["']?/i) ?? tag.match(/\basset_id=["']?(\d+)["']?/i);
  return match?.[1];
}

function extractImageSourcesFromHtml(html: string | undefined): PreviewImageSource[] {
  if (!html) return [];
  const urls = new Set<string>();
  const sources = new Map<string, PreviewImageSource>();

  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const rawUrl = match[1];
    pushImageUrl(urls, rawUrl);
    const url = rawUrl ? decodeHtmlEntities(rawUrl).trim() : "";
    if (/^https?:\/\//i.test(url)) {
      pushImageSource(sources, { url, assetId: extractAssetIdFromTag(match[0]) });
    }
  }
  for (const match of html.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi)) {
    pushImageUrl(urls, match[1]);
  }
  for (const match of html.matchAll(/\bhref=["']([^"']+\.(?:png|jpe?g|gif|webp)(?:\?[^"']*)?)["']/gi)) {
    pushImageUrl(urls, match[1]);
  }
  for (const match of html.matchAll(/\bdata-asset_id=["']?(\d+)["']?/gi)) {
    const assetId = match[1];
    if (assetId) pushImageSource(sources, { url: "", assetId });
  }

  for (const url of urls) {
    pushImageSource(sources, { url });
  }

  return Array.from(sources.values());
}

function collectPreviewImageSources(item: MondayItemDetail): PreviewImageSource[] {
  const sources = new Map<string, PreviewImageSource>();
  for (const update of item.updates ?? []) {
    for (const source of extractImageSourcesFromHtml(update.body)) pushImageSource(sources, source);
    for (const reply of update.replies ?? []) {
      for (const source of extractImageSourcesFromHtml(reply.body)) pushImageSource(sources, source);
    }
  }
  return Array.from(sources.values()).slice(0, MAX_PREVIEW_IMAGES);
}

async function fetchMondayAssets(assetIds: string[]): Promise<Map<string, MondayAsset>> {
  const ids = Array.from(new Set(assetIds.filter(Boolean)));
  const accessToken = process.env.MONDAY_ACCESS_TOKEN?.trim();
  if (!ids.length || !accessToken) return new Map();

  try {
    const data = await postMonday<{ assets?: MondayAsset[] }>(
      {
        accessToken,
        apiUrl: process.env.MONDAY_API_URL || DEFAULT_MONDAY_API_URL,
      },
      {
        query: `query PreviewAssets($ids: [ID!]!) {
  assets(ids: $ids) {
    id
    name
    url
    public_url
    file_extension
  }
}`,
        operationName: "PreviewAssets",
        variables: { ids },
      },
    );
    return new Map((data.assets ?? []).map((asset) => [asset.id, asset]));
  } catch {
    return new Map();
  }
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

function fileNameFromUrl(url: string, index: number, mimeType: string, preferredName?: string): string {
  const safePreferredName = preferredName?.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (safePreferredName && /\.[a-z0-9]{2,5}$/i.test(safePreferredName)) return safePreferredName;

  try {
    const parsed = new URL(url);
    const rawName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() ?? "");
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "-");
    if (safeName && /\.[a-z0-9]{2,5}$/i.test(safeName)) return safeName;
  } catch {
    // Fall through to a deterministic generated filename.
  }
  return `monday-update-${index + 1}${extensionForMime(mimeType)}`;
}

async function downloadPreviewImage(url: string, index: number): Promise<MondayPreviewImage | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const mimeType = (response.headers.get("content-type") ?? "image/png").split(";")[0].trim().toLowerCase();
    if (!mimeType.startsWith("image/")) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PREVIEW_IMAGE_BYTES) return null;

    const buffer = Buffer.from(arrayBuffer);
    return {
      fileName: fileNameFromUrl(url, index, mimeType),
      mimeType,
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
      sourceUrl: url,
    };
  } catch {
    return null;
  }
}

async function downloadPreviewImageSource(
  source: PreviewImageSource,
  index: number,
  assets: Map<string, MondayAsset>,
): Promise<MondayPreviewImage | null> {
  const asset = source.assetId ? assets.get(source.assetId) : undefined;
  const urls = [asset?.public_url, source.url, asset?.url].filter(Boolean) as string[];

  for (const url of urls) {
    const image = await downloadPreviewImage(url, index);
    if (!image) continue;
    const preferredName = asset?.name ?? source.fileName;
    return {
      ...image,
      fileName: fileNameFromUrl(url, index, image.mimeType, preferredName),
      sourceUrl: asset?.url || source.url || image.sourceUrl,
    };
  }

  return null;
}

export async function buildItemPreview(item: MondayItemDetail): Promise<{
  id: string;
  name: string;
  body: string;
  people: string;
  priority: string;
  images: MondayPreviewImage[];
}> {
  const imageSources = collectPreviewImageSources(item);
  const assets = await fetchMondayAssets(imageSources.flatMap((source) => source.assetId ? [source.assetId] : []));
  const images = (await Promise.all(imageSources.map((source, index) => downloadPreviewImageSource(source, index, assets)))).filter(
    (image): image is MondayPreviewImage => image != null,
  );
  const people = item.column_values.find((cv) => cv.id === "people")?.text ?? "";
  const priority =
    item.column_values.find((cv) => cv.id === "priority" || cv.id === "priority4")?.text ?? "";

  return {
    id: item.id,
    name: item.name,
    body: buildPreviewBody(item),
    people,
    priority,
    images,
  };
}
