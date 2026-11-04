import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { HANDLE_RE } from "@/lib/messenger/server";
import { STATUS_EMOJIS, isPremium } from "@/lib/messenger/premium";
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
  if ("status" in b) {
    // статус рядом с ником: эмодзи или свой NFT-подарок; ставить может только Premium, снять — любой
    const st = b.status;
    if (st === null) upd.status = null;
    else if (!isPremium(me.account)) return NextResponse.json({ error: "Статус рядом с ником — только с Mili Premium", needPremium: true }, { status: 403 });
    else if (st?.kind === "emoji") {
      if (!STATUS_EMOJIS.includes(st.emoji)) return fail("Такого статуса нет");
      upd.status = { kind: "emoji", emoji: st.emoji };
    } else if (st?.kind === "nft" && typeof st.giftDocId === "string" && !st.giftDocId.includes("/")) {
      const g = (await adminDb().collection("messengerGifts").doc(st.giftDocId).get()).data();
      if (!g || g.to !== me.uid || !g.nft) return fail("Этот NFT не твой");
      upd.status = { kind: "nft", giftId: g.giftId, giftDocId: st.giftDocId, nft: g.nft };
    } else return fail("Некорректный статус");
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
  if ("profileTrack" in b) {
    // мелодия профиля: трек из раздела «Музыка»
    const v = b.profileTrack;
    if (v === null || v === "") upd.profileTrack = null;
    else if (typeof v === "string" && !v.includes("/") && (await adminDb().collection("messengerMusicTracks").doc(v).get()).exists) upd.profileTrack = v;
    else return fail("Такого трека нет");
  }
  if ("socials" in b) {
    // ссылки на соцсети: до 3, тип из списка, значение — только безопасные символы
    const KINDS = ["telegram", "tiktok", "soundcloud", "instagram", "youtube", "x", "vk"];
    const list = Array.isArray(b.socials) ? b.socials.slice(0, 3) : [];
    const out: { kind: string; value: string }[] = [];
    for (const it of list) {
      const kind = typeof it?.kind === "string" ? it.kind : "";
      const value = typeof it?.value === "string" ? it.value.trim().replace(/^@/, "") : "";
      if (!value) continue;
      if (!KINDS.includes(kind) || value.length > 40 || !/^[A-Za-z0-9_.\-]+$/.test(value)) return fail("Проверь ссылки на соцсети: только буквы, цифры, _ . -");
      out.push({ kind, value });
    }
    upd.socials = out;
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
