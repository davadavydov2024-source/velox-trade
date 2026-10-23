import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, ownsMedia, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DAY = 24 * 60 * 60 * 1000;

/** GET — активные истории моих контактов (те, с кем есть личный чат) и мои, сгруппированные по людям. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const now = Date.now();

  const chats = await db.collection("messengerChats").where("members", "array-contains", me.uid).limit(300).get();
  const uids = new Set<string>([me.uid]);
  chats.docs.forEach((d) => {
    const c = d.data();
    if (c.type === "dm") (c.members as string[]).forEach((m) => uids.add(m));
  });
  const list = Array.from(uids);
  const snaps = [];
  for (let i = 0; i < list.length; i += 30) snaps.push(await db.collection("messengerStories").where("uid", "in", list.slice(i, i + 30)).get());

  const byUid = new Map<string, any[]>();
  const expired: FirebaseFirestore.DocumentReference[] = [];
  for (const s of snaps) {
    for (const d of s.docs) {
      const st = d.data();
      if (st.expiresAt <= now) { expired.push(d.ref); continue; }
      const arr = byUid.get(st.uid) ?? [];
      arr.push({ id: d.id, kind: st.kind, mediaUrl: st.mediaUrl, caption: st.caption ?? "", createdAt: st.createdAt, expiresAt: st.expiresAt, seen: (st.viewers ?? []).includes(me.uid) });
      byUid.set(st.uid, arr);
    }
  }
  expired.slice(0, 20).forEach((r) => r.delete().catch(() => {})); // уборка просроченных (без ожидания)

  const ids = Array.from(byUid.keys());
  const accs = ids.length ? await db.getAll(...ids.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  const groups = ids.map((uid, i) => {
    const a = accs[i].data() ?? {};
    const stories = byUid.get(uid)!.sort((x, y) => x.createdAt - y.createdAt);
    return { uid, handle: a.handle ?? "", displayName: a.displayName ?? "Пользователь", photoURL: a.photoURL ?? null, stories, allSeen: stories.every((s) => s.seen), latest: stories[stories.length - 1].createdAt };
  });
  groups.sort((a, b) => (a.uid === me.uid ? -1 : b.uid === me.uid ? 1 : Number(a.allSeen) - Number(b.allSeen) || b.latest - a.latest));
  return NextResponse.json({ groups });
}

/** POST { kind: "image"|"video", mediaUrl, caption? } — выложить историю (живёт 24 часа). Файл — через upload-ticket (story-image / story-video). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_story_${me.uid}`, 20, 60 * 60_000))) return fail("Слишком много историй за час", 429);
  const b = await req.json().catch(() => ({}));
  if (b.kind !== "image" && b.kind !== "video") return fail("kind: image или video");
  if (typeof b.mediaUrl !== "string" || !ownsMedia(b.mediaUrl, me.uid)) return fail("Файл нужно загрузить через мессенджер");
  const now = Date.now();
  const ref = adminDb().collection("messengerStories").doc();
  await ref.set({ uid: me.uid, kind: b.kind, mediaUrl: b.mediaUrl, caption: String(b.caption ?? "").slice(0, 200), createdAt: now, expiresAt: now + DAY, viewers: [] });
  return NextResponse.json({ id: ref.id });
}

/** DELETE ?id= — удалить свою историю. */
export async function DELETE(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id || id.includes("/")) return fail("id обязателен");
  const ref = adminDb().collection("messengerStories").doc(id);
  const s = (await ref.get()).data();
  if (!s) return fail("История не найдена", 404);
  if (s.uid !== me.uid) return fail("Это не ваша история", 403);
  await ref.delete();
  return NextResponse.json({ ok: true });
}
