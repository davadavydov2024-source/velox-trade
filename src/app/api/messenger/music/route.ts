import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { adminUids } from "@/lib/adminGuard";
import { fail, requireMessenger, sendServiceMessage } from "@/lib/messenger/server";
import { MUSIC_REQUEST_MAX, MUSIC_REQUEST_MIN, type MusicRequest, type MusicTrack } from "@/lib/messenger/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 80 && !v.includes("/");

/** GET — каталог треков + мои лайки + мои заявки. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const [tracksSnap, likeSnap, reqSnap] = await Promise.all([
    db.collection("messengerMusicTracks").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("messengerMusicLikes").doc(me.uid).get(),
    db.collection("messengerMusicRequests").where("uid", "==", me.uid).limit(60).get(),
  ]);
  const tracks = tracksSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as MusicTrack[];
  const likes = ((likeSnap.data()?.ids as string[] | undefined) ?? []).filter((id) => tracks.some((t) => t.id === id));
  const requests = (reqSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as MusicRequest[]).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  return NextResponse.json({ tracks, likes, requests });
}

/**
 * POST { action: "like" | "unlike", id }  — «Любимые».
 * POST { action: "play", id }             — +1 прослушивание (клиент шлёт после 10 секунд игры).
 * POST { action: "request", text }        — предложить песню: заявка падает админам в «MiliGram Push».
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  if (b.action === "like" || b.action === "unlike") {
    if (!okId(b.id)) return fail("id обязателен");
    if (!(await rateLimit(`msgr_music_like_${me.uid}`, 120, 60 * 60_000))) return fail("Слишком часто", 429);
    await db.collection("messengerMusicLikes").doc(me.uid).set({ ids: b.action === "like" ? FieldValue.arrayUnion(b.id) : FieldValue.arrayRemove(b.id) }, { merge: true });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "play") {
    if (!okId(b.id)) return fail("id обязателен");
    if (!(await rateLimit(`msgr_music_play_${me.uid}`, 300, 60 * 60_000))) return NextResponse.json({ ok: true });
    await db.collection("messengerMusicTracks").doc(b.id).update({ plays: FieldValue.increment(1) }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (b.action === "request") {
    const text = typeof b.text === "string" ? b.text.replace(/\s+/g, " ").trim() : "";
    if (text.length < MUSIC_REQUEST_MIN) return fail("Напиши название песни");
    if (text.length > MUSIC_REQUEST_MAX) return fail(`Не длиннее ${MUSIC_REQUEST_MAX} символов`);
    if (!(await rateLimit(`msgr_music_req_${me.uid}`, 5, 60 * 60_000))) return fail("Ты уже отправил несколько заявок — попробуй через час", 429);
    const ref = db.collection("messengerMusicRequests").doc();
    await ref.set({ uid: me.uid, text, createdAt: Date.now(), status: "new" });
    // заявка приходит админам в служебный чат «MiliGram Push»; сбой доставки не отменяет заявку
    const who = `${me.account.displayName} (@${me.account.handle})`;
    const msg = `🎵 Заявка на песню\n«${text}»\nОт: ${who}\n\nДобавить: Настройки → Админ-панель → Музыка`;
    await Promise.allSettled(adminUids().map((a) => sendServiceMessage(a, msg)));
    return NextResponse.json({ ok: true, id: ref.id });
  }

  return fail("action: like | unlike | play | request");
}
