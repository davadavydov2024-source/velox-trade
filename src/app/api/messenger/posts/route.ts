import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { isAdminUid } from "@/lib/adminGuard";
import { fail, isOwnMediaUrl, requireMessenger } from "@/lib/messenger/server";
import { COMMENT_MAX, POST_TEXT_MAX } from "@/lib/messenger/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 80 && !v.includes("/");
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");

/**
 * GET ?uid=…            — посты человека (новые сверху) + кто автор + мои лайки.
 * GET ?comments=postId  — комментарии к посту (до 100, старые сверху) с авторами.
 */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const sp = req.nextUrl.searchParams;

  const commentsOf = sp.get("comments");
  if (commentsOf) {
    if (!okId(commentsOf)) return fail("id обязателен");
    const snap = await db.collection("messengerPosts").doc(commentsOf).collection("comments").orderBy("createdAt", "asc").limit(100).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as { uid: string; text: string; createdAt: number }) }));
    const uids = Array.from(new Set(rows.map((r) => r.uid)));
    const accs = await Promise.all(uids.map((u) => db.collection("messengerAccounts").doc(u).get()));
    const authors: Record<string, { displayName: string; handle: string; photoURL: string | null }> = {};
    accs.forEach((a, i) => { const x = a.data(); if (x) authors[uids[i]] = { displayName: x.displayName, handle: x.handle, photoURL: x.photoURL ?? null }; });
    return NextResponse.json({ comments: rows.map((r) => ({ ...r, author: authors[r.uid] ?? null })) });
  }

  const uid = sp.get("uid") ?? "";
  if (!okId(uid)) return fail("uid обязателен");
  const [accSnap, postsSnap] = await Promise.all([
    db.collection("messengerAccounts").doc(uid).get(),
    db.collection("messengerPosts").where("uid", "==", uid).limit(60).get(),
  ]);
  const a = accSnap.data();
  if (!a) return fail("Пользователь не найден", 404);
  const posts = postsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as { id: string; createdAt: number }[];
  posts.sort((x, y) => y.createdAt - x.createdAt);
  const top = posts.slice(0, 40);
  const likedSnaps = await Promise.all(top.map((p) => db.collection("messengerPosts").doc(p.id).collection("likes").doc(me.uid).get()));
  return NextResponse.json({
    author: { uid, displayName: a.displayName, handle: a.handle, photoURL: a.photoURL ?? null, verified: !!a.verified },
    posts: top.map((p, i) => ({ ...p, liked: likedSnaps[i].exists })),
  });
}

/**
 * POST { action: "create", text, imageUrl? }  — новый пост (10 в час).
 * POST { action: "delete", id }                — удалить свой пост (админ — любой).
 * POST { action: "like" | "unlike", id }       — лайк.
 * POST { action: "comment", id, text }         — комментарий (20 в час).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  if (b.action === "create") {
    if (!(await rateLimit(`msgr_post_${me.uid}`, 10, 60 * 60_000))) return fail("Слишком много постов — попробуй через час", 429);
    const text = clean(b.text, POST_TEXT_MAX);
    const imageUrl = typeof b.imageUrl === "string" && b.imageUrl ? b.imageUrl : "";
    if (imageUrl && !isOwnMediaUrl(imageUrl)) return fail("Некорректное фото");
    if (!text && !imageUrl) return fail("Напиши что-нибудь или добавь фото");
    const ref = db.collection("messengerPosts").doc();
    await ref.set({ uid: me.uid, text, ...(imageUrl ? { imageUrl } : {}), createdAt: Date.now(), likes: 0, comments: 0 });
    return NextResponse.json({ ok: true, id: ref.id });
  }

  if (!okId(b.id)) return fail("id обязателен");
  const ref = db.collection("messengerPosts").doc(b.id);

  if (b.action === "delete") {
    const p = (await ref.get()).data();
    if (!p) return fail("Пост не найден", 404);
    if (p.uid !== me.uid && !isAdminUid(me.uid)) return fail("Нельзя удалить чужой пост", 403);
    await ref.delete();
    return NextResponse.json({ ok: true });
  }

  if (b.action === "like" || b.action === "unlike") {
    if (!(await rateLimit(`msgr_plike_${me.uid}`, 120, 60 * 60_000))) return fail("Слишком часто", 429);
    const likeRef = ref.collection("likes").doc(me.uid);
    let likes = 0;
    try {
      await db.runTransaction(async (tx) => {
        const [post, like] = await Promise.all([tx.get(ref), tx.get(likeRef)]);
        if (!post.exists) throw new Error("gone");
        likes = (post.data()?.likes as number) ?? 0;
        if (b.action === "like" && !like.exists) { tx.set(likeRef, { at: Date.now() }); tx.update(ref, { likes: FieldValue.increment(1) }); likes += 1; }
        if (b.action === "unlike" && like.exists) { tx.delete(likeRef); tx.update(ref, { likes: FieldValue.increment(-1) }); likes = Math.max(0, likes - 1); }
      });
    } catch (e: any) {
      if (e?.message === "gone") return fail("Пост не найден", 404);
      throw e;
    }
    return NextResponse.json({ ok: true, likes });
  }

  if (b.action === "comment") {
    if (!(await rateLimit(`msgr_pcom_${me.uid}`, 20, 60 * 60_000))) return fail("Слишком много комментариев — подожди", 429);
    const text = clean(b.text, COMMENT_MAX);
    if (!text) return fail("Напиши комментарий");
    if (!(await ref.get()).exists) return fail("Пост не найден", 404);
    await ref.collection("comments").add({ uid: me.uid, text, createdAt: Date.now() });
    await ref.update({ comments: FieldValue.increment(1) });
    return NextResponse.json({ ok: true });
  }

  return fail("action: create | delete | like | unlike | comment");
}
