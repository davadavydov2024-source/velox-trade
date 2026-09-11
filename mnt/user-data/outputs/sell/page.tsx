"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Tag, Check, ChevronLeft, ChevronRight, ImagePlus, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createSellRequest } from "@/lib/sellRequests";
import { getGames } from "@/lib/products";
import { getFeatureFlags } from "@/lib/featureFlags";
import { Game, DEFAULT_FEATURE_FLAGS, Rarity, RARITY_LABEL, DeliveryMethod } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { ImageUploadField } from "@/components/ImageUploadField";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

const STEPS = ["Игра", "Предмет", "Условия", "Цена"] as const;
type Step = 0 | 1 | 2 | 3;

export default function SellPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoaded, setGamesLoaded] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(DEFAULT_FEATURE_FLAGS.sellCommissionPercent);
  const [minSellPrice, setMinSellPrice] = useState(DEFAULT_FEATURE_FLAGS.minProductPriceRub);

  const [step, setStep] = useState<Step>(0);
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
  const stockNum = Number(stock) || 0;

  function goNext() {
    if (step === 0 && !selectedGame) {
      toast("warning", "Выбери игру");
      return;
    }
    if (step === 1) {
      if (!imageUrl) {
        toast("warning", "Загрузи фото предмета");
        return;
      }
      if (!itemName.trim()) {
        toast("warning", "Укажи название предмета");
        return;
      }
      if (stockNum < 1) {
        toast("warning", "Укажи количество предметов — минимум 1");
        return;
      }
    }
    if (step === 2) {
      if (!description.trim()) {
        toast("warning", "Опиши предмет — описание обязательно");
        return;
      }
      if (auctionEnabled && stockNum !== 1) {
        toast("warning", "Аукцион можно провести только для одного конкретного предмета — вернись и укажи количество 1");
        return;
      }
    }
    setStep((s) => Math.min(3, s + 1) as Step);
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1) as Step);
  }

  async function handleSubmit() {
    if (!user || !profile) {
      toast("warning", "Войдите в аккаунт, чтобы продавать предметы");
      return;
    }
    if (priceNum < minSellPrice) {
      toast("warning", `Минимальная цена — ${minSellPrice} ₽`);
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
        gameId: selectedGame!.slug,
        gameName: selectedGame!.name,
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
        body: JSON.stringify({ itemName, game: selectedGame!.name, price: priceNum, userNick: profile.displayName }),
      }).catch((err) => console.error("Не удалось уведомить админа:", err));

      toast("success", "Заявка на продажу отправлена. Администратор проверит её и свяжется с тобой.");
      setStep(0);
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
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Tag size={20} className="text-accent" /> Продать предмет
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Заявка уйдёт администратору, он проверит предмет и свяжется с тобой для оформления продажи.
        </p>
      </div>

      {/* Степпер — шаги мастера как отдельные экраны, а не одна длинная форма */}
      <div className="flex items-center">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors ${
                    done ? "bg-accent border-accent text-black" : active ? "border-accent text-accent" : "border-white/15 text-white/30"
                  }`}
                >
                  {done ? <Check size={14} /> : i + 1}
                </div>
                <span className={`text-[11px] whitespace-nowrap ${active ? "text-white" : "text-white/35"}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-px flex-1 mx-2 mb-4 transition-colors ${done ? "bg-accent" : "bg-white/10"}`} />}
            </div>
          );
        })}
      </div>

      <div className="card p-6 space-y-5 min-h-[360px] flex flex-col">
        <div className="flex-1 space-y-5">
          {step === 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Какую игру продаём?</p>
              {!gamesLoaded ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
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
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <ImagePlus size={14} className="text-white/40" /> Фото предмета
                </p>
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
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium mb-2">Способ выдачи</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("seller")}
                    className={`flex-1 py-2.5 rounded-btn text-sm border transition-all ${
                      deliveryMethod === "seller" ? "border-accent bg-accent/10 text-white" : "border-transparent bg-surface text-white/50"
                    }`}
                  >
                    Сам продавец
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("bot")}
                    className={`flex-1 py-2.5 rounded-btn text-sm border transition-all ${
                      deliveryMethod === "bot" ? "border-accent bg-accent/10 text-white" : "border-transparent bg-surface text-white/50"
                    }`}
                  >
                    Через бота-посредника
                  </button>
                </div>
                <p className="text-xs text-white/30 mt-2">
                  {deliveryMethod === "bot"
                    ? "Площадка контролирует передачу предмета через бота-посредника — безопаснее для покупателя."
                    : "Ты сам передаёшь предмет покупателю после оплаты, без участия площадки."}
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

              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание предмета (обязательно)"
                rows={4}
                className="input-field py-2.5"
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
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
              )}

              {priceNum > 0 && (
                <div className="rounded-btn bg-surface p-4 space-y-3">
                  <p className="text-xs uppercase tracking-wide text-white/30 flex items-center gap-1.5">
                    <Sparkles size={12} /> Предпросмотр заявки
                  </p>
                  <div className="flex items-center gap-3">
                    {imageUrl && (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black/30 shrink-0">
                        <Image src={safeImageSrc(imageUrl)} alt={itemName} fill className="object-cover" sizes="48px" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{itemName || "Без названия"}</p>
                      <p className="text-xs text-white/40">
                        {selectedGame?.name} · {RARITY_LABEL[rarity]}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm">
                    {discountNum > 0 && !auctionEnabled ? (
                      <>
                        Цена для покупателя: <span className="line-through text-white/40">{priceNum} ₽</span>{" "}
                        <span className="text-accent font-medium">{discountedPrice} ₽</span> (скидка {discountNum}%)
                      </>
                    ) : (
                      <>{auctionEnabled ? "Стартовая цена" : "Цена"}: {priceNum} ₽</>
                    )}
                  </div>
                  <p className="text-xs text-white/40">
                    Комиссия платформы {commissionPercent}%: −{commission} ₽ → тебе с продажи ≈{" "}
                    <span className="text-accent font-medium">{payout} ₽</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          {step > 0 && (
            <button type="button" onClick={goBack} className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-1.5">
              <ChevronLeft size={15} /> Назад
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button type="button" onClick={goNext} className="btn-primary px-6 py-2.5 text-sm flex items-center gap-1.5">
              Далее <ChevronRight size={15} />
            </button>
          ) : (
            <button type="button" disabled={submitting} onClick={handleSubmit} className="btn-primary px-6 py-2.5 text-sm disabled:opacity-50">
              {submitting ? "Отправляем..." : "Отправить заявку"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
