import { adminDb } from "@/lib/firebaseAdmin";
import { sendServiceMessage } from "@/lib/messenger/server";

type ChatLike = { title?: string; createdBy: string; admins?: string[] };
export type JoinNotif = { admin: string; chatId: string; msgId: string };

/**
 * Заявка на вступление в закрытый канал/группу: записывает заявку и шлёт каждому админу сообщение
 * от «MiliGram Push» с кнопками «Принять / Отклонить». Идентификаторы этих сообщений хранятся в заявке,
 * чтобы потом пометить их «принята» / «отклонена» у всех админов.
 */
export async function createJoinRequest(chatId: string, chat: ChatLike, applicant: { uid: string; displayName: string; handle: string }): Promise<void> {
  const admins = Array.from(new Set([chat.createdBy, ...(chat.admins ?? [])])).filter((a) => a && a !== applicant.uid).slice(0, 10);
  const title = chat.title ?? "канал";
  const notif: JoinNotif[] = [];
  await Promise.all(admins.map(async (admin) => {
    try {
      const r = await sendServiceMessage(admin, `Заявка на вступление в «${title}»\n${applicant.displayName} (@${applicant.handle}) хочет вступить.`, {
        extra: { joinRequest: { chatId, uid: applicant.uid, title, name: applicant.displayName, status: "pending" } },
      });
      notif.push({ admin, chatId: r.chatId, msgId: r.msgId });
    } catch (e) {
      console.error("join request notify error:", e);
    }
  }));
  await adminDb().collection("messengerJoinRequests").doc(`${chatId}_${applicant.uid}`).set({ chatId, uid: applicant.uid, createdAt: Date.now(), notif });
}

/** После решения админа: помечаем уведомления у всех админов и сообщаем самому человеку. */
export async function resolveJoinRequest(req: { chatId: string; uid: string; notif?: JoinNotif[] }, title: string, approved: boolean): Promise<void> {
  const db = adminDb();
  const status = approved ? "approved" : "declined";
  await Promise.allSettled((req.notif ?? []).map((n) => db.collection("messengerChats").doc(n.chatId).collection("messages").doc(n.msgId).update({ "joinRequest.status": status })));
  await sendServiceMessage(req.uid, approved ? `Заявка принята: теперь ты в «${title}».` : `Заявку в «${title}» отклонили.`).catch(() => {});
}
