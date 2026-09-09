import { auth } from "./firebase";

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 МБ
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

export class ImageUploadError extends Error {}

/**
 * Загружает файл изображения через наш собственный сервер (/api/blob/upload) в Vercel Blob.
 * Простая схема в один запрос — без отдельного протокола обмена токенами, который раньше
 * периодически давал неинформативную ошибку "Failed to retrieve the client token".
 */
export async function uploadImage(file: File, folder: string): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageUploadError("Разрешены только изображения: JPG, PNG, WEBP, GIF, SVG");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new ImageUploadError("Файл слишком большой (максимум 4 МБ)");
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ImageUploadError("Нужно войти в аккаунт, чтобы загружать файлы");
  }

  const idToken = await currentUser.getIdToken();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  formData.append("idToken", idToken);

  let res: Response;
  try {
    res = await fetch("/api/blob/upload", { method: "POST", body: formData });
  } catch (err) {
    console.error("Сетевая ошибка при загрузке файла:", err);
    throw new ImageUploadError("Не удалось связаться с сервером. Проверь подключение к интернету.");
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // тело ответа не JSON — ниже сработает общая ветка по res.ok
  }

  if (!res.ok) {
    throw new ImageUploadError(data?.error || `Не удалось загрузить файл (код ${res.status})`);
  }
  if (!data?.url) {
    throw new ImageUploadError("Сервер не вернул ссылку на файл. Подробности — в логах сервера.");
  }

  return data.url as string;
}
