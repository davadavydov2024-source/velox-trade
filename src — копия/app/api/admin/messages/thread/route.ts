import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Полная переписка (только чтение). ?type=dm|order&id=... Каждое открытие записывается в adminAuditLog. */
export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if ("error" in guard) return guard.error;

    const type = req.nextUrl.searchParams.get("type") === "order" ? "order" : "dm";
    const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
    if (!id || id.length > 200) return NextResponse.json({ error: "Не указан чат" }, { status: 400 });

    const snap = await adminDb().collection(type === "dm" ? "directConversations" : "orderChats").doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    const data = snap.data() as Record<string, any>;

    await logAdminAccess(guard.uid, "read_chat", { type, chatId: id });

    if (type === "dm") {
      return NextResponse.json({
        type,
        id,
        people: (data.participants ?? []).map((p: string) => ({ uid: p, name: data.participantNames?.[p] ?? p.slice(0, 8) })),
        messages: data.messages ?? [],
      });
    }
    return NextResponse.json({
      type,
      id,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
      messages: data.messages ?? [],
    });
  } catch (err) {
    console.error("admin/messages/thread error:", err);
    return NextResponse.json({ error: "Не удалось загрузить чат" }, { status: 500 });
  }
}
