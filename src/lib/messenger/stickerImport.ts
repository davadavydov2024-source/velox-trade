import { randomBytes } from "crypto";
import { gunzipSync } from "zlib";
import { put } from "@vercel/blob";
import { adminDb } from "@/lib/firebaseAdmin";
import type { MessengerStickerPack } from "./types";

/**
 * Импорт набора стикеров из Telegram в MiliGram (используется ботом: админ шлёт ссылку t.me/addstickers/…).
 * В отличие от пользовательского импорта, анимацию сохраняем:
 *  • обычные (webp) — как есть;
 *  • видео-стикеры (webm) — как есть, плюс статичное превью;
 *  • анимированные (.tgs = сжатый Lottie) — распаковываем в Lottie-JSON, плюс статичное превью.
 */

const TG = "https://api.telegram.org";
export const STICKER_IMPORT_MAX = 120;

/** «https://t.me/addstickers/Name», «tg://addstickers?set=Name» или (если allowBare) просто имя набора → Name. */
export function parseStickerSetName(input: string, allowBare = false): string | null {
  const t = input.trim();
  const m = /addstickers\/([A-Za-z0-9_]{3,64})/.exec(t) ?? /[?&]set=([A-Za-z0-9_]{3,64})/.exec(t) ?? (allowBare ? /^([A-Za-z0-9_]{3,64})$/.exec(t) : null);
  return m ? m[1] : null;
}

interface TgSticker {
  file_id: string;
  emoji?: string;
  is_animated?: boolean;
  is_video?: boolean;
  premium_animation?: unknown;
  thumbnail?: { file_id: string };
}

async function tg<T>(token: string, method: string, params: Record<string, string>): Promise<T | null> {
  try {
    const r = await fetch(`${TG}/bot${token}/${method}?${new URLSearchParams(params)}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    return j?.ok ? (j.result as T) : null;
  } catch {
    return null;
  }
}

async function download(token: string, fileId: string): Promise<{ buf: Buffer; ext: string } | null> {
  const f = await tg<{ file_path?: string }>(token, "getFile", { file_id: fileId });
  if (!f?.file_path) return null;
  const res = await fetch(`${TG}/file/bot${token}/${f.file_path}`, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return null;
  return { buf: Buffer.from(await res.arrayBuffer()), ext: (f.file_path.split(".").pop() ?? "").toLowerCase() };
}

const SAVE_OPTS = { access: "public" as const, addRandomSuffix: true };

export type StickerImportResult =
  | { ok: true; pack: MessengerStickerPack; reused: boolean; animated: number; skipped: number; premiumEffects: number }
  | { ok: false; error: string };

/** Скачивает набор и создаёт/находит MessengerStickerPack. Повторный импорт того же набора ничего не качает заново. */
export async function importTelegramStickerSet(opts: { name: string; createdBy: string; premium?: boolean; published?: boolean }): Promise<StickerImportResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "На сервере нет TELEGRAM_BOT_TOKEN" };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "На сервере нет BLOB_READ_WRITE_TOKEN" };
  const db = adminDb();
  const { name } = opts;

  const existing = await db.collection("messengerStickerPacks").where("tgName", "==", name).limit(1).get();
  if (!existing.empty) {
    const pack = existing.docs[0].data() as MessengerStickerPack;
    return { ok: true, pack, reused: true, animated: pack.stickers.filter((s) => /\.(webm|json)$/i.test(s.url)).length, skipped: 0, premiumEffects: 0 };
  }

  // замок на набор: Telegram может повторно прислать апдейт, пока мы качаем
  const lockRef = db.collection("messengerStickerImportLocks").doc(name.toLowerCase());
  const now0 = Date.now();
  const lock = await lockRef.get();
  if (lock.exists && now0 - ((lock.data()?.at as number | undefined) ?? 0) < 5 * 60_000) return { ok: false, error: "Этот набор уже импортируется — подожди минуту" };
  await lockRef.set({ at: now0 });

  try {
    const set = await tg<{ title: string; stickers: TgSticker[] }>(token, "getStickerSet", { name });
    if (!set || !set.stickers?.length) return { ok: false, error: "Набор не найден в Telegram — проверь ссылку" };
    const items = set.stickers.slice(0, STICKER_IMPORT_MAX);
    const premiumEffects = items.filter((s) => s.premium_animation).length;

    const base = name.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32).padEnd(3, "_");
    let slug = base;
    for (let i = 0; i < 5 && (await db.collection("messengerStickerPacks").doc(slug).get()).exists; i++) slug = `${base.slice(0, 27)}_${randomBytes(2).toString("hex")}`;

    const results: ({ url: string; emoji: string; thumb?: string } | null)[] = new Array(items.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        const st = items[i];
        try {
          const emoji = (st.emoji ?? "🙂").slice(0, 8);
          const animated = st.is_animated || st.is_video;
          // статичное превью (для анимированных) — отдельным файлом
          let thumb: string | undefined;
          if (animated && st.thumbnail?.file_id) {
            const t = await download(token, st.thumbnail.file_id);
            if (t && t.buf.length <= 600_000) {
              const isPng = t.ext === "png";
              thumb = (await put(`messenger-stickers/${slug}/${i}_t.${isPng ? "png" : "webp"}`, t.buf, { ...SAVE_OPTS, contentType: isPng ? "image/png" : "image/webp" })).url;
            }
          }
          const file = await download(token, st.file_id);
          if (!file) continue;
          if (st.is_animated) {
            // .tgs = gzip(Lottie JSON)
            let json: Buffer;
            try { json = gunzipSync(file.buf); } catch { continue; }
            if (json.length > 2_000_000) continue;
            const url = (await put(`messenger-stickers/${slug}/${i}.json`, json, { ...SAVE_OPTS, contentType: "application/json" })).url;
            results[i] = { url, emoji, ...(thumb ? { thumb } : {}) };
          } else if (st.is_video) {
            if (file.buf.length > 512 * 1024) continue;
            const url = (await put(`messenger-stickers/${slug}/${i}.webm`, file.buf, { ...SAVE_OPTS, contentType: "video/webm" })).url;
            results[i] = { url, emoji, ...(thumb ? { thumb } : {}) };
          } else {
            if (file.buf.length > 600_000) continue;
            const isPng = file.ext === "png";
            const url = (await put(`messenger-stickers/${slug}/${i}.${isPng ? "png" : "webp"}`, file.buf, { ...SAVE_OPTS, contentType: isPng ? "image/png" : "image/webp" })).url;
            results[i] = { url, emoji };
          }
        } catch (e) {
          console.error("sticker import item failed:", e);
        }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));

    const stickers = results.filter((r): r is { url: string; emoji: string; thumb?: string } => !!r);
    if (stickers.length === 0) return { ok: false, error: "Не удалось скачать стикеры из этого набора" };
    const now = Date.now();
    const pack: MessengerStickerPack = {
      slug,
      title: String(set.title ?? name).slice(0, 60),
      // набор с премиум-эффектами Telegram по умолчанию делаем «только для Mili Premium» — админ может переключить кнопкой в боте
      premium: opts.premium ?? premiumEffects > 0,
      published: opts.published ?? true,
      stickers,
      createdBy: opts.createdBy,
      tgName: name,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("messengerStickerPacks").doc(slug).set(pack);
    return { ok: true, pack, reused: false, animated: stickers.filter((s) => /\.(webm|json)$/i.test(s.url)).length, skipped: items.length - stickers.length, premiumEffects };
  } finally {
    await lockRef.delete().catch(() => {});
  }
}
