import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/adminGuard";

export const runtime = "nodejs";

type Col = "orderChats" | "directConversations" | "tickets";

/**
 * Отметка «прочитано» (две галочки у отправителя, как в Telegram). Раньше браузер писал поле readBy
 * в документ чата сам, но правила Firestore часто не пускают участников писать это поле — тогда
 * отправитель никогда не видел «Прочитано». Теперь пишет сервер, предварительно проверив, что
 * человек — участник именно этого чата.
 * Тело: { col, id, readerKey, lastMessageAt } — readerKey это uid читателя или "admin" (поддержка).
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if ("error" in guard) return guard.error;

    const { col, id, readerKey, lastMessageAt } = (await req.json().catch(() => ({}))) as {
      col?: Col;
      id?: string;
      readerKey?: string;
      lastMessageAt?: number;
    };
    if (!col || !["orderChats", "directConversations", "tickets"].includes(col)) return NextResponse.json({ error: "Неверный чат" }, { status: 400 });
    if (typeof id !== "string" || !id || id.length > 200) return NextResponse.json({ error: "Неверный чат" }, { status: 400 });
    if (typeof lastMessageAt !== "number" || !Number.isFinite(lastMessageAt) || lastMessageAt <= 0 || lastMessageAt > Date.now() + 10 * 60 * 1000) {
      return NextResponse.json({ error: "Неверное время" }, { status: 400 });
    }

    const db = adminDb();
    const ref = db.collection(col).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: true }); // чата ещё нет — отмечать нечего
    const data = snap.data() as Record<string, any>;

    // Кто может отмечать и под каким ключом
    let key: string | null = null;
    if (col === "orderChats") {
      if (guard.uid === data.buyerId || guard.uid === data.sellerId || guard.isAdmin) key = guard.uid;
    } else if (col === "directConversations") {
      if (Array.isArray(data.participants) && data.participants.includes(guard.uid)) key = guard.uid;
    } else {
      // tickets: владелец обращения — под своим uid; админ и менеджер поддержки — под ключом "admin"
      if (data.userId === guard.uid && readerKey !== "admin") key = guard.uid;
      else if (readerKey === "admin") {
        const staff = (await db.collection("users").doc(guard.uid).get()).data()?.staffRole === "manager";
        if (guard.isAdmin || staff) key = "admin";
      }
    }
    if (!key) return NextResponse.json({ error: "Нет доступа к чату" }, { status: 403 });

    // Отметка только растёт (в транзакции — чтобы не перетереть более свежую)
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const current = (fresh.data()?.readBy?.[key as string] as number | undefined) ?? 0;
      if (lastMessageAt > current) tx.update(ref, { [`readBy.${key}`]: lastMessageAt });
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("chats/read error:", err);
    return NextResponse.json({ error: "Не удалось отметить" }, { status: 500 });
  }
}
