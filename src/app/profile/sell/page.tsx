"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createSellRequest } from "@/lib/sellRequests";
import { Tag } from "lucide-react";

export default function SellPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [itemName, setItemName] = useState("");
  const [game, setGame] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) {
      toast("warning", "Войдите в аккаунт, чтобы продавать предметы");
      return;
    }
    setSubmitting(true);
    try {
      const priceNum = Number(price);
      await createSellRequest({
        userId: user.uid,
        userNick: profile.displayName,
        itemName: itemName.trim(),
        game: game.trim(),
        price: priceNum,
        description: description.trim(),
      });

      // Уведомление админу в Telegram не должно блокировать создание заявки, если бот недоступен.
      fetch("/api/admin/notify-sell-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName, game, price: priceNum, userNick: profile.displayName }),
      }).catch((err) => console.error("Не удалось уведомить админа:", err));

      toast("success", "Заявка на продажу отправлена. Администратор проверит её и свяжется с тобой.");
      setItemName("");
      setGame("");
      setPrice("");
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
      <form onSubmit={handleSubmit} className="card p-6 space-y-4 max-w-xl">
        <input
          required
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Название предмета"
          className="input-field py-2.5"
        />
        <input
          required
          value={game}
          onChange={(e) => setGame(e.target.value)}
          placeholder="Игра (например, Adopt Me)"
          className="input-field py-2.5"
        />
        <input
          required
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Желаемая цена, ₽"
          className="input-field py-2.5"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание предмета (необязательно)"
          rows={3}
          className="input-field py-2.5"
        />
        <button disabled={submitting} className="btn-primary w-full py-3 disabled:opacity-50">
          {submitting ? "Отправляем..." : "Отправить заявку"}
        </button>
      </form>
    </div>
  );
}
