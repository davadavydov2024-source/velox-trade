import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { isOwnMediaUrl, sendServiceMessage } from "@/lib/messenger/server";
import type { MusicRequest, MusicTrack } from "@/lib/messenger/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
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
    const track = { title, artist, audioUrl: b.audioUrl, ...(b.coverUrl ? { coverUrl: b.coverUrl } : {}), ...(duration ? { duration } : {}), plays: 0, createdAt: Date.now(), addedBy: admin.uid };
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

  if (b.action === "edit") {
    if (!okId(b.id)) return err("id обязателен");
    const title = clean(b.title, 120);
    const artist = clean(b.artist, 120);
    if (!title) return err("Укажи название");
    await db.collection("messengerMusicTracks").doc(b.id).update({ title, artist: artist || "Неизвестный исполнитель" });
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
      await del([t.audioUrl, ...(t.coverUrl ? [t.coverUrl] : [])]);
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

  return err("action: add | edit | delete | reject");
}
