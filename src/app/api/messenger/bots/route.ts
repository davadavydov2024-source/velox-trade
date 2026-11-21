import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { BOT_HOST_DAYS, BOT_HOST_PRICE, BOT_LIMIT, BotError, MAX_RULES, createBot, deleteBot, hostBot, isHosted, updateBot, type BotDoc } from "@/lib/messenger/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const view = (b: BotDoc) => ({
  id: b.id, handle: b.handle, name: b.name, description: b.description, welcome: b.welcome, fallback: b.fallback, rules: b.rules,
  hostedUntil: b.hostedUntil, running: isHosted(b), usersCount: b.usersCount ?? 0, messagesCount: b.messagesCount ?? 0, createdAt: b.createdAt,
});

/** GET — мои боты, баланс 🪙 и условия (лимит, цена и срок хостинга). */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const [snap, user] = await Promise.all([db.collection("messengerBots").where("ownerUid", "==", me.uid).get(), db.collection("users").doc(me.uid).get()]);
  const bots = snap.docs.map((d) => d.data() as BotDoc).sort((a, b) => a.createdAt - b.createdAt).map(view);
  return NextResponse.json({ bots, wallet: (user.data()?.miliWallet as number | undefined) ?? 0, limit: BOT_LIMIT, hostPrice: BOT_HOST_PRICE, hostDays: BOT_HOST_DAYS, maxRules: MAX_RULES });
}

/** POST { action: "create", name, handle } | { action: "update", id, name?, description?, welcome?, fallback?, rules? } | { action: "host", id } | { action: "delete", id } */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_bots_${me.uid}`, 30, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const id = typeof b.id === "string" && b.id && !b.id.includes("/") ? b.id : "";
  try {
    switch (b.action) {
      case "create": { const bot = await createBot(me.uid, b.name, b.handle); return NextResponse.json({ ok: true, bot: view(bot) }); }
      case "update": if (!id) return fail("id обязателен"); await updateBot(me.uid, id, b); return NextResponse.json({ ok: true });
      case "host": { if (!id) return fail("id обязателен"); const hostedUntil = await hostBot(me.uid, id); return NextResponse.json({ ok: true, hostedUntil }); }
      case "delete": if (!id) return fail("id обязателен"); await deleteBot(me.uid, id); return NextResponse.json({ ok: true });
      default: return fail("Неизвестное действие");
    }
  } catch (e) {
    if (e instanceof BotError) return fail(e.message, e.status);
    console.error("bots error:", e);
    return fail("Не удалось выполнить действие", 500);
  }
}
