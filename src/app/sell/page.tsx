"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";

export default function SellPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [game, setGame] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast("warning", "Войдите в аккаунт, чтобы продавать предметы");
      return;
    }
    // В MVP заявка просто уходит в Telegram-поддержку на ручную проверку, как и баланс.
    toast("success", "Заявка на продажу отправлена. Администратор свяжется с вами в Telegram.");
    setName("");
    setGame("");
    setPrice("");
    setDescription("");
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-2">Продать предметы</h1>
      <p className="text-white/40 text-sm mb-6">
        Заполните форму — администратор проверит предмет и свяжется с вами в Telegram для оформления продажи.
      </p>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <input
            autoComplete="off"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название предмета"
          className="input-field py-2.5"
        />
        <input
            autoComplete="off"
          required
          value={game}
          onChange={(e) => setGame(e.target.value)}
          placeholder="Игра (например, Adopt Me)"
          className="input-field py-2.5"
        />
        <input
            autoComplete="off"
          required
          type="number"
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
        <button className="btn-primary w-full py-3">Отправить заявку</button>
      </form>
    </div>
  );
}
