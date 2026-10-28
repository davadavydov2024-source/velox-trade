import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { HANDLE_RE } from "@/lib/messenger/server";
import { fail, isOwnMediaUrl, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** POST { displayName?, bio?, photoURL?, showLastSeen?, birthday? (ММ-ДД), privacy?: { whoCanMessage, whoCanAddToGroups } (everyone|nobody) } — изменить свой профиль мессенджера. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const upd: Record<string, unknown> = {};
  if ("displayName" in b) {
    const n = String(b.displayName ?? "").trim();
    if (n.length < 2 || n.length > 40) return fail("Имя — от 2 до 40 символов");
    upd.displayName = n;
  }
  if ("bio" in b) upd.bio = String(b.bio ?? "").slice(0, 200);
  if ("photoURL" in b) {
    if (b.photoURL === null || b.photoURL === "") upd.photoURL = null;
    else if (isOwnMediaUrl(b.photoURL)) upd.photoURL = b.photoURL;
    else return fail("Некорректная ссылка на фото");
  }
  if ("bannerURL" in b) {
    if (b.bannerURL === null || b.bannerURL === "") upd.bannerURL = null;
    else if (isOwnMediaUrl(b.bannerURL)) upd.bannerURL = b.bannerURL;
    else return fail("Некорректная ссылка на баннер");
  }
  if ("channelHandle" in b) {
    // личный канал в профиле: только свой публичный канал (создатель — я)
    const v = String(b.channelHandle ?? "").trim().toLowerCase().replace(/^@/, "");
    if (!v) upd.channelHandle = null;
    else {
      if (!HANDLE_RE.test(v)) return fail("Некорректный @адрес канала");
      const h = (await adminDb().collection("messengerHandles").doc(v).get()).data();
      const chat = h?.kind === "channel" ? (await adminDb().collection("messengerChats").doc(h.chatId).get()).data() : null;
      if (!chat || chat.createdBy !== me.uid) return fail("Канал не найден или он не твой");
      upd.channelHandle = v;
    }
  }
  if ("showLastSeen" in b) upd.showLastSeen = b.showLastSeen === true;
  if ("birthday" in b) {
    const v = b.birthday;
    if (v === null || v === "") upd.birthday = null;
    else if (typeof v === "string" && /^(\d{4}-)?\d{2}-\d{2}$/.test(v)) upd.birthday = v; // редактор шлёт ГГГГ-ММ-ДД, допускаем и ММ-ДД
    else return fail("Дата рождения: ГГГГ-ММ-ДД или ММ-ДД");
  }
  if ("privacy" in b) {
    const p = b.privacy ?? {};
    const ok = (v: unknown) => v === "everyone" || v === "nobody";
    if (!ok(p.whoCanMessage) || !ok(p.whoCanAddToGroups)) return fail("Приватность: everyone или nobody");
    upd.privacy = { whoCanMessage: p.whoCanMessage, whoCanAddToGroups: p.whoCanAddToGroups };
  }
  if (Object.keys(upd).length === 0) return fail("Нечего менять");
  await adminDb().collection("messengerAccounts").doc(me.uid).update(upd);
  return NextResponse.json({ ok: true });
}
