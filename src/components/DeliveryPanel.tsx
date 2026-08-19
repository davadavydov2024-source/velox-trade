"use client";

import { useEffect, useState } from "react";
import { Bot, Clock, User, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { subscribeDelivery, submitDeliveryNickname, chooseDeliveryMethod } from "@/lib/deliveries";
import { Delivery } from "@/types";
import { useToast } from "@/lib/toastContext";
import { RobloxUserPreview } from "@/components/RobloxUserPreview";

function isEffectivelyExpired(d: Delivery): boolean {
  return (d.status === "awaiting_nickname" || d.status === "awaiting_transfer") && !!d.expiresAt && Date.now() > d.expiresAt;
}

function Countdown({ expiresAt }: { expiresAt: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const msLeft = Math.max(0, expiresAt - Date.now());
  const mins = Math.floor(msLeft / 60000);
  const secs = Math.floor((msLeft % 60000) / 1000);
  return (
    <span className="text-xs text-white/50 flex items-center gap-1">
      <Clock size={12} /> осталось {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

export function DeliveryPanel({ orderId, isBuyer, isSeller }: { orderId: string; isBuyer: boolean; isSeller: boolean }) {
  const { toast } = useToast();
  const [delivery, setDelivery] = useState<Delivery | null | undefined>(undefined); // undefined = ещё грузится
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = subscribeDelivery(orderId, setDelivery);
    return unsub;
  }, [orderId]);

  // undefined — идёт первая загрузка, ничего не показываем, чтобы не мигало.
  // null — записи о выдаче нет вовсе (например, старый заказ до появления этой фичи) — тоже не показываем.
  // method === "seller" и статус уже "delivered" — продавец выбрал выдачу без бота, площадка
  // в дальнейшем не участвует: показывать тут нечего, дальше работает обычная кнопка
  // "Подтвердить получение" в OrderChatThread.
  if (delivery === undefined || delivery === null) return null;
  if (delivery.method === "seller") return null;

  const expired = isEffectivelyExpired(delivery);

  async function handleChooseMethod(method: "seller" | "bot") {
    setBusy(true);
    try {
      await chooseDeliveryMethod(orderId, method);
    } catch (err: any) {
      toast("error", err?.message || "Не удалось сохранить способ выдачи");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    setBusy(true);
    try {
      await submitDeliveryNickname(orderId, nickname.trim());
      toast("success", "Ник сохранён — сейчас покажем, куда передать предмет");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось сохранить ник");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 mb-3 space-y-3 border border-accent/20">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Bot size={15} className="text-accent" /> Получение товара
        </p>
        {!expired && delivery.status !== "delivered" && delivery.status !== "cancelled" && delivery.expiresAt && <Countdown expiresAt={delivery.expiresAt} />}
      </div>

      {expired ? (
        <p className="text-sm text-red-400">
          Время на получение истекло. Напиши в поддержку — админ разберётся и поможет получить предмет.
        </p>
      ) : delivery.status === "awaiting_method" ? (
        isSeller ? (
          <>
            <p className="text-xs text-white/50">Как отдашь предмет покупателю?</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleChooseMethod("seller")}
                disabled={busy}
                className="btn-secondary flex-1 py-2 text-sm disabled:opacity-50"
              >
                Сам
              </button>
              <button
                onClick={() => handleChooseMethod("bot")}
                disabled={busy}
                className="btn-primary flex-1 py-2 text-sm disabled:opacity-50"
              >
                Через бота
              </button>
            </div>
            <p className="text-[11px] text-white/30">
              «Сам» — сделка идёт напрямую между вами, площадка не участвует. «Через бота» — предмет сначала передаётся
              боту-посреднику, выдачу подтверждает администратор.
            </p>
          </>
        ) : (
          <p className="text-xs text-white/50">Ждём, пока продавец выберет способ выдачи товара.</p>
        )
      ) : delivery.status === "awaiting_nickname" ? (
        isBuyer ? (
          <>
            <p className="text-xs text-white/50">
              Укажи свой игровой ник — после этого мы покажем аккаунт бота-посредника, через который пройдёт передача предмета.
              {delivery.expiresAt
                ? " Выдача приза с колеса фортуны активна 1 час, ник можно указать только один раз."
                : " Ник можно указать только один раз."}
            </p>
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="flex gap-2">
                <input
                  autoComplete="off"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Твой игровой ник"
                  maxLength={40}
                  className="input-field py-2 text-sm flex-1"
                />
                <button disabled={busy || !nickname.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                  Готово
                </button>
              </div>
              <RobloxUserPreview username={nickname} />
            </form>
          </>
        ) : (
          <p className="text-xs text-white/50">Ждём, пока покупатель укажет свой игровой ник — тогда покажем, куда передать предмет.</p>
        )
      ) : delivery.status === "awaiting_transfer" ? (
        <div className="space-y-2 text-sm">
          {isSeller && delivery.buyerNickname && (
            <>
              <p className="flex items-center gap-1.5 text-white/70">
                <User size={13} className="text-white/40" /> Ник покупателя: <span className="font-medium">{delivery.buyerNickname}</span>
              </p>
              <RobloxUserPreview username={delivery.buyerNickname} />
            </>
          )}
          <p className="flex items-center gap-1.5 text-white/70">
            <Bot size={13} className="text-white/40" /> Бот-посредник: <span className="font-medium">{delivery.botNickname}</span>
            {delivery.botProfileLink && (
              <a href={delivery.botProfileLink} target="_blank" rel="noopener noreferrer" className="text-accent">
                <ExternalLink size={12} />
              </a>
            )}
          </p>
          {isSeller ? (
            <p className="text-xs text-white/50">
              Передай предмет с аккаунта покупателя ({delivery.buyerNickname}) на аккаунт бота-посредника выше. Как только это
              подтвердит администратор, статус обновится автоматически.
            </p>
          ) : (
            <p className="text-xs text-white/50">
              Продавцу отправлено, куда передать предмет. Как только бот его получит, ты увидишь это здесь и сможешь забрать
              предмет у бота в игре.
            </p>
          )}
        </div>
      ) : delivery.status === "received_by_bot" ? (
        <div className="text-sm">
          <p className="text-accent font-medium mb-1">Бот получил предмет от продавца ✅</p>
          {isBuyer ? (
            <p className="text-xs text-white/50">
              Зайди в игру и получи предмет у аккаунта <span className="text-white/80 font-medium">{delivery.botNickname}</span>{" "}
              {delivery.botProfileLink && (
                <a href={delivery.botProfileLink} target="_blank" rel="noopener noreferrer" className="text-accent inline-flex items-center gap-0.5">
                  (профиль <ExternalLink size={11} />)
                </a>
              )}
              . Администратор скоро подтвердит выдачу.
            </p>
          ) : (
            <p className="text-xs text-white/50">Ждём, пока администратор выдаст предмет покупателю у бота.</p>
          )}
        </div>
      ) : delivery.status === "cancelled" ? (
        <div className="text-sm">
          <p className="text-red-400 font-medium mb-1 flex items-center gap-1.5">
            <XCircle size={15} /> Выдача отменена администрацией
          </p>
          {delivery.cancelReason && <p className="text-xs text-white/50">Причина: «{delivery.cancelReason}»</p>}
          <p className="text-xs text-white/40 mt-1">Если считаешь, что это ошибка — напиши в поддержку.</p>
        </div>
      ) : (
        <p className="text-sm text-green-400 flex items-center gap-1.5">
          <CheckCircle2 size={15} /> Товар выдан
        </p>
      )}
    </div>
  );
}
