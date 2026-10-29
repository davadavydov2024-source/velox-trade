import { uploadMedia } from "@/lib/messenger/client";
import { UPLOAD_KINDS, UploadKind as ServerUploadKind } from "@/lib/messenger/uploads";

// Единый клиент API — из lib/messenger/client (сам шлёт Bearer-токен и X-Miligram-Device, при отозванном сеансе выходит из аккаунта).
export { mApi, MApiError } from "@/lib/messenger/client";
export { mApi as mApiPublic } from "@/lib/messenger/client";

export type UploadKind = "image" | "voice" | "videoNote" | "story" | "avatar" | "banner" | "file";
export interface UploadResult {
  url: string;
  width?: number;
  height?: number;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/x-m4a": "m4a", "audio/m4a": "m4a",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "application/pdf": "pdf", "application/zip": "zip", "text/plain": "txt",
};

/** Сжимает фото до maxSide px (JPEG), чтобы влезть в лимит и быстрее грузиться. GIF не трогаем. */
async function prepareImage(file: Blob, maxSide: number): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("bad image"));
      i.src = url;
    });
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (file.type === "image/gif") return { blob: file, width: w0, height: h0 };
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const width = Math.round(w0 * scale);
    const height = Math.round(h0 * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.86));
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Загрузка медиа через билет (api/messenger/upload-ticket → Vercel Blob). Типы и лимиты берутся из
 * lib/messenger/uploads.ts — те же, что проверяет сервер. Возвращает публичную ссылку.
 */
export async function mUpload(
  file: Blob,
  kind: UploadKind,
  opts: { duration?: number; fileName?: string; onProgress?: (p: number) => void } = {}
): Promise<UploadResult> {
  let srvKind: ServerUploadKind =
    kind === "story" ? (file.type.startsWith("video/") ? "story-video" : "story-image") : kind;
  let blob: Blob = file;
  let width: number | undefined;
  let height: number | undefined;

  if (srvKind === "image" || srvKind === "avatar" || srvKind === "banner" || srvKind === "story-image") {
    if (!file.type.startsWith("image/")) throw new Error("Можно загружать только изображения");
    opts.onProgress?.(0.05);
    const p = await prepareImage(file, srvKind === "avatar" ? 512 : 1920);
    blob = p.blob;
    width = p.width;
    height = p.height;
  }

  const base = (blob.type || "").split(";")[0].toLowerCase();
  const rule = UPLOAD_KINDS[srvKind];
  if (!rule.types.includes(base)) {
    throw new Error(srvKind === "file" ? "Файлы можно отправлять только в форматах PDF, ZIP и TXT" : "Этот формат файла не поддерживается");
  }
  if (blob.size > rule.max) throw new Error(`Файл слишком большой (максимум ${Math.round(rule.max / 1024 / 1024)} МБ)`);

  opts.onProgress?.(0.25);
  const url = await uploadMedia(blob, srvKind, EXT[base] ?? "bin");
  opts.onProgress?.(1);
  return { url, width, height };
}
