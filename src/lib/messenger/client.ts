"use client";

import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { MessengerAccount } from "./types";
import type { UploadKind } from "./uploads";

const DEV_KEY = "miligram-device-id";

/** Постоянный id этого устройства (для списка «Устройства» и уведомлений о новом входе). */
export function getDeviceId(): string {
  try {
    let v = localStorage.getItem(DEV_KEY);
    if (!v || !/^[A-Za-z0-9_-]{16,64}$/.test(v)) {
      v = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(DEV_KEY, v);
    }
    return v;
  } catch {
    return "anon" + Math.random().toString(36).slice(2).padEnd(24, "x");
  }
}

export class MApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** Запрос к /api/messenger/<path>. Без тела — GET, с телом — POST. Завершённый сеанс (401 revoked) сам выходит из аккаунта. */
export async function mApi<T = any>(path: string, body?: unknown, method?: "GET" | "POST" | "PATCH" | "DELETE"): Promise<T> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  const res = await fetch(`/api/messenger/${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      "X-Miligram-Device": getDeviceId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data?.revoked) await signOut(auth).catch(() => {});
  if (!res.ok) throw new MApiError(data?.error || "Что-то пошло не так", res.status, data);
  return data as T;
}

/** Загрузка файла напрямую в хранилище (через билет из upload-ticket) -> публичная ссылка. */
export async function uploadMedia(file: Blob, kind: UploadKind, ext: string): Promise<string> {
  const t = await mApi<{ ticket: string; pathPrefix: string }>("upload-ticket", { kind });
  const { upload } = await import("@vercel/blob/client");
  const type = (file.type || "application/octet-stream").split(";")[0];
  const f = new File([file], `file.${ext}`, { type });
  const blob = await upload(`${t.pathPrefix}${Date.now()}.${ext}`, f, { access: "public", handleUploadUrl: "/api/messenger/upload", clientPayload: t.ticket, contentType: type });
  return blob.url;
}

const accCache = new Map<string, MessengerAccount | null>();
const accPending = new Set<string>();

/** Профили людей по uid (кэшируются на время сессии): { [uid]: аккаунт | undefined, пока грузится }. */
export function useAccounts(uids: string[]): Record<string, MessengerAccount | undefined> {
  const [, bump] = useState(0);
  const key = uids.join(",");
  useEffect(() => {
    const need = uids.filter((u) => u && !accCache.has(u) && !accPending.has(u));
    if (need.length === 0) return;
    need.forEach((u) => accPending.add(u));
    Promise.all(
      need.map(async (u) => {
        try {
          const s = await getDoc(doc(db, "messengerAccounts", u));
          accCache.set(u, s.exists() ? (s.data() as MessengerAccount) : null);
        } catch {
          accCache.set(u, null);
        } finally {
          accPending.delete(u);
        }
      })
    ).then(() => bump((n) => n + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const out: Record<string, MessengerAccount | undefined> = {};
  uids.forEach((u) => { const a = accCache.get(u); if (a) out[u] = a; });
  return out;
}

export function setCachedAccount(a: MessengerAccount) {
  accCache.set(a.uid, a);
}
