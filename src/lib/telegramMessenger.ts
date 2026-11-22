import { adminDb } from "./firebaseAdmin";

/** Тексты бота про мессенджер MiliGram: кошелёк 🪙 и непрочитанные чаты. */
export const NOT_LINKED_MILI = "Твой Telegram ещё не привязан к аккаунту MiliGram. Открой мессенджер → Настройки → Безопасность и подключи Telegram — это займёт полминуты.";

export async function getMiliWalletMessage(uid: string): Promise<string> {
  const u = (await adminDb().collection("users").doc(uid).get()).data();
  const coins = (u?.miliWallet as number | undefined) ?? 0;
  return `🪙 Кошелёк MiliGram\n\nБаланс: ${coins} 🪙\n\nМонетами платят за подарки, рамки аватарок, юзернеймы и запуск ботов.`;
}

/** Сколько непрочитанных и в каких чатах (до 5 самых «громких»). */
export async function getUnreadMessage(uid: string): Promise<string> {
  const db = adminDb();
  const snap = await db.collection("messengerUserChats").doc(uid).collection("chats").where("unread", ">", 0).limit(40).get();
  if (snap.empty) return "🔔 Непрочитанных сообщений нет — всё прочитано ✅";
  const rows = snap.docs.map((d) => ({ id: d.id, unread: Number(d.data().unread) || 0 })).sort((a, b) => b.unread - a.unread);
  const total = rows.reduce((s, r) => s + r.unread, 0);
  const top = rows.slice(0, 5);
  const chats = await db.getAll(...top.map((r) => db.collection("messengerChats").doc(r.id)));
  const peerIds = chats.map((c) => (c.data()?.type === "dm" ? ((c.data()?.members as string[]) ?? []).find((m) => m !== uid) : undefined));
  const peers = await Promise.all(peerIds.map((p) => (p ? db.collection("messengerAccounts").doc(p).get() : Promise.resolve(null))));
  const lines = top.map((r, i) => {
    const c = chats[i].data();
    const name = c?.type === "dm" ? (peers[i]?.data()?.displayName as string | undefined) ?? "Личный чат" : (c?.title as string | undefined) ?? "Чат";
    return `• ${name} — ${r.unread}`;
  });
  const more = rows.length > top.length ? `\n…и ещё в ${rows.length - top.length} чатах` : "";
  return `🔔 Непрочитанные: ${total} в ${rows.length} чатах\n\n${lines.join("\n")}${more}`;
}
