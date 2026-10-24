import { auth } from "@/lib/firebase";
import { uploadImage, ImageUploadError } from "@/lib/storage";
import { MX_FEATURES } from "./features";

export class MApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function idToken(): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new MApiError("Нужно войти в аккаунт", 401);
  return token;
}

async function parse<T>(res: Response): Promise<T> {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // пустой/не-JSON ответ
  }
  if (!res.ok) throw new MApiError(data?.error || "Что-то пошло не так. Попробуй ещё раз.", res.status);
  return data as T;
}

/** Запрос к /api/messenger/<path> с токеном входа. Ошибки приходят как MApiError с текстом для показа. */
export async function mApi<T = any>(path: string, body?: unknown, method: "POST" | "GET" | "DELETE" = "POST"): Promise<T> {
  const token = await idToken();
  const res = await fetch(`/api/messenger/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  return parse<T>(res);
}

/** Запросы без токена (gate, register). */
export async function mApiPublic<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/messenger/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return parse<T>(res);
}

export type UploadKind = "image" | "voice" | "videoNote" | "story" | "avatar" | "file";
export interface UploadResult {
  url: string;
  width?: number;
  height?: number;
}

/** Сжимает фото до maxSide px по длинной стороне (JPEG), чтобы влезть в лимит загрузки 4 МБ. GIF не трогаем. */
async function prepareImage(file: Blob, name: string, maxSide: number): Promise<{ file: File; width: number; height: number }> {
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
    if (file.type === "image/gif") return { file: new File([file], name, { type: "image/gif" }), width: w0, height: h0 };
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
    return { file: new File([blob], name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" }), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Пока на сервере нет POST /api/messenger/upload: фото уходят через существующий uploadImage
 * (Vercel Blob, /api/blob/upload). Голосовые, видео и файлы так загрузить нельзя — понятная ошибка.
 */
async function uploadViaBlob(file: Blob, kind: UploadKind, opts: { fileName?: string; onProgress?: (p: number) => void }): Promise<UploadResult> {
  if (!file.type.startsWith("image/") || (kind !== "image" && kind !== "avatar" && kind !== "story")) {
    throw new MApiError("Голосовые, видео и файлы появятся после запуска загрузки медиа. Пока можно отправлять фото.", 400);
  }
  try {
    opts.onProgress?.(0.1);
    const prepared = await prepareImage(file, opts.fileName ?? "photo.jpg", kind === "avatar" ? 512 : 1920);
    opts.onProgress?.(0.4);
    const url = await uploadImage(prepared.file, kind === "avatar" ? "avatars" : "dm-photos");
    opts.onProgress?.(1);
    return { url, width: prepared.width, height: prepared.height };
  } catch (err) {
    if (err instanceof ImageUploadError) throw new MApiError(err.message, 400);
    if (err instanceof MApiError) throw err;
    throw new MApiError("Не удалось загрузить фото", 0);
  }
}

/** Загрузка файла (multipart) с прогрессом. Ответ сервера: { url, width?, height? }. */
export async function mUpload(
  file: Blob,
  kind: UploadKind,
  opts: { duration?: number; fileName?: string; onProgress?: (p: number) => void } = {}
): Promise<UploadResult> {
  if (!MX_FEATURES.upload) return uploadViaBlob(file, kind, opts);
  const token = await idToken();
  const form = new FormData();
  form.append("file", file, opts.fileName ?? (file instanceof File ? file.name : `${kind}.bin`));
  form.append("kind", kind);
  if (opts.duration !== undefined) form.append("duration", String(Math.round(opts.duration)));
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/messenger/upload");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new MApiError("Не удалось загрузить файл. Проверь интернет.", 0));
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data?.url) resolve(data as UploadResult);
      else reject(new MApiError(data?.error || "Не удалось загрузить файл", xhr.status));
    };
    xhr.send(form);
  });
}
