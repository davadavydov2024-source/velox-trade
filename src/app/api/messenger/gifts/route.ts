import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { dmChatId, fail, isDmBlocked, postMessage, requireMessenger, SERVICE_UID } from "@/lib/messenger/server";
import { randomInt } from "crypto";
import { rollNft } from "@/lib/messenger/nft";
import type { GiftNft } from "@/lib/messenger/gifts";
import { GIFT_CONVERT_RATE, GIFT_MESSAGE_MAX, canUpgradeGift, giftUpgradePrice, GIFT_PIN_MAX, GIFT_SALE_FEE, GIFT_SALE_MAX, GIFT_SALE_MIN, giftById, type GiftView, type MessengerGift } from "@/lib/messenger/gifts";
import type { MessengerAccount, MessengerChat } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET                → { wallet, stock: { [giftId]: sold } }  — баланс 🪙 и сколько ограниченных подарков уже раскуплено
 * GET ?uid=<uid|me>  → { gifts: GiftView[], total, stars }    — подарки в профиле (скрытые видит только владелец)
 */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const uidParam = req.nextUrl.searchParams.get("uid");

  if (!uidParam) {
    const [user, stockSnap, upSnap] = await Promise.all([db.collection("users").doc(me.uid).get(), db.collection("messengerGiftStock").get(), db.collection("messengerGiftUpgrades").get()]);
    const stock: Record<string, number> = {};
    stockSnap.forEach((d) => (stock[d.id] = (d.data().sold as number | undefined) ?? 0));
    const issued: Record<string, number> = {};
    upSnap.forEach((d) => (issued[d.id] = (d.data().count as number | undefined) ?? 0));
    return NextResponse.json({ wallet: (user.data()?.miliWallet as number | undefined) ?? 0, stock, issued });
  }

  const target = uidParam === "me" ? me.uid : uidParam;
  if (!target || target.includes("/")) return fail("uid некорректен");
  const owner = target === me.uid;
  const snap = await db.collection("messengerGifts").where("to", "==", target).limit(300).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerGift).filter((g) => owner || !g.hidden).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.pinned && b.pinned ? (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0) : b.at - a.at));

  const senderIds = Array.from(new Set(rows.filter((g) => !g.anonymous || owner).map((g) => g.from)));
  const accs = senderIds.length ? await db.getAll(...senderIds.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  const byUid: Record<string, MessengerAccount | undefined> = {};
  accs.forEach((a, i) => (byUid[senderIds[i]] = a.data() as MessengerAccount | undefined));

  const gifts: GiftView[] = rows.map((g) => {
    // анонимного отправителя видит только получатель (и сам отправитель)
    const showSender = !g.anonymous || owner || g.from === me.uid;
    const s = showSender ? byUid[g.from] ?? (g.from === me.uid ? me.account : undefined) : undefined;
    return {
      id: g.id, giftId: g.giftId, price: g.price, message: g.message, at: g.at, hidden: !!g.hidden, pinned: !!g.pinned, ...(g.salePrice ? { salePrice: g.salePrice } : {}), anonymous: !!g.anonymous,
      from: s ? { uid: g.from, displayName: s.displayName, photoURL: s.photoURL ?? null } : null,
      ...(g.nft ? { nft: g.nft } : {}),
    };
  });
  // сколько экземпляров каждой коллекции уже улучшено до NFT («Выпущено» в карточке коллекционного подарка)
  const issued: Record<string, number> = {};
  const upIds = Array.from(new Set(gifts.filter((g) => g.nft?.upgraded).map((g) => g.giftId)));
  if (upIds.length) {
    const ups = await db.getAll(...upIds.map((i) => db.collection("messengerGiftUpgrades").doc(i)));
    ups.forEach((d, i) => (issued[upIds[i]] = (d.data()?.count as number | undefined) ?? 0));
  }
  return NextResponse.json({ gifts, issued, total: gifts.length, stars: gifts.reduce((n, g) => n + g.price, 0) });
}

/**
 * POST { action: "send", toUid, giftId, message?, anonymous? } — купить подарок за 🪙 кошелька и отправить.
 * POST { action: "toggle", id, hidden } — показать/скрыть свой подарок в профиле.
 * POST { action: "convert", id }        — обменять полученный подарок на 🪙 (GIFT_CONVERT_RATE от цены).
 * POST { action: "pin", id, pinned }     — закрепить/открепить подарок вверху профиля (до GIFT_PIN_MAX).
 * POST { action: "list", id, price }     — выставить свой подарок на продажу за price 🪙 (price: null — снять с продажи).
 * POST { action: "transfer", id, toUid, message? } — подарить свой подарок другому пользователю.
 * POST { action: "upgrade", id }          — улучшить обычный подарок до коллекционного NFT за giftUpgradePrice 🪙 (рандомные модель/символ/фон, номер по счётчику коллекции).
 * POST { action: "buy", id }             — купить выставленный подарок у другого пользователя (продавец получает цену минус GIFT_SALE_FEE).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  if (b.action === "toggle") {
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    const g = (await ref.get()).data() as MessengerGift | undefined;
    if (!g || g.to !== me.uid) return fail("Подарок не найден", 404);
    await ref.update(b.hidden === true ? { hidden: true, pinned: false, pinnedAt: FieldValue.delete() } : { hidden: false });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "convert") {
    if (!(await rateLimit(`msgr_gift_conv_${me.uid}`, 20, 60_000))) return fail("Слишком часто", 429);
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    try {
      const back = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const g = snap.data() as MessengerGift | undefined;
        if (!g || g.to !== me.uid) throw new Error("not-found");
        if (g.nft) throw new Error("nft"); // NFT-подарки не обмениваются на монеты
        if (g.byAdmin) throw new Error("admin-gift"); // бесплатный подарок от администрации — не источник 🪙
        const stars = Math.floor(g.price * GIFT_CONVERT_RATE);
        tx.delete(ref);
        tx.set(db.collection("users").doc(me.uid), { miliWallet: FieldValue.increment(stars) }, { merge: true });
        tx.set(db.collection("miliWalletLog").doc(), { uid: me.uid, delta: stars, type: "gift_convert", ref: id, at: Date.now() });
        return stars;
      });
      return NextResponse.json({ ok: true, stars: back });
    } catch (e: any) {
      if (e?.message === "not-found") return fail("Подарок не найден", 404);
      if (e?.message === "nft") return fail("NFT-подарок нельзя обменять на монеты");
      if (e?.message === "admin-gift") return fail("Подарок от администрации нельзя обменять на 🪙");
      console.error("gift convert error:", e);
      return fail("Не удалось обменять подарок", 500);
    }
  }

  if (b.action === "pin") {
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const g = snap.data() as MessengerGift | undefined;
        if (!g || g.to !== me.uid) throw new Error("not-found");
        if (b.pinned === true) {
          if (g.hidden) throw new Error("hidden");
          if (!g.pinned) {
            const pinned = await tx.get(db.collection("messengerGifts").where("to", "==", me.uid).where("pinned", "==", true));
            if (pinned.size >= GIFT_PIN_MAX) throw new Error("limit");
          }
          tx.update(ref, { pinned: true, pinnedAt: Date.now() });
        } else {
          tx.update(ref, { pinned: false, pinnedAt: FieldValue.delete() });
        }
      });
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      if (e?.message === "not-found") return fail("Подарок не найден", 404);
      if (e?.message === "hidden") return fail("Сначала покажи подарок в профиле");
      if (e?.message === "limit") return fail(`Можно закрепить не больше ${GIFT_PIN_MAX} подарков`);
      console.error("gift pin error:", e);
      return fail("Не удалось закрепить подарок", 500);
    }
  }

  if (b.action === "list") {
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    const g = (await ref.get()).data() as MessengerGift | undefined;
    if (!g || g.to !== me.uid) return fail("Подарок не найден", 404);
    if (b.price === null || b.price === undefined) {
      await ref.update({ salePrice: FieldValue.delete() });
      return NextResponse.json({ ok: true });
    }
    if (g.byAdmin) return fail("Подарок от администрации нельзя продать");
    const price = Math.floor(Number(b.price));
    if (!Number.isFinite(price) || price < GIFT_SALE_MIN || price > GIFT_SALE_MAX) return fail(`Цена от ${GIFT_SALE_MIN} до ${GIFT_SALE_MAX} 🪙`);
    await ref.update({ salePrice: price });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "buy") {
    if (!(await rateLimit(`msgr_gift_buy_${me.uid}`, 10, 60_000))) return fail("Слишком часто", 429);
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    let sellerUid = "";
    try {
      const paid = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const g = snap.data() as MessengerGift | undefined;
        if (!g || !g.salePrice) throw new Error("not-for-sale");
        if (g.to === me.uid) throw new Error("own");
        sellerUid = g.to;
        const buyerRef = db.collection("users").doc(me.uid);
        const buyer = await tx.get(buyerRef);
        const have = (buyer.data()?.miliWallet as number | undefined) ?? 0;
        if (have < g.salePrice) throw new Error("not-enough");
        const payout = Math.floor(g.salePrice * (1 - GIFT_SALE_FEE));
        const now = Date.now();
        tx.set(buyerRef, { miliWallet: FieldValue.increment(-g.salePrice) }, { merge: true });
        tx.set(db.collection("users").doc(g.to), { miliWallet: FieldValue.increment(payout) }, { merge: true });
        tx.set(db.collection("miliWalletLog").doc(), { uid: me.uid, delta: -g.salePrice, type: "gift_buy", ref: id, at: now });
        tx.set(db.collection("miliWalletLog").doc(), { uid: g.to, delta: payout, type: "gift_sale", ref: id, at: now });
        // новый владелец: подарок снова виден, не закреплён и не продаётся; byAdmin снимается (теперь он «купленный»)
        tx.update(ref, { to: me.uid, hidden: false, pinned: false, pinnedAt: FieldValue.delete(), salePrice: FieldValue.delete(), byAdmin: FieldValue.delete(), soldAt: now });
        return g.salePrice;
      });
      // если подарок стоял статусом у продавца — снимаем (best-effort)
      try {
        const sAcc = db.collection("messengerAccounts").doc(sellerUid);
        const st = (await sAcc.get()).data()?.status;
        if (st?.kind === "nft" && st.giftDocId === id) await sAcc.update({ status: null });
      } catch {}
      return NextResponse.json({ ok: true, paid });
    } catch (e: any) {
      if (e?.message === "not-for-sale") return fail("Подарок уже не продаётся", 409);
      if (e?.message === "own") return fail("Это твой подарок");
      if (e?.message === "not-enough") return NextResponse.json({ error: "Не хватает 🪙 на балансе", needTopup: true }, { status: 402 });
      console.error("gift buy error:", e);
      return fail("Не удалось купить подарок", 500);
    }
  }

  if (b.action === "transfer") {
    // Подарить свой подарок другому человеку (бесплатно, как в Telegram): владелец меняется, подпись можно задать новую.
    if (!(await rateLimit(`msgr_gift_tr_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подожди немного", 429);
    const id = typeof b.id === "string" && b.id && !b.id.includes("/") ? b.id : "";
    const toUid = typeof b.toUid === "string" && b.toUid && !b.toUid.includes("/") ? b.toUid : "";
    if (!id) return fail("id обязателен");
    if (!toUid || toUid === SERVICE_UID) return fail("Выбери получателя");
    if (toUid === me.uid) return fail("Нельзя подарить подарок самому себе");
    const message = typeof b.message === "string" ? b.message.trim().slice(0, GIFT_MESSAGE_MAX) : "";
    const target = (await db.collection("messengerAccounts").doc(toUid).get()).data() as MessengerAccount | undefined;
    if (!target || target.banned) return fail("Пользователь недоступен", 404);
    const chatId = dmChatId(me.uid, toUid);
    const chatRef = db.collection("messengerChats").doc(chatId);
    const chatSnap = await chatRef.get();
    let chat = chatSnap.exists ? ({ id: chatSnap.id, ...chatSnap.data() } as MessengerChat) : null;
    if (chat && (await isDmBlocked(chat, me.uid))) return fail("Нельзя отправить подарок этому пользователю", 403);
    if (!chat) {
      const other = await db.collection("messengerBlocks").doc(toUid).collection("blocked").doc(me.uid).get();
      if (other.exists) return fail("Нельзя отправить подарок этому пользователю", 403);
    }
    const ref = db.collection("messengerGifts").doc(id);
    let g0: MessengerGift | undefined;
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const g = snap.data() as MessengerGift | undefined;
        if (!g || g.to !== me.uid) throw new Error("not-found");
        g0 = g;
        tx.update(ref, { to: toUid, from: me.uid, anonymous: false, hidden: false, pinned: false, pinnedAt: FieldValue.delete(), salePrice: FieldValue.delete(), message: message || FieldValue.delete(), transferredAt: Date.now() });
      });
    } catch (e: any) {
      if (e?.message === "not-found") return fail("Подарок не найден", 404);
      console.error("gift transfer error:", e);
      return fail("Не удалось подарить", 500);
    }
    // если подарок стоял моим статусом — снимаем (best-effort)
    try {
      const myAcc = db.collection("messengerAccounts").doc(me.uid);
      const st = (await myAcc.get()).data()?.status;
      if (st?.kind === "nft" && st.giftDocId === id) await myAcc.update({ status: null });
    } catch {}
    // карточка в личном чате; сбой не отменяет передачу
    try {
      const now = Date.now();
      if (!chat && target.privacy?.whoCanMessage !== "nobody") {
        await chatRef.set({ type: "dm", members: Array.from(new Set([me.uid, toUid])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] });
        chat = { id: chatId, type: "dm", members: Array.from(new Set([me.uid, toUid])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] };
      }
      if (chat && g0) await postMessage({ chat, sender: me, kind: "gift", text: message || undefined, extra: { gift: { giftId: g0.giftId, giftDocId: id, price: g0.price, to: toUid, ...(g0.nft ? { nft: g0.nft } : {}) } } });
    } catch (err) {
      console.error("gift transfer chat message error:", err);
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action === "upgrade") {
    // «Улучшить до NFT»: обычный подарок за 🪙 становится коллекционным — номер, модель, символ и фон выпадают случайно.
    if (!(await rateLimit(`msgr_gift_up_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подожди немного", 429);
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    const userRef = db.collection("users").doc(me.uid);
    try {
      const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const g = snap.data() as MessengerGift | undefined;
        if (!g || g.to !== me.uid) throw new Error("not-found");
        const def = giftById(g.giftId);
        if (!def || g.nft || !canUpgradeGift(def)) throw new Error("not-upgradable");
        const cost = giftUpgradePrice(def);
        const upRef = db.collection("messengerGiftUpgrades").doc(g.giftId);
        const [user, up] = await Promise.all([tx.get(userRef), tx.get(upRef)]);
        const have = (user.data()?.miliWallet as number | undefined) ?? 0;
        if (have < cost) throw new Error("not-enough");
        const number = ((up.data()?.count as number | undefined) ?? 0) + 1;
        const now = Date.now();
        const rolled = rollNft(number, 0, () => randomInt(0, 1_000_000) / 1_000_000, false);
        const nft: GiftNft = { ...rolled, supply: 0, upgraded: true, upPrice: cost, upAt: now };
        tx.set(upRef, { count: number }, { merge: true });
        tx.set(userRef, { miliWallet: FieldValue.increment(-cost) }, { merge: true });
        tx.set(db.collection("miliWalletLog").doc(), { uid: me.uid, delta: -cost, type: "gift_upgrade", ref: id, at: now });
        tx.update(ref, { nft, salePrice: FieldValue.delete() });
        return { nft, wallet: have - cost, issued: number };
      });
      return NextResponse.json({ ok: true, ...out });
    } catch (e: any) {
      if (e?.message === "not-found") return fail("Подарок не найден", 404);
      if (e?.message === "not-upgradable") return fail("Этот подарок нельзя улучшить");
      if (e?.message === "not-enough") return NextResponse.json({ error: "Не хватает 🪙 на улучшение — пополни кошелёк", needTopup: true }, { status: 402 });
      console.error("gift upgrade error:", e);
      return fail("Не удалось улучшить подарок", 500);
    }
  }

  if (b.action !== "send") return fail("action: send | toggle | convert | pin | list | buy | transfer | upgrade");

  if (!(await rateLimit(`msgr_gift_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подожди немного", 429);
  const gift = giftById(String(b.giftId ?? ""));
  if (!gift) return fail("Такого подарка нет", 404);
  const toUid = typeof b.toUid === "string" && b.toUid && !b.toUid.includes("/") ? b.toUid : "";
  if (!toUid || toUid === SERVICE_UID) return fail("Выбери получателя");
  const message = typeof b.message === "string" ? b.message.trim().slice(0, GIFT_MESSAGE_MAX) : "";
  const anonymous = b.anonymous === true;

  const targetSnap = await db.collection("messengerAccounts").doc(toUid).get();
  const target = targetSnap.data() as MessengerAccount | undefined;
  if (!target || target.banned) return fail("Пользователь недоступен", 404);

  // чат (если уже есть) — проверяем блокировки и потом кладём туда карточку подарка
  const chatId = dmChatId(me.uid, toUid);
  const chatRef = db.collection("messengerChats").doc(chatId);
  const chatSnap = await chatRef.get();
  let chat = chatSnap.exists ? ({ id: chatSnap.id, ...chatSnap.data() } as MessengerChat) : null;
  if (chat && (await isDmBlocked(chat, me.uid))) return fail("Нельзя отправить подарок этому пользователю", 403);
  if (!chat) {
    const other = await db.collection("messengerBlocks").doc(toUid).collection("blocked").doc(me.uid).get();
    if (other.exists) return fail("Нельзя отправить подарок этому пользователю", 403);
  }

  const userRef = db.collection("users").doc(me.uid);
  const stockRef = db.collection("messengerGiftStock").doc(gift.id);
  const giftRef = db.collection("messengerGifts").doc();
  const now = Date.now();
  let wallet = 0;
  let minted = undefined as GiftNft | undefined;
  try {
    wallet = await db.runTransaction(async (tx) => {
      const [user, stock] = await Promise.all([tx.get(userRef), gift.limited ? tx.get(stockRef) : Promise.resolve(null)]);
      const have = (user.data()?.miliWallet as number | undefined) ?? 0;
      if (have < gift.price) throw new Error("not-enough");
      if (gift.limited) {
        const sold = (stock?.data()?.sold as number | undefined) ?? 0;
        if (sold >= gift.limited) throw new Error("sold-out");
        tx.set(stockRef, { sold: sold + 1 }, { merge: true });
        // NFT: номер = порядковый в тираже, признаки выпадают случайно (криптослучайность)
        if (gift.nft) minted = rollNft(sold + 1, gift.limited, () => randomInt(0, 1_000_000) / 1_000_000, gift.category === "halloween");
      }
      tx.set(userRef, { miliWallet: FieldValue.increment(-gift.price) }, { merge: true });
      tx.set(db.collection("miliWalletLog").doc(), { uid: me.uid, delta: -gift.price, type: "purchase", ref: `gift_${gift.id}`, at: now });
      tx.set(giftRef, { giftId: gift.id, from: me.uid, to: toUid, price: gift.price, at: now, hidden: false, anonymous, ...(minted ? { nft: minted } : {}), ...(message ? { message } : {}) } satisfies Omit<MessengerGift, "id">);
      return have - gift.price;
    });
  } catch (e: any) {
    if (e?.message === "not-enough") return NextResponse.json({ error: `Нужно ${gift.price} 🪙 на балансе — пополни кошелёк на странице «Пополнение 🪙»`, needTopup: true }, { status: 402 });
    if (e?.message === "sold-out") return fail("Этот подарок раскуплен", 409);
    console.error("gift send error:", e);
    return fail("Не удалось отправить подарок", 500);
  }

  // карточка в личном чате (если получатель принимает сообщения или чат уже есть); сбой не отменяет покупку
  try {
    if (!chat && target.privacy?.whoCanMessage !== "nobody") {
      await chatRef.set({ type: "dm", members: Array.from(new Set([me.uid, toUid])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] });
      chat = { id: chatId, type: "dm", members: Array.from(new Set([me.uid, toUid])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] };
    }
    if (chat) await postMessage({ chat, sender: me, kind: "gift", text: message || undefined, extra: { gift: { giftId: gift.id, giftDocId: giftRef.id, price: gift.price, to: toUid, ...(anonymous ? { anonymous: true } : {}), ...(minted ? { nft: minted } : {}) } } });
  } catch (err) {
    console.error("gift chat message error:", err);
  }
  return NextResponse.json({ ok: true, id: giftRef.id, wallet, ...(minted ? { nft: minted } : {}) });
}

