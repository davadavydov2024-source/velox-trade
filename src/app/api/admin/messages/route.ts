import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 200;

interface Person {
  uid: string;
  name: string;
}

/**
 * Список переписок для модерации (только админы, только чтение).
 *  ?type=dm|order  — личные сообщения или чаты заказов;
 *  ?uid=...        — только переписки этого пользователя;
 *  ?q=...          — поиск по имени, uid, номеру заказа.
 */
export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if ("error" in guard) return guard.error;

    const type = req.nextUrl.searchParams.get("type") === "order" ? "order" : "dm";
    const uid = (req.nextUrl.searchParams.get("uid") ?? "").trim();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    const db = adminDb();

    if (uid) await logAdminAccess(guard.uid, "list_chats_of_user", { targetUid: uid, type });

    if (type === "dm") {
      const base = db.collection("directConversations");
      const snap = uid
        ? await base.where("participants", "array-contains", uid).get()
        : await base.orderBy("updatedAt", "desc").limit(LIMIT).get();
      let items = snap.docs.map((d) => {
        const data = d.data() as {
          participants?: string[];
          participantNames?: Record<string, string>;
          lastMessage?: string;
          updatedAt?: number;
          messages?: unknown[];
        };
        const people: Person[] = (data.participants ?? []).map((p) => ({ uid: p, name: data.participantNames?.[p] ?? p.slice(0, 8) }));
        return { id: d.id, people, lastMessage: data.lastMessage ?? "", updatedAt: data.updatedAt ?? 0, count: data.messages?.length ?? 0 };
      });
      if (q) items = items.filter((c) => c.people.some((p) => p.name.toLowerCase().includes(q) || p.uid.toLowerCase().includes(q)) || c.id.toLowerCase().includes(q));
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      return NextResponse.json({ type, items: items.slice(0, LIMIT) });
    }

    // Чаты заказов
    const base = db.collection("orderChats");
    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (uid) {
      const [a, b] = await Promise.all([base.where("buyerId", "==", uid).get(), base.where("sellerId", "==", uid).get()]);
      const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      [...a.docs, ...b.docs].forEach((d) => map.set(d.id, d));
      docs = [...map.values()];
    } else {
      docs = (await base.orderBy("updatedAt", "desc").limit(LIMIT).get()).docs;
    }

    const uids = Array.from(new Set(docs.flatMap((d) => [String(d.data().buyerId ?? ""), String(d.data().sellerId ?? "")]).filter(Boolean)));
    const nameOf = new Map<string, string>();
    for (let i = 0; i < uids.length; i += 100) {
      const refs = uids.slice(i, i + 100).map((u) => db.collection("users").doc(u));
      (await db.getAll(...refs)).forEach((s) => nameOf.set(s.id, (s.data()?.displayName as string) ?? s.id.slice(0, 8)));
    }

    let items = docs.map((d) => {
      const data = d.data() as { buyerId?: string; sellerId?: string; updatedAt?: number; messages?: Array<{ from: string; text?: string }> };
      const msgs = data.messages ?? [];
      const lastReal = [...msgs].reverse().find((m) => m.from !== "system");
      const buyer = { uid: data.buyerId ?? "", name: nameOf.get(data.buyerId ?? "") ?? "—" };
      const seller = { uid: data.sellerId ?? "", name: nameOf.get(data.sellerId ?? "") ?? "—" };
      return {
        id: d.id,
        people: [buyer, seller] as Person[],
        lastMessage: (lastReal?.text ?? "").slice(0, 120),
        updatedAt: data.updatedAt ?? 0,
        count: msgs.length,
      };
    });
    if (q) items = items.filter((c) => c.id.toLowerCase().includes(q) || c.people.some((p) => p.name.toLowerCase().includes(q) || p.uid.toLowerCase().includes(q)));
    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ type, items: items.slice(0, LIMIT) });
  } catch (err) {
    console.error("admin/messages error:", err);
    return NextResponse.json({ error: "Не удалось загрузить переписки" }, { status: 500 });
  }
}
