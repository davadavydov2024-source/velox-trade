import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomInt } from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { dmChatId, ensureServiceAccount, postMessage, sendServiceMessage, SERVICE_UID, type MessengerAuth } from "@/lib/messenger/server";
import { giftById, GIFT_MESSAGE_MAX, type GiftNft, type MessengerGift } from "@/lib/messenger/gifts";
import { NFT_BACKDROPS, NFT_MODELS, NFT_SYMBOLS, rollNft, type NftTrait } from "@/lib/messenger/nft";
import type { MessengerAccount, MessengerChat } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DAY = 24 * 60 * 60 * 1000;

const err = (m: string, status = 400) => NextResponse.json({ error: m }, { status });
const cleanUid = (v: unknown) => (typeof v === "string" && v && !v.includes("/") ? v : "");

/** Личный чат a↔b (создаётся, если его нет). service — служебный чат «MiliGram Push». */
async function dmChat(a: string, b: string, service: boolean): Promise<MessengerChat> {
  const ref = adminDb().collection("messengerChats").doc(dmChatId(a, b));
  let snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ type: "dm", members: [a, b], admins: [], createdBy: a, ...(service ? { service: true } : {}), updatedAt: Date.now(), readBy: {}, pinnedMessageIds: [] });
    snap = await ref.get();
  }
  return { id: ref.id, ...snap.data() } as MessengerChat;
}

/**
 * GET ?uid= — что сейчас у человека: Premium, ⭐ кошелёк, подарки (для вкладки «Выдать» в админ-панели мессенджера).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const uid = cleanUid(req.nextUrl.searchParams.get("uid"));
  if (!uid) return err("uid обязателен");
  const db = adminDb();
  const [acc, user, gifts] = await Promise.all([
    db.collection("messengerAccounts").doc(uid).get(),
    db.collection("users").doc(uid).get(),
    db.collection("messengerGifts").where("to", "==", uid).limit(100).get(),
  ]);
  if (!acc.exists) return err("Аккаунт не найден", 404);
  const a = acc.data() as MessengerAccount;
  const rows = gifts.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MessengerGift, "id">) }))
    .sort((x, y) => y.at - x.at)
    .map((g) => ({ id: g.id, giftId: g.giftId, at: g.at, nft: g.nft ?? null, byAdmin: !!(g as any).byAdmin }));
  return NextResponse.json({
    account: { uid, handle: a.handle, displayName: a.displayName, premiumUntil: a.premiumUntil ?? 0, verified: !!a.verified, banned: !!a.banned },
    wallet: (user.data()?.starsWallet as number | undefined) ?? 0,
    gifts: rows,
  });
}

/**
 * POST { uid, action, ... } — выдать человеку что-нибудь от имени администрации:
 *  premium        { days }                         — добавить Mili Premium (1–3650 дн.)
 *  premiumRevoke                                   — снять Mili Premium
 *  stars          { amount }                       — начислить ⭐ в кошелёк Velox
 *  gift           { giftId, count?, message?, from?: "service"|"me", nft?: { model?, backdrop?, symbol? } }
 *                                                  — подарить любой подарок из каталога (в т.ч. NFT, можно выбрать признаки); бесплатно для админа
 *  revokeGift     { giftDocId }                    — забрать подарок
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const b = await req.json().catch(() => ({}));
  const uid = cleanUid(b.uid);
  if (!uid || uid === SERVICE_UID) return err("Выбери человека");
  const db = adminDb();
  const accRef = db.collection("messengerAccounts").doc(uid);
  const accSnap = await accRef.get();
  if (!accSnap.exists) return err("Аккаунт не найден", 404);

  try {
    if (b.action === "premium") {
      const days = Math.round(Number(b.days));
      if (!Number.isFinite(days) || days < 1 || days > 3650) return err("Дней: от 1 до 3650");
      const base = Math.max(Date.now(), (accSnap.data()!.premiumUntil as number | undefined) ?? 0);
      await accRef.update({ premiumUntil: base + days * DAY });
      await logAdminAccess(admin.uid, "messenger_grant_premium", { targetUid: uid, days });
      sendServiceMessage(uid, `⭐ Администрация подарила вам Mili Premium на ${days} дн. Спасибо, что вы с нами!`).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    if (b.action === "premiumRevoke") {
      await accRef.update({ premiumUntil: 0 });
      await logAdminAccess(admin.uid, "messenger_revoke_premium", { targetUid: uid });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "stars") {
      const amount = Math.round(Number(b.amount));
      if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) return err("Сумма ⭐: от 1 до 1 000 000");
      await db.runTransaction(async (tx) => {
        tx.set(db.collection("users").doc(uid), { starsWallet: FieldValue.increment(amount) }, { merge: true });
        tx.set(db.collection("starsWalletLog").doc(), { uid, delta: amount, type: "admin_grant", ref: admin.uid, at: Date.now() });
      });
      await logAdminAccess(admin.uid, "messenger_grant_stars", { targetUid: uid, amount });
      sendServiceMessage(uid, `⭐ Администрация начислила вам ${amount} ⭐ — они уже в кошельке Velox.`).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    if (b.action === "gift") {
      const gift = giftById(String(b.giftId ?? ""));
      if (!gift) return err("Такого подарка нет", 404);
      const count = Math.round(Number(b.count ?? 1));
      if (!Number.isFinite(count) || count < 1 || count > 10) return err("Количество: от 1 до 10");
      const message = typeof b.message === "string" ? b.message.trim().slice(0, GIFT_MESSAGE_MAX) : "";

      // свои признаки NFT (необязательно): неизвестное название — ошибка, пустое — случайно
      const want: { model?: string; backdrop?: string; symbol?: string } = {};
      if (gift.nft && b.nft && typeof b.nft === "object") {
        for (const [key, list] of [["model", NFT_MODELS], ["backdrop", NFT_BACKDROPS], ["symbol", NFT_SYMBOLS]] as const) {
          const v = b.nft[key];
          if (typeof v === "string" && v) {
            if (!(list as readonly NftTrait[]).some((t) => t.name === v)) return err(`Неизвестный признак NFT: ${v}`);
            want[key] = v;
          }
        }
      }

      const svc = await ensureServiceAccount();
      let sender: MessengerAuth = svc;
      if (b.from === "me") {
        const mine = await db.collection("messengerAccounts").doc(admin.uid).get();
        if (!mine.exists) return err("У тебя самого нет аккаунта MiliGram — выбери отправителя «MiliGram»");
        sender = { uid: admin.uid, account: mine.data() as MessengerAccount };
      }

      const now = Date.now();
      const stockRef = db.collection("messengerGiftStock").doc(gift.id);
      const refs = Array.from({ length: count }, () => db.collection("messengerGifts").doc());
      const minted: (GiftNft | undefined)[] = [];
      const rnd = () => randomInt(0, 1_000_000) / 1_000_000;

      await db.runTransaction(async (tx) => {
        minted.length = 0;
        let sold = 0;
        if (gift.limited) {
          sold = ((await tx.get(stockRef)).data()?.sold as number | undefined) ?? 0;
          if (sold + count > gift.limited) throw new Error("sold-out");
          tx.set(stockRef, { sold: sold + count }, { merge: true });
        }
        refs.forEach((r, i) => {
          let nft: GiftNft | undefined;
          if (gift.nft) nft = { ...rollNft(sold + i + 1, gift.limited ?? sold + i + 1, rnd, gift.category === "halloween"), ...want };
          minted.push(nft);
          tx.set(r, {
            giftId: gift.id, from: sender.uid, to: uid, price: gift.price, at: now, hidden: false, anonymous: false, byAdmin: true,
            ...(nft ? { nft } : {}), ...(message ? { message } : {}),
          });
        });
      });

      // карточки подарков в чат (сбой не отменяет выдачу — подарки уже в профиле)
      try {
        const chat = await dmChat(sender.uid, uid, sender.uid === SERVICE_UID);
        for (let i = 0; i < refs.length; i++) {
          await postMessage({
            chat, sender, kind: "gift", text: message || undefined,
            extra: { gift: { giftId: gift.id, giftDocId: refs[i].id, price: gift.price, to: uid, ...(minted[i] ? { nft: minted[i] } : {}) } },
          });
        }
      } catch (e) {
        console.error("admin gift chat message error:", e);
      }
      await logAdminAccess(admin.uid, "messenger_grant_gift", { targetUid: uid, giftId: gift.id, count, from: sender.uid });
      return NextResponse.json({ ok: true, ids: refs.map((r) => r.id) });
    }

    if (b.action === "revokeGift") {
      const id = cleanUid(b.giftDocId);
      if (!id) return err("giftDocId обязателен");
      const ref = db.collection("messengerGifts").doc(id);
      const g = (await ref.get()).data() as MessengerGift | undefined;
      if (!g || g.to !== uid) return err("Подарок не найден", 404);
      await ref.delete();
      await logAdminAccess(admin.uid, "messenger_revoke_gift", { targetUid: uid, giftId: g.giftId, giftDocId: id });
      return NextResponse.json({ ok: true });
    }

    return err("Неизвестное действие");
  } catch (e: any) {
    if (e?.message === "sold-out") return err("Этого подарка осталось меньше, чем нужно: тираж почти раскуплен", 409);
    console.error("admin/messenger/grant error:", e);
    return err("Не удалось выполнить", 500);
  }
}
