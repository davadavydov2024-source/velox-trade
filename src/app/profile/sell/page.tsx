"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Tag, Check } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createSellRequest } from "@/lib/sellRequests";
import { getGames } from "@/lib/products";
import { getFeatureFlags } from "@/lib/featureFlags";
import { Game, DEFAULT_FEATURE_FLAGS, Rarity, RARITY_LABEL, DeliveryMethod } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { ImageUploadField } from "@/components/ImageUploadField";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export default function SellPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoaded, setGamesLoaded] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(DEFAULT_FEATURE_FLAGS.sellCommissionPercent);
  const [minSellPrice, setMinSellPrice] = useState(DEFAULT_FEATURE_FLAGS.minProductPriceRub);

  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [stock, setStock] = useState("1");
  const [rarity, setRarity] = useState<Rarity>("common");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("seller");
  const [auctionEnabled, setAuctionEnabled] = useState(false);
  const [auctionMinStep, setAuctionMinStep] = useState("10");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getGames()
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setGamesLoaded(true));
    getFeatureFlags().then((f) => {
      setCommissionPercent(f.sellCommissionPercent);
      setMinSellPrice(f.minProductPriceRub);
    });
  }, []);

  const priceNum = Number(price) || 0;
  const discountNum = Math.min(90, Math.max(0, Number(discountPercent) || 0));
  const discountedPrice = discountNum > 0 ? +(priceNum * (1 - discountNum / 100)).toFixed(2) : priceNum;
  // Комиссия и выплата считаются от цены, которую реально платит покупатель (то есть уже со
  // скидкой) — иначе при скидке продавец получал бы больше денег, чем покупатель заплатил.
  const commission = Math.round(discountedPrice * (commissionPercent / 100));
  const payout = discountedPrice - commission;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) {
      toast("warning", "Войдите в аккаунт, чтобы продавать предметы");
      return;
    }
    if (!selectedGame) {
      toast("warning", "Выбери игру");
      return;
    }
    if (!imageUrl) {
      toast("warning", "Загрузи фото предмета");
      return;
    }
    if (!description.trim()) {
      toast("warning", "Опиши предмет — описание обязательно");
      return;
    }
    if (priceNum < minSellPrice) {
      toast("warning", `Минимальная цена — ${minSellPrice} ₽`);
      return;
    }
    const stockNum = Number(stock) || 0;
    if (stockNum < 1) {
      toast("warning", "Укажи количество предметов — минимум 1");
      return;
    }
    if (auctionEnabled && stockNum !== 1) {
      toast("warning", "Аукцион можно провести только для одного конкретного предмета — укажи количество 1");
      return;
    }
    if (auctionEnabled && (Number(auctionMinStep) || 0) < 1) {
      toast("warning", "Укажи минимальный шаг ставки — хотя бы 1 ₽");
      return;
    }

    setSubmitting(true);
    try {
      await createSellRequest({
        userId: user.uid,
        userNick: profile.displayName,
        itemName: itemName.trim(),
        gameId: selectedGame.slug,
        gameName: selectedGame.name,
        imageUrl,
        price: priceNum,
        ...(discountNum > 0 && !auctionEnabled ? { discountPercent: discountNum } : {}),
        commissionPercent,
        description: description.trim(),
        stock: stockNum,
        rarity,
        deliveryMethod,
        ...(auctionEnabled
          ? { auctionEnabled: true, auctionStartPrice: priceNum, auctionMinStep: Number(auctionMinStep) || 10 }
          : {}),
      });

      // Уведомление админу в Telegram не должно блокировать создание заявки, если бот недоступен.
      fetch("/api/admin/notify-sell-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName, game: selectedGame.name, price: priceNum, userNick: profile.displayName }),
      }).catch((err) => console.error("Не удалось уведомить админа:", err));

      toast("success", "Заявка на продажу отправлена. Администратор проверит её и свяжется с тобой.");
      setSelectedGame(null);
      setImageUrl("");
      setItemName("");
      setPrice("");
      setDiscountPercent("");
      setStock("1");
      setRarity("common");
      setDeliveryMethod("seller");
      setAuctionEnabled(false);
      setAuctionMinStep("10");
      setDescription("");
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет доступа к базе данных. Проверь, что правила Firestore опубликованы.");
      } else {
        toast("error", "Не удалось отправить заявку. Попробуй ещё раз.");
      }
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Tag size={20} className="text-accent" /> Продать предметы
      </h1>
      <p className="text-sm text-white/40">
        Заполни форму — заявка сразу уйдёт администратору (в том числе уведомлением в Telegram), он проверит предмет
        и свяжется с тобой для оформления продажи.
      </p>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5 max-w-xl">
        <div>
          <p className="text-sm font-medium mb-2">Игра</p>
          {!gamesLoaded ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-btn bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <p className="text-sm text-white/30">
              Игры ещё не добавлены администратором — обратись в поддержку, чтобы уточнить, куда отнести предмет.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {games.map((game) => {
                const active = selectedGame?.id === game.id;
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => setSelectedGame(game)}
                    className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-btn border transition-all ${
                      active ? "border-accent bg-accent/10" : "border-transparent bg-surface hover:border-white/10"
                    }`}
                  >
                    {active && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                        <Check size={11} className="text-black" />
                      </span>
                    )}
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black/30">
                      <Image src={safeImageSrc(game.image)} alt={game.name} fill className="object-cover" sizes="48px" />
                    </div>
                    <span className="text-xs text-center text-white/80 truncate w-full">{game.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Фото предмета</p>
          <ImageUploadField value={imageUrl} onChange={setImageUrl} folder="sell-requests" size={96} />
        </div>

        <input
            autoComplete="off"
          required
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Название предмета"
          className="input-field py-2.5"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm font-medium mb-2">Количество</p>
            <input
            autoComplete="off"
              required
              type="number"
              min={1}
              value={stock}
              disabled={auctionEnabled}
              onChange={(e) => setStock(e.target.value)}
              placeholder="Кол-во предметов"
              className="input-field py-2.5 disabled:opacity-50"
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Редкость</p>
            <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity)} className="input-field py-2.5 w-full">
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {RARITY_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание предмета (обязательно)"
          rows={3}
          className="input-field py-2.5"
        />

        <div>
          <p className="text-sm font-medium mb-2">Как будешь выдавать товар покупателю?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeliveryMethod("seller")}
              className={`flex-1 py-2.5 rounded-btn text-sm border transition-all ${
                deliveryMethod === "seller" ? "border-accent bg-accent/10 text-white" : "border-transparent bg-surface text-white/50"
              }`}
            >
              Сам
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMethod("bot")}
              className={`flex-1 py-2.5 rounded-btn text-sm border transition-all ${
                deliveryMethod === "bot" ? "border-accent bg-accent/10 text-white" : "border-transparent bg-surface text-white/50"
              }`}
            >
              Через бота
            </button>
          </div>
          <p className="text-xs text-white/30 mt-2">
            «Сам» — договариваешься с покупателем напрямую, площадка в сделке не участвует. «Через бота» — предмет
            сначала передаётся боту-посреднику площадки, покупатель забирает его у бота, оба шага подтверждает
            администратор. Этот способ будет действовать для всех заказов этого товара.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Формат продажи</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAuctionEnabled(false)}
              className={`flex-1 py-2.5 rounded-btn text-sm border transition-all ${
                !auctionEnabled ? "border-accent bg-accent/10 text-white" : "border-transparent bg-surface text-white/50"
              }`}
            >
              Обычная продажа
            </button>
            <button
              type="button"
              onClick={() => {
                setAuctionEnabled(true);
                setStock("1");
                setDiscountPercent("");
              }}
              className={`flex-1 py-2.5 rounded-btn text-sm border transition-all ${
                auctionEnabled ? "border-accent bg-accent/10 text-white" : "border-transparent bg-surface text-white/50"
              }`}
            >
              🔨 Аукцион
            </button>
          </div>
          <p className="text-xs text-white/30 mt-2">
            {auctionEnabled
              ? "Покупатели соревнуются ставками начиная со стартовой цены. Ты сам завершаешь торги в любой момент — заказ оформится на того, кто предложил больше всех."
              : "Фиксированная цена — товар покупают сразу, без торгов."}
          </p>
        </div>

        <div>
          <input
            autoComplete="off"
            required
            type="number"
            min={minSellPrice}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={auctionEnabled ? `Стартовая цена аукциона, ₽ (минимум ${minSellPrice} ₽)` : `Желаемая цена, ₽ (минимум ${minSellPrice} ₽)`}
            className="input-field py-2.5"
          />
        </div>

        {auctionEnabled ? (
          <div>
            <input
              autoComplete="off"
              required
              type="number"
              min={1}
              value={auctionMinStep}
              onChange={(e) => setAuctionMinStep(e.target.value)}
              placeholder="Минимальный шаг ставки, ₽"
              className="input-field py-2.5"
            />
            <p className="text-xs text-white/40 mt-2">
              Каждая следующая ставка должна быть выше предыдущей минимум на эту сумму. Комиссия платформы{" "}
              {commissionPercent}% удержится с финальной цены, когда аукцион завершится.
            </p>
          </div>
        ) : (
          <div>
            <input
              autoComplete="off"
              type="number"
              min={0}
              max={90}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="Скидка на товар, % (необязательно, до 90%)"
              className="input-field py-2.5"
            />
            {priceNum > 0 && (
              <p className="text-xs text-white/40 mt-2">
                {discountNum > 0 ? (
                  <>
                    Цена для покупателя: <span className="line-through">{priceNum} ₽</span>{" "}
                    <span className="text-accent font-medium">{discountedPrice} ₽</span> (скидка {discountNum}%). Комиссия платформы{" "}
                    {commissionPercent}%: −{commission} ₽ → тебе с продажи ≈ <span className="text-accent font-medium">{payout} ₽</span>
                  </>
                ) : (
                  <>
                    Комиссия платформы {commissionPercent}%: −{commission} ₽ → тебе с продажи ≈ <span className="text-accent font-medium">{payout} ₽</span>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        <button disabled={submitting} className="btn-primary w-full py-3 disabled:opacity-50">
          {submitting ? "Отправляем..." : "Отправить заявку"}
        </button>
      </form>
    </div>
  );
}
