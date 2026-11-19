import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LISTS = 30, MAX_TRACKS = 200;
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 80 && !v.includes("/");
const name = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 40) : "");

/** GET — мои плейлисты. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const snap = await adminDb().collection("messengerPlaylists").where("owner", "==", me.uid).limit(MAX_LISTS).get();
  const playlists = snap.docs.map((d) => ({ id: d.id, name: d.data().name, trackIds: d.data().trackIds ?? [], updatedAt: d.data().updatedAt ?? 0 })).sort((a, b) => b.updatedAt - a.updatedAt);
  return NextResponse.json({ playlists });
}

/** POST { action: create{name} | rename{id,name} | delete{id} | add{id,trackId} | remove{id,trackId} } */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_pl_${me.uid}`, 60, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const col = adminDb().collection("messengerPlaylists");
  const now = Date.now();

  if (b.action === "create") {
    const n = name(b.name);
    if (!n) return fail("Введи название плейлиста");
    const cnt = (await col.where("owner", "==", me.uid).count().get()).data().count;
    if (cnt >= MAX_LISTS) return fail(`Не больше ${MAX_LISTS} плейлистов`);
    const ref = col.doc();
    await ref.set({ owner: me.uid, name: n, trackIds: [], createdAt: now, updatedAt: now });
    return NextResponse.json({ ok: true, id: ref.id });
  }
  if (!okId(b.id)) return fail("Плейлист не найден", 404);
  const ref = col.doc(b.id);
  const cur = (await ref.get()).data();
  if (!cur || cur.owner !== me.uid) return fail("Плейлист не найден", 404);

  if (b.action === "rename") { const n = name(b.name); if (!n) return fail("Введи название"); await ref.update({ name: n, updatedAt: now }); return NextResponse.json({ ok: true }); }
  if (b.action === "delete") { await ref.delete(); return NextResponse.json({ ok: true }); }
  if (b.action === "add" || b.action === "remove") {
    if (!okId(b.trackId)) return fail("Песня не найдена", 404);
    const ids: string[] = Array.isArray(cur.trackIds) ? cur.trackIds : [];
    if (b.action === "add") {
      if (ids.includes(b.trackId)) return NextResponse.json({ ok: true });
      if (ids.length >= MAX_TRACKS) return fail(`В плейлисте не больше ${MAX_TRACKS} песен`);
      if (!(await adminDb().collection("messengerMusicTracks").doc(b.trackId).get()).exists) return fail("Песня не найдена", 404);
      await ref.update({ trackIds: [...ids, b.trackId], updatedAt: now });
    } else await ref.update({ trackIds: ids.filter((x) => x !== b.trackId), updatedAt: now });
    return NextResponse.json({ ok: true });
  }
  return fail("Неизвестное действие");
}
