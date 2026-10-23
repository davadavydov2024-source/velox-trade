import { auth } from "@/lib/firebase";

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

/** Загрузка файла (multipart) с прогрессом. Ответ сервера: { url, width?, height? }. */
export async function mUpload(
  file: Blob,
  kind: UploadKind,
  opts: { duration?: number; fileName?: string; onProgress?: (p: number) => void } = {}
): Promise<UploadResult> {
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
