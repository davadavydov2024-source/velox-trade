/** Лимиты загрузок мессенджера — общие для сервера (билет/проверка) и клиента (предварительная проверка файла). */
export type UploadKind = "image" | "voice" | "videoNote" | "file" | "story-image" | "story-video" | "avatar" | "banner";

const IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MB = 1024 * 1024;

export const UPLOAD_KINDS: Record<UploadKind, { types: string[]; max: number }> = {
  image: { types: IMG, max: 10 * MB },
  avatar: { types: IMG, max: 5 * MB },
  banner: { types: IMG, max: 6 * MB },
  voice: { types: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a", "audio/m4a"], max: 5 * MB },
  videoNote: { types: ["video/mp4", "video/webm", "video/quicktime"], max: 15 * MB },
  "story-image": { types: IMG, max: 10 * MB },
  "story-video": { types: ["video/mp4", "video/webm", "video/quicktime"], max: 25 * MB },
  file: { types: ["application/pdf", "application/zip", "text/plain"], max: 20 * MB },
};
