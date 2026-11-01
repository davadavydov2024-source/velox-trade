import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { rateLimit } from "@/lib/rateLimit";
import { hasKey, jamendoById, searchJamendo, type JamendoTrack } from "@/lib/messenger/jamendo";
import { archiveById, searchArchive } from "@/lib/messenger/archive";
import { MIME, openById, searchOpen } from "@/lib/messenger/openSources";

export const runtime = "nodejs";
export const maxDuration = 60;

const err = (m: string, s = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error: m, ...extra }, { status: s });
const MAX_BYTES = 30 * 1024 * 1024;
const AUTO_SCORE = 0.8; // насколько запрос должен совпасть с треком, чтобы добавить без вопросов

async function copyToBlob(url: string, adminUid: string, ext: string, type: string, limit: number): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Источник ответил ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > limit) throw new Error("Файл слишком большой");
  const blob = await put(`messenger/${adminUid}/${Date.now()}-auto.${ext}`, buf, { access: "public", contentType: type, addRandomSuffix: true });
  return blob.url;
}

async function addTrack(t: JamendoTrack, adminUid: string) {
  const ext = t.ext && MIME[t.ext] ? t.ext : "mp3";
  const audioUrl = await copyToBlob(t.audio, adminUid, ext, MIME[ext], MAX_BYTES);
  let coverUrl: string | undefined;
  if (t.image) { try { coverUrl = await copyToBlob(t.image, adminUid, "jpg", "image/jpeg", 5 * 1024 * 1024); } catch { /* обложка необязательна */ } }
  const ref = adminDb().collection("messengerMusicTracks").doc();
  await ref.set({ title: t.title.slice(0, 120), artist: (t.artist || "Неизвестный исполнитель").slice(0, 120), audioUrl, ...(coverUrl ? { coverUrl } : {}), ...(t.duration ? { duration: Math.round(t.duration) } : {}), plays: 0, createdAt: Date.now(), addedBy: adminUid, license: t.license, source: t.source ?? "Jamendo", sourceUrl: t.shareUrl });
  await logAdminAccess(adminUid, "messenger_music_add", { trackId: ref.id, title: t.title, source: t.source ?? "Jamendo", license: t.license });
  return { id: ref.id, title: t.title, artist: t.artist, license: t.license };
}

/**
 * POST { q: "артист — название" } — ищет в каталоге Jamendo (только свободные лицензии), и если нашёлся точный трек, сам добавляет его в «Музыку»;
 *      иначе возвращает список кандидатов { candidates }.
 * POST { pickId } — добавить выбранный из списка трек.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  if (!(await rateLimit(`music_auto_${admin.uid}`, 20, 60_000))) return err("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  try {
    if (typeof b.pickId === "string" && (/^\d{1,12}$/.test(b.pickId) || /^(ia|ov|cm|wc):[\w.\-]{1,200}$/.test(b.pickId))) {
      const t = b.pickId.startsWith("ia:") ? await archiveById(b.pickId.slice(3), MAX_BYTES) : /^(ov|cm|wc):/.test(b.pickId) ? await openById(b.pickId, MAX_BYTES) : await jamendoById(b.pickId);
      if (!t) return err("Трек недоступен или у него несвободная лицензия", 404);
      return NextResponse.json({ added: await addTrack(t, admin.uid) });
    }
    const q = typeof b.q === "string" ? b.q.trim().slice(0, 120) : "";
    const lang = b.ru === true ? "ru" : undefined;
    if (q.length < 2 && !lang) return err("Напиши исполнителя и название");
    const settled = await Promise.allSettled([hasKey() ? searchJamendo(q, lang && !q ? 12 : 6, lang) : Promise.resolve([]), searchArchive(q, !!lang, 6), searchOpen(q, !!lang, MAX_BYTES)]);
    const jam = settled[0].status === "fulfilled" ? settled[0].value : [];
    const arch = settled[1].status === "fulfilled" ? settled[1].value : [];
    if (!jam.length && !arch.length && settled.every((s) => s.status === "rejected")) return err("Каталоги сейчас недоступны, попробуй позже", 502);
    const open = settled[2].status === "fulfilled" ? settled[2].value : [];
    const seen = new Set<string>();
    const found = [...jam, ...arch, ...open].filter((t) => { const k = `${t.title}|${t.artist}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 14);
    if (!found.length) return err(lang ? "Русскоязычных песен с такой лицензией не нашлось. Попробуй другой запрос или сними галочку «Русские»." : "Ничего не нашлось среди песен со свободной лицензией. Современные хиты обычно не распространяются свободно — добавь их вручную, если у тебя есть права.", 404);
    if (q && jam[0] && jam[0].score >= AUTO_SCORE) return NextResponse.json({ added: await addTrack(jam[0], admin.uid) });
    return NextResponse.json({ candidates: found.map(({ id, title, artist, duration, license, image, source }) => ({ id, title, artist, duration, license, image, source })) });
  } catch (e) {
    console.error("music-auto error:", e);
    return err((e as Error).message?.startsWith("jamendo-") ? "Каталог Jamendo сейчас недоступен" : "Не удалось добавить трек", 502);
  }
}
