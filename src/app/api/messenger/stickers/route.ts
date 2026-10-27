import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { randomBytes } from "crypto";
import { put } from "@vercel/blob";
import { rateLimit } from "@/lib/rateLimit";
import { STICKER_IMPORT_LIMIT, isPremium } from "@/lib/messenger/premium";
import type { MessengerStickerPack } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // импорт набора качает десятки файлов
const MAX_PACKS = 50;
const slugOk = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9_]{3,32}$/.test(s);

/**
 * GET ?slug= — набор по ссылке /m?stickers=<slug> (карточка с кнопкой «Добавить»): { pack, added, locked }.
 * GET без slug — мои добавленные наборы (locked = премиум-набор, а Mili Premium закончился).
 */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const premium = isPremium(me.account);
  const slug = req.nextUrl.searchParams.get("slug");

  const mine: string[] = ((await db.collection("messengerUserStickers").doc(me.uid).get()).data()?.slugs as string[] | undefined) ?? [];
  if (slug) {
    if (!slugOk(slug)) return fail("Набор не найден", 404);
    const pack = (await db.collection("messengerStickerPacks").doc(slug).get()).data() as MessengerStickerPack | undefined;
    if (!pack || !pack.published) return fail("Набор не найден", 404);
    return NextResponse.json({ pack, added: mine.includes(slug), locked: pack.premium && !premium });
  }
  if (mine.length === 0) return NextResponse.json({ packs: [] });
  const docs = await db.getAll(...mine.map((s) => db.collection("messengerStickerPacks").doc(s)));
  const packs = docs.map((d) => d.data() as MessengerStickerPack | undefined).filter((p): p is MessengerStickerPack => !!p && p.published).map((p) => ({ ...p, locked: p.premium && !premium }));
  return NextResponse.json({ packs });
}

/** POST { slug, action: "add"|"remove" } — добавить набор по ссылке (премиум-наборы — только с Mili Premium). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  if (b.action === "import") return importFromTelegram(me, String(b.url ?? ""));
  if (!slugOk(b.slug)) return fail("Набор не найден", 404);
  const db = adminDb();
  const ref = db.collection("messengerUserStickers").doc(me.uid);

  if (b.action === "remove") {
    await ref.set({ slugs: FieldValue.arrayRemove(b.slug) }, { merge: true });
    return NextResponse.json({ ok: true });
  }
  if (b.action !== "add") return fail("action: add или remove");
  const pack = (await db.collection("messengerStickerPacks").doc(b.slug).get()).data() as MessengerStickerPack | undefined;
  if (!pack || !pack.published) return fail("Набор не найден", 404);
  if (pack.premium && !isPremium(me.account)) return NextResponse.json({ error: "Этот набор доступен только с Mili Premium", needPremium: true }, { status: 403 });
  const cur: string[] = ((await ref.get()).data()?.slugs as string[] | undefined) ?? [];
  if (!cur.includes(b.slug) && cur.length >= MAX_PACKS) return fail(`Не больше ${MAX_PACKS} наборов`);
  await ref.set({ slugs: FieldValue.arrayUnion(b.slug) }, { merge: true });
  return NextResponse.json({ ok: true });
}

const TG = "https://api.telegram.org";
const MAX_STICKERS = 120;

/** «https://t.me/addstickers/Name», «tg://addstickers?set=Name» или просто имя набора → Name. */
function parseSetName(input: string): string | null {
  const t = input.trim();
  const m = /addstickers\/([A-Za-z0-9_]{3,64})/.exec(t) ?? /[?&]set=([A-Za-z0-9_]{3,64})/.exec(t) ?? /^([A-Za-z0-9_]{3,64})$/.exec(t);
  return m ? m[1] : null;
}

async function tg<T>(token: string, method: string, params: Record<string, string>): Promise<T | null> {
  const r = await fetch(`${TG}/bot${token}/${method}?${new URLSearchParams(params)}`, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  return j?.ok ? (j.result as T) : null;
}

/** POST { action: "import", url } — скачать набор из Telegram в MiliGram и добавить его себе. Анимированные и видео-стикеры сохраняются статичным превью. */
async function importFromTelegram(me: { uid: string; account: any }, input: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail("Импорт из Telegram не настроен: на сервере нет TELEGRAM_BOT_TOKEN", 500);
  const name = parseSetName(input);
  if (!name) return fail("Вставь ссылку вида t.me/addstickers/название");
  if (!(await rateLimit(`msgr_stk_import_${me.uid}`, 3, 60 * 60_000))) return fail("Не больше 3 импортов в час", 429);

  const db = adminDb();
  const premium = isPremium(me.account);
  const base = name.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32).padEnd(3, "_");
  const userRef = db.collection("messengerUserStickers").doc(me.uid);

  // уже привозили этот набор — просто добавляем, без повторной загрузки
  const existing = await db.collection("messengerStickerPacks").where("tgName", "==", name).limit(1).get();
  if (!existing.empty) {
    const pack = existing.docs[0].data() as MessengerStickerPack;
    if (pack.premium && !premium) return NextResponse.json({ error: "Этот набор доступен только с Mili Premium", needPremium: true }, { status: 403 });
    await userRef.set({ slugs: FieldValue.arrayUnion(pack.slug) }, { merge: true });
    return NextResponse.json({ ok: true, slug: pack.slug, title: pack.title, count: pack.stickers.length, reused: true });
  }

  const mineCount = (await db.collection("messengerStickerPacks").where("createdBy", "==", me.uid).count().get()).data().count;
  const cap = premium ? STICKER_IMPORT_LIMIT.premium : STICKER_IMPORT_LIMIT.free;
  if (mineCount >= cap) return NextResponse.json({ error: `Можно привезти до ${cap} наборов${premium ? "" : " — с Mili Premium до " + STICKER_IMPORT_LIMIT.premium}`, needPremium: !premium }, { status: 403 });

  const set = await tg<{ title: string; stickers: { file_id: string; emoji?: string; is_animated?: boolean; is_video?: boolean; thumbnail?: { file_id: string } }[] }>(token, "getStickerSet", { name });
  if (!set || !set.stickers?.length) return fail("Набор не найден в Telegram (проверь ссылку)", 404);
  const items = set.stickers.slice(0, MAX_STICKERS);

  let slug = base;
  for (let i = 0; i < 5 && (await db.collection("messengerStickerPacks").doc(slug).get()).exists; i++) slug = `${base.slice(0, 27)}_${randomBytes(2).toString("hex")}`;

  const results: ({ url: string; emoji: string } | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const st = items[i];
      try {
        const fileId = st.is_animated || st.is_video ? st.thumbnail?.file_id : st.file_id; // .tgs/.webm не показать как картинку — берём превью
        if (!fileId) continue;
        const f = await tg<{ file_path?: string }>(token, "getFile", { file_id: fileId });
        if (!f?.file_path) continue;
        const res = await fetch(`${TG}/file/bot${token}/${f.file_path}`, { cache: "no-store" });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 600_000) continue;
        const ext = f.file_path.split(".").pop()?.toLowerCase() === "png" ? "png" : "webp";
        const blob = await put(`messenger-stickers/${slug}/${i}.${ext}`, buf, { access: "public", contentType: ext === "png" ? "image/png" : "image/webp", addRandomSuffix: true });
        results[i] = { url: blob.url, emoji: st.emoji ?? "" };
      } catch (e) {
        console.error("sticker import item failed:", e);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  const stickers = results.filter((r): r is { url: string; emoji: string } => !!r);
  if (stickers.length === 0) return fail("Не удалось скачать стикеры из этого набора", 502);
  const now = Date.now();
  const pack: MessengerStickerPack = { slug, title: String(set.title ?? name).slice(0, 60), premium: false, published: true, stickers, createdBy: me.uid, tgName: name, createdAt: now, updatedAt: now };
  await db.collection("messengerStickerPacks").doc(slug).set(pack);
  await userRef.set({ slugs: FieldValue.arrayUnion(slug) }, { merge: true });
  return NextResponse.json({ ok: true, slug, title: pack.title, count: stickers.length, skipped: items.length - stickers.length });
}
