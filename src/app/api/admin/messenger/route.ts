import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?q= — статистика, открытые жалобы и поиск аккаунтов мессенджера (по началу @handle или точному имени). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const db = adminDb();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().replace(/^@/, "").slice(0, 24);

  const [accounts, chats, openReports, reportSnap, premiumN, giftsN, packsN] = await Promise.all([
    db.collection("messengerAccounts").count().get(),
    db.collection("messengerChats").count().get(),
    db.collection("messengerReports").where("status", "==", "open").count().get(),
    db.collection("messengerReports").where("status", "==", "open").limit(50).get(),
    db.collection("messengerAccounts").where("premiumUntil", ">", Date.now()).count().get(),
    db.collection("messengerGifts").count().get(),
    db.collection("messengerStickerPacks").count().get(),
  ]);

  let found: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (q.length >= 2) {
    const s = await db.collection("messengerAccounts").where("handle", ">=", q).where("handle", "<=", q + "\uf8ff").limit(20).get();
    found = s.docs;
  } else {
    found = (await db.collection("messengerAccounts").orderBy("createdAt", "desc").limit(30).get()).docs;
  }
  const reports = reportSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.createdAt - a.createdAt);
  return NextResponse.json({
    stats: { accounts: accounts.data().count, chats: chats.data().count, openReports: openReports.data().count, premium: premiumN.data().count, gifts: giftsN.data().count, stickerPacks: packsN.data().count },
    accounts: found.map((d) => d.data()),
    reports,
  });
}

/** POST { action: "ban"|"unban"|"verify"|"unverify"|"resolveReport", uid?, reportId?, deleteMessage? } */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const db = adminDb();
  const b = await req.json().catch(() => ({}));
  try {
    if (["ban", "unban", "verify", "unverify"].includes(b.action)) {
      if (typeof b.uid !== "string" || !b.uid || b.uid.includes("/")) return NextResponse.json({ error: "uid обязателен" }, { status: 400 });
      const ref = db.collection("messengerAccounts").doc(b.uid);
      if (!(await ref.get()).exists) return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
      if (b.action === "ban") {
        await ref.update({ banned: true });
        await adminAuth().revokeRefreshTokens(b.uid).catch(() => {}); // выбить текущие сессии
      } else if (b.action === "unban") await ref.update({ banned: false });
      else await ref.update({ verified: b.action === "verify" });
      await logAdminAccess(admin.uid, `messenger_${b.action}`, { targetUid: b.uid });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "grantPremium") {
      const days = Number(b.days);
      if (typeof b.uid !== "string" || !b.uid || b.uid.includes("/") || !Number.isFinite(days) || days < 1 || days > 365) return NextResponse.json({ error: "uid и days (1–365) обязательны" }, { status: 400 });
      const ref = db.collection("messengerAccounts").doc(b.uid);
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
      const base = Math.max(Date.now(), (snap.data()!.premiumUntil as number | undefined) ?? 0);
      await ref.update({ premiumUntil: base + Math.round(days) * 24 * 60 * 60 * 1000 });
      await logAdminAccess(admin.uid, "messenger_grant_premium", { targetUid: b.uid, days });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "resolveReport") {
      if (typeof b.reportId !== "string" || !b.reportId || b.reportId.includes("/")) return NextResponse.json({ error: "reportId обязателен" }, { status: 400 });
      const rref = db.collection("messengerReports").doc(b.reportId);
      const r = (await rref.get()).data();
      if (!r) return NextResponse.json({ error: "Жалоба не найдена" }, { status: 404 });
      if (b.deleteMessage === true) {
        const mref = db.collection("messengerChats").doc(r.chatId).collection("messages").doc(r.msgId);
        if ((await mref.get()).exists) await mref.update({ deletedForAll: true, text: FieldValue.delete(), mediaUrl: FieldValue.delete(), mediaUrls: FieldValue.delete(), reactions: {} });
      }
      await rref.update({ status: "resolved", resolvedAt: Date.now(), resolvedBy: admin.uid });
      await logAdminAccess(admin.uid, "messenger_resolve_report", { reportId: b.reportId, deleted: b.deleteMessage === true });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (err) {
    console.error("admin/messenger error:", err);
    return NextResponse.json({ error: "Не удалось выполнить" }, { status: 500 });
  }
}
