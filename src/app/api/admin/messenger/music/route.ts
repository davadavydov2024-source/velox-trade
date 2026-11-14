import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { isOwnMediaUrl, sendServiceMessage } from "@/lib/messenger/server";
import type { MusicRequest, MusicTrack } from "@/lib/messenger/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** liteUrl / norm / fp из тела запроса; null — если что-то некорректно. */
function metaFrom(b: any): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (b.liteUrl !== undefined && b.liteUrl !== "") { if (!isOwnMediaUrl(b.liteUrl)) return null; out.liteUrl = b.liteUrl; }
  if (b.norm !== undefined) { const n = Number(b.norm); if (!(n >= 0.2 && n <= 1)) return null; out.norm = Math.round(n * 1000) / 1000; }
  if (b.fp !== undefined && b.fp !== "") { if (typeof b.fp !== "string" || !/^[0-9a-f]{16,64}$/.test(b.fp)) return null; out.fp = b.fp; }
  if (b.coverUrl !== undefined && b.coverUrl !== "") { if (!isOwnMediaUrl(b.coverUrl)) return null; out.coverUrl = b.coverUrl; }
  return out;
}
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 80 && !v.includes("/");

/** GET — каталог и заявки (новые сверху). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const db = adminDb();
  const [t, r] = await Promise.all([
    db.collection("messengerMusicTracks").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("messengerMusicRequests").orderBy("createdAt", "desc").limit(100).get(),
  ]);
  const requests = r.docs.map((d) => ({ id: d.id, ...d.data() })) as MusicRequest[];
  const uids = Array.from(new Set(requests.map((x) => x.uid)));
  const accs = await Promise.all(uids.map((u) => db.collection("messengerAccounts").doc(u).get()));
  const names: Record<string, string> = {};
  accs.forEach((a, i) => { const d = a.data(); names[uids[i]] = d ? `${d.displayName} (@${d.handle})` : "—"; });
  return NextResponse.json({
    tracks: t.docs.map((d) => ({ id: d.id, ...d.data() })) as MusicTrack[],
    requests: requests.map((x) => ({ ...x, userName: names[x.uid] })),
  });
}

/**
 * POST { action: "add", title, artist, audioUrl, coverUrl?, duration?, requestId? } — добавить песню (mp3 уже загружен в хранилище через upload-ticket "music").
 *      { action: "edit", id, title, artist }
 *      { action: "replaceAudio", id, audioUrl } — заменить файл песни (сжатая версия)
 *      { action: "delete", id }
 *      { action: "reject", requestId, note? } — отклонить заявку
 * Автору заявки приходит сообщение от «MiliGram Push».
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  if (b.action === "add") {
    const title = clean(b.title, 120);
    const artist = clean(b.artist, 120) || "Неизвестный исполнитель";
    if (!title) return err("Укажи название песни");
    if (!isOwnMediaUrl(b.audioUrl)) return err("Аудиофайл не загружен");
    if (b.coverUrl && !isOwnMediaUrl(b.coverUrl)) return err("Некорректная обложка");
    const duration = typeof b.duration === "number" && b.duration > 0 && b.duration < 6 * 3600 ? Math.round(b.duration) : undefined;
    const ref = db.collection("messengerMusicTracks").doc();
    const extra = metaFrom(b);
    if (extra === null) return err("Некорректные данные оптимизации");
    const track = { ...extra, title, artist, audioUrl: b.audioUrl, ...(b.coverUrl ? { coverUrl: b.coverUrl } : {}), ...(duration ? { duration } : {}), plays: 0, createdAt: Date.now(), addedBy: admin.uid };
    await ref.set(track);
    await logAdminAccess(admin.uid, "messenger_music_add", { trackId: ref.id, title });
    if (okId(b.requestId)) {
      const rr = db.collection("messengerMusicRequests").doc(b.requestId);
      const rd = (await rr.get()).data();
      if (rd) {
        await rr.update({ status: "added", trackId: ref.id });
        await sendServiceMessage(rd.uid, `🎵 Твоя песня добавлена!\n«${artist} — ${title}» уже в разделе «Музыка» (Настройки → Музыка).`).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true, id: ref.id });
  }

  if (b.action === "lyrics") {
    if (!okId(b.id)) return err("id обязателен");
    const lyrics = typeof b.lyrics === "string" ? b.lyrics.replace(/\r/g, "").trim().slice(0, 8000) : "";
    const { FieldValue } = await import("firebase-admin/firestore");
    await db.collection("messengerMusicTracks").doc(b.id).update({ lyrics: lyrics || FieldValue.delete() });
    await logAdminAccess(admin.uid, "messenger_music_lyrics", { trackId: b.id, length: lyrics.length });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "edit") {
    if (!okId(b.id)) return err("id обязателен");
    const title = clean(b.title, 120);
    const artist = clean(b.artist, 120);
    if (!title) return err("Укажи название");
    await db.collection("messengerMusicTracks").doc(b.id).update({ title, artist: artist || "Неизвестный исполнитель" });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "setMeta") {
    // дописать оптимизационные данные (лёгкая копия, громкость, отпечаток, уменьшенная обложка); старая обложка при замене удаляется
    if (!okId(b.id)) return err("id обязателен");
    const extra = metaFrom(b);
    if (extra === null || !Object.keys(extra).length) return err("Нечего сохранять");
    const ref = db.collection("messengerMusicTracks").doc(b.id);
    const t = (await ref.get()).data();
    if (!t) return err("Трек не найден", 404);
    await ref.update(extra);
    try {
      const { del } = await import("@vercel/blob");
      const old: string[] = [];
      if (extra.coverUrl && t.coverUrl && t.coverUrl !== extra.coverUrl) old.push(t.coverUrl);
      if (extra.liteUrl && t.liteUrl && t.liteUrl !== extra.liteUrl) old.push(t.liteUrl);
      if (old.length) await del(old);
    } catch {}
    return NextResponse.json({ ok: true });
  }

  if (b.action === "replaceAudio") {
    // подмена файла песни на сжатую версию (оптимизация каталога); название, обложка, текст и счётчик остаются
    if (!okId(b.id)) return err("id обязателен");
    if (!isOwnMediaUrl(b.audioUrl)) return err("Аудиофайл не загружен");
    const ref = db.collection("messengerMusicTracks").doc(b.id);
    const t = (await ref.get()).data();
    if (!t) return err("Трек не найден", 404);
    const extra = metaFrom({ liteUrl: b.liteUrl, norm: b.norm });
    if (extra === null) return err("Некорректные данные оптимизации");
    const { FieldValue } = await import("firebase-admin/firestore");
    await ref.update({ audioUrl: b.audioUrl, ...extra, ...(extra.liteUrl ? {} : { liteUrl: FieldValue.delete() }) }); // старая лёгкая копия относилась к прежнему файлу
    {
      const old = [t.audioUrl, ...(t.liteUrl && t.liteUrl !== extra.liteUrl ? [t.liteUrl] : [])].filter((u: string) => u !== b.audioUrl);
      try {
        const { del } = await import("@vercel/blob");
        if (old.length) await del(old);
      } catch {}
    }
    await logAdminAccess(admin.uid, "messenger_music_replace_audio", { trackId: b.id, title: t.title });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "delete") {
    if (!okId(b.id)) return err("id обязателен");
    const ref = db.collection("messengerMusicTracks").doc(b.id);
    const t = (await ref.get()).data();
    if (!t) return err("Трек не найден", 404);
    await ref.delete();
    // файлы в хранилище удаляем, сбой не критичен
    try {
      const { del } = await import("@vercel/blob");
      await del([t.audioUrl, ...(t.liteUrl ? [t.liteUrl] : []), ...(t.coverUrl ? [t.coverUrl] : [])]);
    } catch {}
    await logAdminAccess(admin.uid, "messenger_music_delete", { trackId: b.id, title: t.title });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "reject") {
    if (!okId(b.requestId)) return err("requestId обязателен");
    const rr = db.collection("messengerMusicRequests").doc(b.requestId);
    const rd = (await rr.get()).data();
    if (!rd) return err("Заявка не найдена", 404);
    const note = clean(b.note, 200);
    await rr.update({ status: "rejected", ...(note ? { note } : {}) });
    await sendServiceMessage(rd.uid, `Заявка «${rd.text}» не подошла${note ? `: ${note}` : "."} Можно предложить другую песню в разделе «Музыка».`).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return err("action: add | edit | lyrics | setMeta | replaceAudio | delete | reject");
}
