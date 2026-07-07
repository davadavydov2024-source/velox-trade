import { upload } from "@vercel/blob/client";
import { auth } from "./firebase";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 МБ
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

export class ImageUploadError extends Error {}

/**
 * Загружает файл изображения напрямую в Vercel Blob (без Firebase Storage — не требует
 * платного тарифа Blaze) и возвращает публичную ссылку на него.
 * folder — логическая папка (например "products", "games", "avatars", "ads", "broadcasts"),
 * по ней сервер решает, кому разрешена загрузка (см. /api/blob/upload).
 */
export async function uploadImage(file: File, folder: string): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageUploadError("Разрешены только изображения: JPG, PNG, WEBP, GIF, SVG");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new ImageUploadError("Файл слишком большой (максимум 5 МБ)");
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ImageUploadError("Нужно войти в аккаунт, чтобы загружать файлы");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

  try {
    const idToken = await currentUser.getIdToken();
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      clientPayload: JSON.stringify({ idToken }),
    });
    return blob.url;
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "";
    if (message.includes("Доступ только для администраторов")) {
      throw new ImageUploadError("Загружать сюда может только администратор.");
    }
    if (message.includes("Не авторизован")) {
      throw new ImageUploadError("Сессия истекла — войди в аккаунт заново и попробуй снова.");
    }
    console.error("Ошибка загрузки в Vercel Blob:", err);
    throw new ImageUploadError("Не удалось загрузить файл. Подробности — в консоли браузера (F12 → Console).");
  }
}
