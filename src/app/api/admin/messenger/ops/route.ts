import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { logAdminAccess, requireAdmin } from "@/lib/adminGuard";
import { OPS_COLLECTION, OP_TYPE_LABEL, normalizeOpCode, type OpDoc } from "@/lib/messenger/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 150;

type Acc = { uid: string; handle: string; displayName: string; photoURL: string | null };

/** Все операции, где человек (или подарок / заказ) участвует как отправитель, получатель или объект (ref). */
async function byId(id: string): Promise<OpDoc[]> {
  const col = adminDb().collection(OPS_COLLECTION);
  const snaps = await Promise.all((["from", "to", "ref"] as const).map((f) => col.where(f, "==", id).limit(LIMIT).get()));
  const map = new Map<string, OpDoc>();
  for (const s of snaps) for (const d of s.docs) map.set(d.id, d.data() as OpDoc);
  return Array.from(map.values()).sort((a, b) => b.at - a.at).slice(0, LIMIT);
}

/**
 * Поиск операций MiliGram для админов (разбор обмана).
 *  ?code=MG-XXXX-XXXX — одна операция
 *  ?handle=ник        — все операции человека
 *  ?id=…              — по ID человека, подарка или заказа
 * В ответе — время, кто кому, сумма и детали. Каждый поиск пишется в журнал админов.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const sp = req.nextUrl.searchParams;
  const db = adminDb();

  try {
    let ops: OpDoc[] = [];
    let user: Acc | null = null;
    const codeRaw = (sp.get("code") ?? "").trim();
    const handleRaw = (sp.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
    const id = (sp.get("id") ?? "").trim();

    if (codeRaw) {
      const code = normalizeOpCode(codeRaw);
      if (!code) return NextResponse.json({ error: "Это не похоже на код операции. Код выглядит так: MG-7K3Q-9XPD" }, { status: 400 });
      const s = await db.collection(OPS_COLLECTION).doc(code).get();
      ops = s.exists ? [s.data() as OpDoc] : [];
      await logAdminAccess(admin.uid, "messenger_op_lookup", { code });
    } else if (handleRaw || id) {
      let targetId = id;
      if (handleRaw) {
        const q = await db.collection("messengerAccounts").where("handle", "==", handleRaw).limit(1).get();
        if (q.empty) return NextResponse.json({ ops: [], user: null });
        targetId = q.docs[0].id;
      }
      ops = await byId(targetId);
      await logAdminAccess(admin.uid, "messenger_op_lookup", { target: targetId });
      if (handleRaw) {
        const a = (await db.collection("messengerAccounts").doc(targetId).get()).data();
        user = a ? { uid: targetId, handle: a.handle ?? "", displayName: a.displayName ?? "", photoURL: a.photoURL ?? null } : null;
      }
    } else {
      return NextResponse.json({ error: "Укажите код операции, @ник или ID" }, { status: 400 });
    }

    const uids = Array.from(new Set(ops.flatMap((o) => [o.from, o.to]).filter((u): u is string => !!u)));
    const accs = new Map<string, Acc>();
    if (uids.length) {
      for (const s of await db.getAll(...uids.map((u) => db.collection("messengerAccounts").doc(u)))) {
        const a = s.data();
        if (a) accs.set(s.id, { uid: s.id, handle: a.handle ?? "", displayName: a.displayName ?? "", photoURL: a.photoURL ?? null });
      }
    }
    const unknown = (uid: string): Acc => ({ uid, handle: "", displayName: "(аккаунт не найден)", photoURL: null });
    return NextResponse.json({
      user,
      ops: ops.map((o) => ({
        ...o,
        typeLabel: OP_TYPE_LABEL[o.type] ?? o.type,
        fromAcc: o.from ? accs.get(o.from) ?? unknown(o.from) : null,
        toAcc: o.to ? accs.get(o.to) ?? unknown(o.to) : null,
      })),
    });
  } catch (e) {
    console.error("admin ops error:", e);
    return NextResponse.json({ error: "Не удалось выполнить поиск" }, { status: 500 });
  }
}
