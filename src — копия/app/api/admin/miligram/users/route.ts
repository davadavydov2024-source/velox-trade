import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { sanitizeProfilePatch } from "@/lib/miligram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?q= — без q: последние 200 профилей MiliGram; с q: поиск пользователя Velox по email / @нику / имени. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const db = adminDb();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);

  let uids: string[] = [];
  if (!q) {
    const snap = await db.collection("miligramProfiles").orderBy("updatedAt", "desc").limit(200).get();
    uids = snap.docs.map((d) => d.id);
  } else {
    const users = db.collection("users");
    const found = new Set<string>();
    if (q.includes("@") && !q.startsWith("@")) {
      (await users.where("email", "==", q.toLowerCase()).limit(5).get()).docs.forEach((d) => found.add(d.id));
      await logAdminAccess(admin.uid, "miligram_user_search_by_email");
    } else {
      const name = q.replace(/^@/, "");
      (await users.where("username", "==", name.toLowerCase()).limit(5).get()).docs.forEach((d) => found.add(d.id));
      (await users.where("displayName", "==", name).limit(5).get()).docs.forEach((d) => found.add(d.id));
    }
    uids = Array.from(found);
  }

  if (uids.length === 0) return NextResponse.json({ rows: [] });
  const [userDocs, profDocs] = await Promise.all([
    db.getAll(...uids.map((u) => db.collection("users").doc(u))),
    db.getAll(...uids.map((u) => db.collection("miligramProfiles").doc(u))),
  ]);
  const rows = uids.map((uid, i) => {
    const u = userDocs[i].data() ?? {};
    return {
      uid,
      displayName: u.displayName ?? "—",
      username: u.username ?? null,
      email: u.email ?? null,
      photoURL: u.photoURL ?? null,
      profile: profDocs[i].exists ? { uid, ...profDocs[i].data() } : null,
    };
  });
  return NextResponse.json({ rows });
}

/** POST { uid, patch } — выдать бейдж, градиент, обводку, баннер, бан MiliGram. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  try {
    const { uid, patch } = await req.json();
    if (typeof uid !== "string" || !uid) return NextResponse.json({ error: "uid обязателен" }, { status: 400 });
    const clean = sanitizeProfilePatch(patch ?? {});
    const db = adminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: "Пользователь Velox не найден" }, { status: 404 });
    await db.collection("miligramProfiles").doc(uid).set({ uid, ...clean, updatedAt: Date.now() }, { merge: true });
    await logAdminAccess(admin.uid, "miligram_profile_update", { targetUid: uid, fields: Object.keys(clean) });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Не удалось сохранить" }, { status: 400 });
  }
}
