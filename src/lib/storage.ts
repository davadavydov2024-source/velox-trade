import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 МБ
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

export class ImageUploadError extends Error {}

/**
 * Загружает файл изображения в Firebase Storage и возвращает публичную ссылку на него.
 * folder — логическая папка внутри Storage (например "products", "games", "avatars", "ads"),
 * чтобы файлы не сваливались в одну кучу и было проще настраивать правила доступа.
 */
export async function uploadImage(file: File, folder: string): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageUploadError("Разрешены только изображения: JPG, PNG, WEBP, GIF, SVG");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new ImageUploadError("Файл слишком большой (максимум 5 МБ)");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
  const storageRef = ref(storage, path);

  try {
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch (err: any) {
    const code = err?.code as string | undefined;
    if (code === "storage/unauthorized") {
      throw new ImageUploadError(
        "Нет прав на загрузку. Проверь, что правила Firebase Storage опубликованы (файл storage.rules → Firebase Console → Storage → Rules → Publish)."
      );
    }
    if (code === "storage/unknown" || code === "storage/retry-limit-exceeded") {
      throw new ImageUploadError(
        "Firebase Storage недоступен. Проверь, что Storage включён для проекта (Firebase Console → Storage → Get started)."
      );
    }
    if (code === "storage/quota-exceeded") {
      throw new ImageUploadError("Превышена квота хранилища Firebase Storage.");
    }
    console.error("Ошибка загрузки в Storage:", err);
    throw new ImageUploadError("Не удалось загрузить файл. Подробности — в консоли браузера (F12 → Console).");
  }
}
