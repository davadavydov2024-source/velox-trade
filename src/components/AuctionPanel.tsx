"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gavel, Trophy, Clock } from "lucide-react";
import { Product, AuctionBid } from "@/types";
import { subscribeAuctionProduct, subscribeAuctionBids, placeBid, endAuction, cancelAuction } from "@/lib/auctions";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getPublicProfileCached } from "@/lib/sellerCache";

export function AuctionPanel({ initialProduct }: { initialProduct: Product }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [product, setProduct] = useState<Product>(initialProduct);
  const [bids, setBids] = useState<AuctionBid[]>([]);
  const [bidInput, setBidInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [usernames, setUsernames] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const unsubProduct = subscribeAuctionProduct(initialProduct.id, (p) => p && setProduct(p));
    const unsubBids = subscribeAuctionBids(initialProduct.id, setBids);
    return () => {
      unsubProduct();
      unsubBids();
    };
  }, [initialProduct.id]);

  // Подтягиваем username для каждого нового участника торгов, чтобы ник в истории ставок и у
  // лидера можно было кликнуть и посмотреть профиль — getPublicProfileCached сам кэширует,
  // так что при повторных ставках того же человека повторного запроса не будет.
  useEffect(() => {
    const ids = new Set<string>(bids.map((b) => b.bidderId));
    if (product.auctionHighestBidderId) ids.add(product.auctionHighestBidderId);
    const missing = [...ids].filter((id) => !(id in usernames));
    if (missing.length === 0) return;
    missing.forEach((uid) => {
      getPublicProfileCached(uid).then((p) => {
        setUsernames((prev) => ({ ...prev, [uid]: p?.username ?? null }));
      });
    });
  }, [bids, product.auctionHighestBidderId, usernames]);

  const isSeller = user?.uid === product.sellerId;
  const isActive = product.auctionStatus === "active";
  const currentPrice = product.auctionCurrentPrice ?? product.auctionStartPrice ?? 0;
  const minStep = product.auctionMinStep ?? 1;
  const minNextBid = product.auctionBidCount ? currentPrice + minStep : currentPrice;
  const isHighestBidder = user?.uid === product.auctionHighestBidderId;

  async function handleBid(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(bidInput);
    if (!amount || amount < minNextBid) {
      toast("warning", `Минимальная ставка — ${minNextBid} ₽`);
      return;
    }
    setBusy(true);
    try {
      await placeBid(product.id, amount);
      toast("success", `Ставка ${amount} ₽ принята — ты лидируешь в торгах!`);
      setBidInput("");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось сделать ставку");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    setBusy(true);
    try {
      const res = await endAuction(product.id);
      toast("success", res.hasWinner ? "Аукцион завершён — заказ оформлен на победителя." : "Аукцион завершён без ставок.");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось завершить аукцион");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Отменить аукцион? Ставки будут возвращены участникам.")) return;
    setBusy(true);
    try {
      await cancelAuction(product.id);
      toast("success", "Аукцион отменён, ставки возвращены.");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось отменить аукцион");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 space-y-4 border border-accent/30">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-accent">
          <Gavel size={16} /> {isActive ? "Аукцион идёт" : "Аукцион завершён"}
        </span>
        {!isActive && <Clock size={14} className="text-white/30" />}
      </div>

      <div>
        <p className="text-xs text-white/40 mb-1">{product.auctionBidCount ? "Текущая ставка" : "Стартовая цена"}</p>
        <p className="text-3xl font-extrabold text-accent">{currentPrice} ₽</p>
        {product.auctionHighestBidderName && (
          <p className="text-xs text-white/50 mt-1 flex items-center gap-1">
            <Trophy size={12} className="text-accent" />
            Лидирует:{" "}
            {product.auctionHighestBidderId && usernames[product.auctionHighestBidderId] ? (
              <Link href={`/seller/${usernames[product.auctionHighestBidderId]}`} className="hover:text-accent transition-colors">
                {product.auctionHighestBidderName}
              </Link>
            ) : (
              product.auctionHighestBidderName
            )}
            {isHighestBidder && <span className="text-accent ml-1">(это вы)</span>}
          </p>
        )}
        <p className="text-xs text-white/30 mt-0.5">{product.auctionBidCount ?? 0} ставок · шаг от {minStep} ₽</p>
      </div>

      {isActive && !isSeller && user && (
        <form onSubmit={handleBid} className="flex gap-2">
          <input
            type="number"
            min={minNextBid}
            value={bidInput}
            onChange={(e) => setBidInput(e.target.value)}
            placeholder={`От ${minNextBid} ₽`}
            className="input-field py-2.5 flex-1"
            disabled={busy}
          />
          <button type="submit" disabled={busy} className="btn-primary px-5 py-2.5 disabled:opacity-50">
            Ставка
          </button>
        </form>
      )}

      {isActive && !user && <p className="text-xs text-white/40">Войди в аккаунт, чтобы делать ставки.</p>}
      {isActive && isSeller && <p className="text-xs text-white/40">Это твой товар — ставки делают только другие пользователи.</p>}

      {isActive && isSeller && (
        <div className="flex gap-2">
          <button onClick={handleEnd} disabled={busy} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50">
            Завершить и оформить заказ
          </button>
          <button onClick={handleCancel} disabled={busy} className="btn-secondary px-4 py-2.5 text-sm disabled:opacity-50">
            Отменить
          </button>
        </div>
      )}

      {bids.length > 0 && (
        <div className="border-t border-border pt-3 space-y-1.5 max-h-40 overflow-y-auto">
          {bids.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-xs">
              {usernames[b.bidderId] ? (
                <Link
                  href={`/seller/${usernames[b.bidderId]}`}
                  className={`hover:text-accent transition-colors ${b.status === "refunded" ? "text-white/30 line-through" : "text-white/60"}`}
                >
                  {b.bidderName}
                </Link>
              ) : (
                <span className={b.status === "refunded" ? "text-white/30 line-through" : "text-white/60"}>{b.bidderName}</span>
              )}
              <span className={b.status === "won" ? "text-accent font-semibold" : "text-white/40"}>{b.amount} ₽</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
