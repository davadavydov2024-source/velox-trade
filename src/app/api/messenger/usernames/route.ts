import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { FEE_PCT, PRICE_MAX, RENT_DAYS_MAX, UErr, activate, buyResale, buyShop, deactivate, rentName, setListing, settleExpired, validName, type UsernameDoc } from "@/lib/messenger/usernames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const col = () => adminDb().collection("messengerUsernames");
const rows = (docs: QueryDocumentSnapshot[]) => docs.map((d) => d.data() as UsernameDoc);

/** GET ?view=shop|market|rent|mine — списки юзернеймов, баланс и текущий @handle. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  await settleExpired().catch(() => {});
  const view = req.nextUrl.searchParams.get("view") ?? "shop";
  const now = Date.now();
  const wallet = ((await adminDb().collection("users").doc(me.uid).get()).data()?.starsWallet as number | undefined) ?? 0;
  const base = { wallet, handle: me.account.handle, fee: FEE_PCT, rentDaysMax: RENT_DAYS_MAX };
  if (view === "shop") {
    const d = rows((await col().where("shopPrice", ">", 0).limit(200).get()).docs).filter((x) => !x.ownerUid);
    return NextResponse.json({ ...base, items: d.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name)).map((x) => ({ name: x.name, price: x.shopPrice })) });
  }
  if (view === "market") {
    const d = rows((await col().where("salePrice", ">", 0).limit(200).get()).docs).filter((x) => x.ownerUid);
    return NextResponse.json({ ...base, items: d.sort((a, b) => (a.salePrice ?? 0) - (b.salePrice ?? 0)).map((x) => ({ name: x.name, price: x.salePrice, mine: x.ownerUid === me.uid })) });
  }
  if (view === "rent") {
    const d = rows((await col().where("rentPerDay", ">", 0).limit(200).get()).docs).filter((x) => x.ownerUid);
    return NextResponse.json({ ...base, items: d.sort((a, b) => (a.rentPerDay ?? 0) - (b.rentPerDay ?? 0)).map((x) => ({ name: x.name, perDay: x.rentPerDay, mine: x.ownerUid === me.uid, rentedUntil: x.renterUid && (x.rentUntil ?? 0) > now ? x.rentUntil : null, byMe: x.renterUid === me.uid })) });
  }
  const [own, rented] = await Promise.all([col().where("ownerUid", "==", me.uid).get(), col().where("renterUid", "==", me.uid).get()]);
  const seen = new Set<string>();
  const items = [...rows(own.docs), ...rows(rented.docs)].filter((x) => !seen.has(x.name) && !!seen.add(x.name)).map((x) => {
    const rentedOut = !!x.renterUid && (x.rentUntil ?? 0) > now;
    return { name: x.name, role: x.ownerUid === me.uid ? "owner" : "renter", using: x.usedBy === me.uid, salePrice: x.salePrice, rentPerDay: x.rentPerDay, rentedOut, rentUntil: rentedOut ? x.rentUntil : null };
  });
  return NextResponse.json({ ...base, items });
}

/** POST { action, name, price?, days? } — buy | buy-resale | rent | activate | deactivate | list-sale | unlist-sale | list-rent | unlist-rent */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_uname_${me.uid}`, 30, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === "string" ? b.name.toLowerCase().replace(/^@/, "") : "";
  if (!validName(name)) return fail("Некорректный юзернейм");
  const price = Math.floor(Number(b.price));
  const needPrice = () => { if (!(price >= 1 && price <= PRICE_MAX)) throw new UErr(`Цена — целое число от 1 до ${PRICE_MAX} ⭐`); };
  try {
    switch (b.action) {
      case "buy": await buyShop(name, me.uid); break;
      case "buy-resale": await buyResale(name, me.uid); break;
      case "rent": {
        const days = Math.floor(Number(b.days));
        if (!(days >= 1 && days <= RENT_DAYS_MAX)) throw new UErr(`Срок аренды — от 1 до ${RENT_DAYS_MAX} дней`);
        await rentName(name, me.uid, days);
        break;
      }
      case "activate": await activate(name, me.uid); break;
      case "deactivate": await deactivate(name, me.uid); break;
      case "list-sale": needPrice(); await setListing(name, me.uid, { salePrice: price }); break;
      case "unlist-sale": await setListing(name, me.uid, { salePrice: null }); break;
      case "list-rent": needPrice(); await setListing(name, me.uid, { rentPerDay: price }); break;
      case "unlist-rent": await setListing(name, me.uid, { rentPerDay: null }); break;
      default: return fail("Неизвестное действие");
    }
  } catch (e) {
    if (e instanceof UErr) return fail(e.message, e.status);
    console.error("usernames error:", e);
    return fail("Не удалось выполнить операцию", 500);
  }
  return NextResponse.json({ ok: true });
}
