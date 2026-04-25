import { mkdirSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";
import { getGlobalImagesDir, getTicketImagesDir } from "./paths";

const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);

function validateAndSanitize(originalName: string): { safeName: string; ext: string } {
  const safe = basename(originalName);
  const ext = extname(safe).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error(`File type not allowed: ${ext || "(none)"}. Allowed: jpg, jpeg, png, gif, webp, svg`);
  }
  return { safeName: safe, ext };
}

export async function saveGlobalImage(prefix: string, buffer: Buffer, originalName: string): Promise<string> {
  const { ext } = validateAndSanitize(originalName);
  const dir = getGlobalImagesDir();
  mkdirSync(dir, { recursive: true });
  const fileName = `${prefix}${ext}`;
  const filePath = join(dir, fileName);
  writeFileSync(filePath, buffer);
  return filePath;
}

export async function saveTicketImage(uid: string, buffer: Buffer, originalName: string): Promise<string> {
  const { safeName, ext } = validateAndSanitize(originalName);
  const dir = getTicketImagesDir(uid);
  mkdirSync(dir, { recursive: true });
  const nameWithoutExt = basename(safeName, ext).replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${Date.now()}-${nameWithoutExt}${ext}`;
  const filePath = join(dir, fileName);
  writeFileSync(filePath, buffer);
  return filePath;
}
