import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { dmChatId, fail, isDmBlocked, postMessage, requireMessenger, SERVICE_UID } from "@/lib/messenger/server";
import { randomInt } from "crypto";
import { rollNft } from "@/lib/messenger/nft";
import type { GiftNft } from "@/lib/messenger/gifts";
import { GIFT_CONVERT_RATE, GIFT_MARKET_FEE, GIFT_MARKET_MAX, GIFT_MARKET_MIN, GIFT_MESSAGE_MAX, GIFT_PIN_MAX, giftById, upgradeTargetOf, type GiftView, type MarketItem, type MessengerGift } from "@/lib/messenger/gifts";
import type { MessengerAccount, MessengerChat } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET                → { wallet, stock: { [giftId]: sold } }  — баланс ⭐ и сколько ограниченных подарков уже раскуплено
 * GET ?uid=<uid|me>  → { gifts: GiftView[], total, stars }    — подарки в профиле (скрытые видит только владелец)
 */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const uidParam = req.nextUrl.searchParams.get("uid");

  if (req.nextUrl.searchParams.get("market")) {
    const snap = await db.collection("messengerGifts").where("listPrice", ">", 0).orderBy("listPrice").limit(80).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerGift).filter((g) => g.nft);
    const owners = Array.from(new Set(rows.map((g) => g.to)));
    const accs = owners.length ? await db.getAll(...owners.map((u) => db.collection("messengerAccounts").doc(u))) : [];
    const byUid: Record<string, MessengerAccount | undefined> = {};
    accs.forEach((a, i) => (byUid[owners[i]] = a.data() as MessengerAccount | undefined));
    const items: MarketItem[] = rows.map((g) => {
      const s = byUid[g.to];
      return { id: g.id, giftId: g.giftId, price: g.listPrice ?? 0, nft: g.nft!, mine: g.to === me.uid, at: g.at, seller: s ? { uid: g.to, displayName: s.displayName, photoURL: s.photoURL ?? null } : null };
    });
    return NextResponse.json({ items });
  }

  if (!uidParam) {
    const [user, stockSnap] = await Promise.all([db.collection("users").doc(me.uid).get(), db.collection("messengerGiftStock").get()]);
    const stock: Record<string, number> = {};
    stockSnap.forEach((d) => (stock[d.id] = (d.data().sold as number | undefined) ?? 0));
    return NextResponse.json({ wallet: (user.data()?.starsWallet as number | undefined) ?? 0, stock, me: { uid: me.uid, displayName: me.account.displayName } });
  }

  const target = uidParam === "me" ? me.uid : uidParam;
  if (!target || target.includes("/")) return fail("uid некорректен");
  const owner = target === me.uid;
  const snap = await db.collection("messengerGifts").where("to", "==", target).limit(300).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerGift).filter((g) => owner || !g.hidden).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at - a.at);

  const senderIds = Array.from(new Set(rows.filter((g) => !g.anonymous || owner).map((g) => g.from)));
  const accs = senderIds.length ? await db.getAll(...senderIds.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  const byUid: Record<string, MessengerAccount | undefined> = {};
  accs.forEach((a, i) => (byUid[senderIds[i]] = a.data() as MessengerAccount | undefined));

  const gifts: GiftView[] = rows.map((g) => {
    // анонимного отправителя видит только получатель (и сам отправитель)
    const showSender = !g.anonymous || owner || g.from === me.uid;
    const s = showSender ? byUid[g.from] ?? (g.from === me.uid ? me.account : undefined) : undefined;
    return {
      id: g.id, giftId: g.giftId, price: g.price, message: g.message, at: g.at, hidden: !!g.hidden, anonymous: !!g.anonymous, pinned: !!g.pinned, ...(g.listPrice ? { listPrice: g.listPrice } : {}), ...(g.upgradedFrom ? { upgradedFrom: g.upgradedFrom } : {}),
      from: s ? { uid: g.from, displayName: s.displayName, photoURL: s.photoURL ?? null } : null,
      ...(g.nft ? { nft: g.nft } : {}),
    };
  });
  return NextResponse.json({ gifts, total: gifts.length, stars: gifts.reduce((n, g) => n + g.price, 0) });
}

/**
 * POST { action: "send", toUid, giftId, message?, anonymous? } — купить подарок за ⭐ кошелька и отправить.
 * POST { action: "toggle", id, hidden } — показать/скрыть свой подарок в профиле.
 * POST { action: "convert", id }        — обменять полученный подарок на ⭐ (GIFT_CONVERT_RATE от цены).
 * POST { action: "pin", id, pinned }     — закрепить/открепить подарок вверху профиля (до GIFT_PIN_MAX).
 * POST { action: "upgrade", id }         — улучшить обычный подарок до NFT (платно, из тиража NFT-версии).
 * GET ?market=1     → { items: MarketItem[] }                — NFT, выставленные на продажу за ⭐
 * POST { action: "list", id, price }  — выставить свой NFT на маркет
 * POST { action: "unlist", id }       — снять с продажи
 * POST { action: "buy", id }          — купить NFT с маркета (комиссия GIFT_MARKET_FEE идёт в никуда)
 * POST { action: "transfer", id, toUid } — передать свой NFT другому человеку.
 * send с toUid = свой uid — купить себе.
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
    await ref.update({ hidden: b.hidden === true, ...(b.hidden === true ? { pinned: false } : {}) });
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
        if (g.nft) throw new Error("nft"); // NFT-подарки не обмениваются на звёзды
        if (g.byAdmin) throw new Error("admin-gift"); // бесплатный подарок от администрации — не источник ⭐
        const stars = Math.floor(g.price * GIFT_CONVERT_RATE);
        tx.delete(ref);
        tx.set(db.collection("users").doc(me.uid), { starsWallet: FieldValue.increment(stars) }, { merge: true });
        tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: stars, type: "gift_convert", ref: id, at: Date.now() });
        return stars;
      });
      return NextResponse.json({ ok: true, stars: back });
    } catch (e: any) {
      if (e?.message === "not-found") return fail("Подарок не найден", 404);
      if (e?.message === "nft") return fail("NFT-подарок нельзя обменять на звёзды");
      if (e?.message === "admin-gift") return fail("Подарок от администрации нельзя обменять на ⭐");
      console.error("gift convert error:", e);
      return fail("Не удалось обменять подарок", 500);
    }
  }

  if (b.action === "pin") {
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    const g = (await ref.get()).data() as MessengerGift | undefined;
    if (!g || g.to !== me.uid) return fail("Подарок не найден", 404);
    const pin = b.pinned === true;
    if (pin && !g.pinned) {
      if (g.hidden) return fail("Скрытый подарок нельзя закрепить — сначала покажи его в профиле");
      const cur = await db.collection("messengerGifts").where("to", "==", me.uid).where("pinned", "==", true).limit(GIFT_PIN_MAX + 1).get();
      if (cur.size >= GIFT_PIN_MAX) return fail(`Можно закрепить до ${GIFT_PIN_MAX} подарков`);
    }
    await ref.update({ pinned: pin });
    return NextResponse.json({ ok: true });
  }

  // «Улучшить до NFT»: обычный подарок становится уникальным из тиража NFT-версии (за ⭐ кошелька)
  if (b.action === "upgrade") {
    if (!(await rateLimit(`msgr_gift_upg_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подожди немного", 429);
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    const userRef = db.collection("users").doc(me.uid);
    try {
      const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const g = snap.data() as MessengerGift | undefined;
        if (!g || g.to !== me.uid) throw new Error("not-found");
        if (g.nft) throw new Error("already");
        const target = upgradeTargetOf(g.giftId);
        if (!target || !target.limited) throw new Error("no-upgrade");
        const stockRef = db.collection("messengerGiftStock").doc(target.id);
        const [user, stock] = await Promise.all([tx.get(userRef), tx.get(stockRef)]);
        const fee = target.price;
        const have = (user.data()?.starsWallet as number | undefined) ?? 0;
        if (have < fee) throw new Error(`not-enough:${fee}`);
        const sold = (stock.data()?.sold as number | undefined) ?? 0;
        if (sold >= target.limited) throw new Error("sold-out");
        const nft = rollNft(sold + 1, target.limited, () => randomInt(0, 1_000_000) / 1_000_000);
        const now = Date.now();
        tx.set(stockRef, { sold: sold + 1 }, { merge: true });
        tx.set(userRef, { starsWallet: FieldValue.increment(-fee) }, { merge: true });
        tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: -fee, type: "purchase", ref: `gift_upgrade_${target.id}`, at: now });
        tx.update(ref, { giftId: target.id, nft, price: g.price + fee, upgradedFrom: g.giftId });
        return { giftId: target.id, nft, wallet: have - fee };
      });
      return NextResponse.json({ ok: true, ...out });
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (m === "not-found") return fail("Подарок не найден", 404);
      if (m === "already") return fail("Это уже NFT");
      if (m === "no-upgrade") return fail("Этот подарок нельзя улучшить до NFT");
      if (m === "sold-out") return fail("Тираж этого NFT уже раскуплен", 409);
      if (m.startsWith("not-enough")) return NextResponse.json({ error: `Для улучшения нужно ${m.split(":")[1]} ⭐ — пополни кошелёк на странице «Пополнение ⭐»`, needTopup: true }, { status: 402 });
      console.error("gift upgrade error:", e);
      return fail("Не удалось улучшить подарок", 500);
    }
  }

  // Передать свой NFT другому человеку (как «Передать» в Telegram). Бесплатно; из профиля и статуса NFT пропадает.
  if (b.action === "transfer") {
    if (!(await rateLimit(`msgr_gift_tr_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подожди немного", 429);
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    const toUid = typeof b.toUid === "string" && b.toUid && !b.toUid.includes("/") ? b.toUid : "";
    if (!id) return fail("id обязателен");
    if (!toUid || toUid === SERVICE_UID || toUid === me.uid) return fail("Выбери другого получателя");
    const targetSnap = await db.collection("messengerAccounts").doc(toUid).get();
    const target = targetSnap.data() as MessengerAccount | undefined;
    if (!target || target.banned) return fail("Пользователь недоступен", 404);
    const blocked = await db.collection("messengerBlocks").doc(toUid).collection("blocked").doc(me.uid).get();
    if (blocked.exists) return fail("Нельзя передать подарок этому пользователю", 403);

    const ref = db.collection("messengerGifts").doc(id);
    let moved: MessengerGift | undefined;
    try {
      await db.runTransaction(async (tx) => {
        const g = (await tx.get(ref)).data() as MessengerGift | undefined;
        if (!g || g.to !== me.uid) throw new Error("not-found");
        if (!g.nft) throw new Error("not-nft");
        moved = g;
        tx.update(ref, { to: toUid, from: me.uid, anonymous: false, hidden: false, pinned: false, transferredAt: Date.now(), listPrice: FieldValue.delete(), message: FieldValue.delete() });
      });
    } catch (e: any) {
      if (e?.message === "not-found") return fail("Подарок не найден", 404);
      if (e?.message === "not-nft") return fail("Передавать можно только NFT");
      console.error("gift transfer error:", e);
      return fail("Не удалось передать подарок", 500);
    }
    // если этот NFT стоял у меня статусом — убираем
    const st = me.account.status;
    if (st && st.kind === "nft" && st.giftDocId === id) await db.collection("messengerAccounts").doc(me.uid).update({ status: null }).catch(() => {});

    // карточка в личном чате, если он уже есть или получатель принимает сообщения; сбой не отменяет передачу
    try {
      const chatId = dmChatId(me.uid, toUid);
      const chatRef = db.collection("messengerChats").doc(chatId);
      const snap = await chatRef.get();
      const now = Date.now();
      let chat = snap.exists ? ({ id: snap.id, ...snap.data() } as MessengerChat) : null;
      if (!chat && target.privacy?.whoCanMessage !== "nobody") {
        const members = [me.uid, toUid];
        await chatRef.set({ type: "dm", members, admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] });
        chat = { id: chatId, type: "dm", members, admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] };
      }
      if (chat && moved) await postMessage({ chat, sender: me, kind: "gift", extra: { gift: { giftId: moved.giftId, giftDocId: id, price: moved.price, to: toUid, ...(moved.nft ? { nft: moved.nft } : {}) } } });
    } catch (err) {
      console.error("gift transfer chat message error:", err);
    }
    return NextResponse.json({ ok: true });
  }

  // Выставить свой NFT на маркет за ⭐ (не больше GIFT_MARKET_MAX). Выданные администрацией NFT продавать нельзя.
  if (b.action === "list") {
    if (!(await rateLimit(`msgr_gift_list_${me.uid}`, 20, 60_000))) return fail("Слишком часто, подожди немного", 429);
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    const price = Math.floor(Number(b.price));
    if (!id) return fail("id обязателен");
    if (!Number.isFinite(price) || price < GIFT_MARKET_MIN || price > GIFT_MARKET_MAX) return fail(`Цена от ${GIFT_MARKET_MIN} до ${GIFT_MARKET_MAX} ⭐`);
    const ref = db.collection("messengerGifts").doc(id);
    try {
      await db.runTransaction(async (tx) => {
        const g = (await tx.get(ref)).data() as MessengerGift | undefined;
        if (!g || g.to !== me.uid) throw new Error("not-found");
        if (!g.nft) throw new Error("not-nft");
        if (g.byAdmin) throw new Error("admin-gift");
        tx.update(ref, { listPrice: price, pinned: false });
      });
    } catch (e: any) {
      if (e?.message === "not-found") return fail("Подарок не найден", 404);
      if (e?.message === "not-nft") return fail("Продавать можно только NFT");
      if (e?.message === "admin-gift") return fail("NFT от администрации нельзя продать");
      console.error("gift list error:", e);
      return fail("Не удалось выставить на продажу", 500);
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action === "unlist") {
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    const g = (await ref.get()).data() as MessengerGift | undefined;
    if (!g || g.to !== me.uid) return fail("Подарок не найден", 404);
    await ref.update({ listPrice: FieldValue.delete() });
    return NextResponse.json({ ok: true });
  }

  // Купить NFT с маркета: ⭐ покупателя → продавцу (минус комиссия), NFT переходит новому владельцу.
  if (b.action === "buy") {
    if (!(await rateLimit(`msgr_gift_buy_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подожди немного", 429);
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    const buyerRef = db.collection("users").doc(me.uid);
    const now = Date.now();
    let sellerUid = "";
    let paid = 0;
    let wallet = 0;
    try {
      wallet = await db.runTransaction(async (tx) => {
        const [gs, buyer] = await Promise.all([tx.get(ref), tx.get(buyerRef)]);
        const g = gs.data() as MessengerGift | undefined;
        if (!g || !g.nft || !g.listPrice || g.listPrice < 1) throw new Error("gone");
        if (g.to === me.uid) throw new Error("own");
        const have = (buyer.data()?.starsWallet as number | undefined) ?? 0;
        if (have < g.listPrice) throw new Error("not-enough");
        sellerUid = g.to;
        paid = g.listPrice;
        const payout = paid - Math.floor(paid * GIFT_MARKET_FEE);
        tx.update(ref, { to: me.uid, from: sellerUid, anonymous: false, hidden: false, pinned: false, transferredAt: now, soldFor: paid, listPrice: FieldValue.delete(), message: FieldValue.delete() });
        tx.set(buyerRef, { starsWallet: FieldValue.increment(-paid) }, { merge: true });
        tx.set(db.collection("users").doc(sellerUid), { starsWallet: FieldValue.increment(payout) }, { merge: true });
        tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: -paid, type: "nft_buy", ref: id, at: now });
        tx.set(db.collection("starsWalletLog").doc(), { uid: sellerUid, delta: payout, type: "nft_sell", ref: id, at: now });
        return have - paid;
      });
    } catch (e: any) {
      if (e?.message === "gone") return fail("Этот NFT уже купили или сняли с продажи", 409);
      if (e?.message === "own") return fail("Это твой собственный NFT");
      if (e?.message === "not-enough") return NextResponse.json({ error: "Не хватает ⭐ на балансе — пополни кошелёк на странице «Пополнение ⭐»", needTopup: true }, { status: 402 });
      console.error("gift buy error:", e);
      return fail("Не удалось купить NFT", 500);
    }
    // если NFT стоял у продавца статусом — убираем
    try {
      const sref = db.collection("messengerAccounts").doc(sellerUid);
      const st = ((await sref.get()).data() as MessengerAccount | undefined)?.status;
      if (st && st.kind === "nft" && st.giftDocId === id) await sref.update({ status: null });
    } catch {}
    return NextResponse.json({ ok: true, wallet, paid });
  }

  if (b.action !== "send") return fail("action: send | toggle | convert | pin | upgrade | transfer | list | unlist | buy");

  if (!(await rateLimit(`msgr_gift_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подожди немного", 429);
  const gift = giftById(String(b.giftId ?? ""));
  if (!gift) return fail("Такого подарка нет", 404);
  const toUid = typeof b.toUid === "string" && b.toUid && !b.toUid.includes("/") ? b.toUid : "";
  if (!toUid || toUid === SERVICE_UID) return fail("Выбери получателя");
  const message = typeof b.message === "string" ? b.message.trim().slice(0, GIFT_MESSAGE_MAX) : "";
  const anonymous = b.anonymous === true;
  const self = toUid === me.uid; // купить NFT/подарок себе — без карточки в чате и проверок блокировки

  const targetSnap = await db.collection("messengerAccounts").doc(toUid).get();
  const target = targetSnap.data() as MessengerAccount | undefined;
  if (!target || target.banned) return fail("Пользователь недоступен", 404);

  // чат (если уже есть) — проверяем блокировки и потом кладём туда карточку подарка
  const chatId = dmChatId(me.uid, toUid);
  const chatRef = db.collection("messengerChats").doc(chatId);
  const chatSnap = await chatRef.get();
  let chat = chatSnap.exists ? ({ id: chatSnap.id, ...chatSnap.data() } as MessengerChat) : null;
  if (!self && chat && (await isDmBlocked(chat, me.uid))) return fail("Нельзя отправить подарок этому пользователю", 403);
  if (!chat && !self) {
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
      const have = (user.data()?.starsWallet as number | undefined) ?? 0;
      if (have < gift.price) throw new Error("not-enough");
      if (gift.limited) {
        const sold = (stock?.data()?.sold as number | undefined) ?? 0;
        if (sold >= gift.limited) throw new Error("sold-out");
        tx.set(stockRef, { sold: sold + 1 }, { merge: true });
        // NFT: номер = порядковый в тираже, признаки выпадают случайно (криптослучайность)
        if (gift.nft) minted = rollNft(sold + 1, gift.limited, () => randomInt(0, 1_000_000) / 1_000_000);
      }
      tx.set(userRef, { starsWallet: FieldValue.increment(-gift.price) }, { merge: true });
      tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: -gift.price, type: "purchase", ref: `gift_${gift.id}`, at: now });
      tx.set(giftRef, { giftId: gift.id, from: me.uid, to: toUid, price: gift.price, at: now, hidden: false, anonymous, ...(minted ? { nft: minted } : {}), ...(message ? { message } : {}) } satisfies Omit<MessengerGift, "id">);
      return have - gift.price;
    });
  } catch (e: any) {
    if (e?.message === "not-enough") return NextResponse.json({ error: `Нужно ${gift.price} ⭐ на балансе — пополни кошелёк на странице «Пополнение ⭐»`, needTopup: true }, { status: 402 });
    if (e?.message === "sold-out") return fail("Этот подарок раскуплен", 409);
    console.error("gift send error:", e);
    return fail("Не удалось отправить подарок", 500);
  }

  // карточка в личном чате (если получатель принимает сообщения или чат уже есть); сбой не отменяет покупку
  try {
    if (!self && !chat && target.privacy?.whoCanMessage !== "nobody") {
      await chatRef.set({ type: "dm", members: Array.from(new Set([me.uid, toUid])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] });
      chat = { id: chatId, type: "dm", members: Array.from(new Set([me.uid, toUid])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] };
    }
    if (!self && chat) await postMessage({ chat, sender: me, kind: "gift", text: message || undefined, extra: { gift: { giftId: gift.id, giftDocId: giftRef.id, price: gift.price, to: toUid, ...(anonymous ? { anonymous: true } : {}), ...(minted ? { nft: minted } : {}) } } });
  } catch (err) {
    console.error("gift chat message error:", err);
  }
  return NextResponse.json({ ok: true, id: giftRef.id, wallet, ...(minted ? { nft: minted } : {}) });
}

