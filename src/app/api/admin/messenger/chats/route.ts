import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { dmChatId, HANDLE_RE, uidByHandle } from "@/lib/messenger/server";
import type { MessengerChat } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const CONTEXT = 30; // сообщений до и после жалобы
const LAST = 100; // сколько последних сообщений при чтении по причине

/**
 * Чтение переписки для модерации. Не «читалка всего подряд»: доступ только
 *  • из жалобы:      GET ?reportId=…                  — ±30 сообщений вокруг сообщения из жалобы;
 *  • по причине:     GET ?chatId=…  или  ?a=@x&b=@y   + &reason=… (от 10 символов) — последние 100 сообщений.
 * Служебные чаты («MiliGram Push») и «Избранное» (чат с самим собой) не открываются никогда.
 * Каждое чтение пишется в adminAuditLog (кто, какой чат, зачем); об этом сказано в Политике конфиденциальности.
 * GET ?audit=1 — последние записи журнала чтений.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const db = adminDb();
  const sp = req.nextUrl.searchParams;

  if (sp.get("audit")) {
    const snap = await db.collection("adminAuditLog").orderBy("at", "desc").limit(200).get();
    const rows = snap.docs.map((d) => d.data()).filter((r: any) => String(r.action).startsWith("messenger_read")).slice(0, 40);
    return NextResponse.json({ audit: rows });
  }

  let chatId = "";
  let around: number | null = null; // createdAt сообщения из жалобы
  let reason = "";
  let how = "";

  const reportId = sp.get("reportId");
  if (reportId) {
    if (reportId.includes("/")) return err("reportId некорректен");
    const r = (await db.collection("messengerReports").doc(reportId).get()).data();
    if (!r) return err("Жалоба не найдена", 404);
    chatId = r.chatId;
    reason = `жалоба ${reportId}`;
    how = "report";
    const m = (await db.collection("messengerChats").doc(chatId).collection("messages").doc(r.msgId).get()).data();
    around = (m?.createdAt as number | undefined) ?? r.createdAt ?? null;
  } else {
    reason = (sp.get("reason") ?? "").trim().slice(0, 300);
    if (reason.length < 10) return err("Укажи причину доступа (не короче 10 символов): без неё читать переписку нельзя");
    how = "reason";
    const a = (sp.get("a") ?? "").trim().toLowerCase().replace(/^@/, "");
    const b = (sp.get("b") ?? "").trim().toLowerCase().replace(/^@/, "");
    if (a && b) {
      if (!HANDLE_RE.test(a) || !HANDLE_RE.test(b)) return err("Некорректный @username");
      const [ua, ub] = await Promise.all([uidByHandle(a), uidByHandle(b)]);
      if (!ua || !ub) return err("Пользователь не найден", 404);
      chatId = dmChatId(ua, ub);
    } else {
      chatId = sp.get("chatId") ?? "";
    }
  }
  if (!chatId || chatId.includes("/")) return err("Укажи chatId, два @username или жалобу");

  const chatSnap = await db.collection("messengerChats").doc(chatId).get();
  if (!chatSnap.exists) return err("Чат не найден", 404);
  const chat = { id: chatSnap.id, ...chatSnap.data() } as MessengerChat & { service?: boolean };
  if (chat.service) return err("Служебные чаты не открываются", 403);
  if (chat.type === "dm" && new Set(chat.members).size === 1) return err("«Избранное» не открывается", 403);

  const col = db.collection("messengerChats").doc(chatId).collection("messages");
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (around !== null) {
    const [before, after] = await Promise.all([
      col.where("createdAt", "<=", around).orderBy("createdAt", "desc").limit(CONTEXT + 1).get(),
      col.where("createdAt", ">", around).orderBy("createdAt", "asc").limit(CONTEXT).get(),
    ]);
    docs = [...before.docs.reverse(), ...after.docs];
  } else {
    docs = (await col.orderBy("createdAt", "desc").limit(LAST).get()).docs.reverse();
  }

  const messages = docs.map((d) => {
    const m = d.data();
    return { id: d.id, from: m.from, kind: m.kind, text: m.deletedForAll ? "" : m.text ?? "", mediaUrl: m.deletedForAll ? null : m.mediaUrl ?? null, createdAt: m.createdAt, deleted: !!m.deletedForAll };
  });
  const uids = Array.from(new Set([...chat.members, ...messages.map((m) => m.from)]));
  const accs = uids.length ? await db.getAll(...uids.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  const accounts: Record<string, { displayName: string; handle: string }> = {};
  accs.forEach((s, i) => { const a = s.data(); if (a) accounts[uids[i]] = { displayName: a.displayName, handle: a.handle }; });

  await logAdminAccess(admin.uid, "messenger_read_chat", { chatId, how, reason, shown: messages.length });
  return NextResponse.json({ chat: { id: chat.id, type: chat.type, title: chat.title ?? null, members: chat.members }, messages, accounts, highlightAt: around });
}
