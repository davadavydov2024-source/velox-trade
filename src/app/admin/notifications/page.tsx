"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Edit3, Power, Pin, Send, Loader2 } from "lucide-react";
import { getAllNotifications, createNotification, updateNotification, deleteNotification } from "@/lib/notifications";
import { AppNotification } from "@/types";
import { useToast } from "@/lib/toastContext";
import { useAuth } from "@/lib/authContext";

const CATEGORIES: { value: AppNotification["category"]; label: string }[] = [
  { value: "general", label: "Общее" },
  { value: "trade", label: "Торговля" },
  { value: "transactions", label: "Транзакции" },
];

const EMPTY: Omit<AppNotification, "id" | "createdAt"> = {
  title: "",
  text: "",
  category: "general",
  color: "#ff9800",
  pinned: false,
  active: true,
  buttonText: "",
  buttonLink: "",
};

export default function AdminNotificationsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AppNotification | null>(null);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("");
  const [pushSending, setPushSending] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await getAllNotifications());
    } catch {
      toast("error", "Не удалось загрузить уведомления");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(n: AppNotification) {
    setEditing(n);
    setForm({ ...n });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.text.trim()) {
      toast("warning", "Заполните заголовок и текст");
      return;
    }
    try {
      if (editing) {
        await updateNotification(editing.id, form);
        toast("success", "Уведомление обновлено");
      } else {
        await createNotification(form);
        toast("success", "Уведомление создано");
      }
      setShowForm(false);
      refresh();
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Ошибка сохранения уведомления");
      }
      console.error(err);
    }
  }

  async function handleDelete(n: AppNotification) {
    if (!confirm(`Удалить уведомление «${n.title}»?`)) return;
    await deleteNotification(n.id);
    setItems((list) => list.filter((x) => x.id !== n.id));
    toast("success", "Уведомление удалено");
  }

  async function handleToggleActive(n: AppNotification) {
    await updateNotification(n.id, { active: !n.active });
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, active: !x.active } : x)));
  }

  async function handleTogglePinned(n: AppNotification) {
    await updateNotification(n.id, { pinned: !n.pinned });
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)));
  }

  async function handlePushBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!pushTitle.trim()) {
      toast("warning", "Введи заголовок push-уведомления");
      return;
    }
    setPushSending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/push-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ title: pushTitle.trim(), body: pushBody.trim(), url: pushUrl.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Не удалось отправить рассылку");
        return;
      }
      if (data.total === 0) {
        toast("warning", "Пока ни один пользователь не подписан на push-уведомления — рассылать некому.");
      } else if (data.failed === 0) {
        toast("success", `Push отправлен всем подписчикам (${data.sent} из ${data.total})`);
      } else {
        toast("warning", `Доставлено ${data.sent} из ${data.total}. Причина сбоев: ${data.lastError ?? "неизвестна"}`);
      }
      setPushTitle("");
      setPushBody("");
      setPushUrl("");
    } catch {
      toast("error", "Не удалось отправить рассылку");
    } finally {
      setPushSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-3">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <Send size={16} className="text-accent" /> Push-рассылка всем пользователям
          </p>
          <p className="text-sm text-white/40">
            Уходит как настоящее push-уведомление — на iPhone придёт, только если сайт добавлен на главный экран и
            человек включил уведомления. Дойдёт только до тех, кто подписался (см. переключатель в Профиль → Безопасность).
          </p>
        </div>
        <form onSubmit={handlePushBroadcast} className="grid sm:grid-cols-2 gap-3">
          <input
            autoComplete="off"
            required
            placeholder="Заголовок push-уведомления"
            value={pushTitle}
            onChange={(e) => setPushTitle(e.target.value)}
            className="input-field py-2.5"
          />
          <input
            autoComplete="off"
            placeholder="Ссылка при нажатии (необязательно, напр. /catalog)"
            value={pushUrl}
            onChange={(e) => setPushUrl(e.target.value)}
            className="input-field py-2.5"
          />
          <textarea
            placeholder="Текст уведомления"
            value={pushBody}
            onChange={(e) => setPushBody(e.target.value)}
            className="input-field py-2.5 sm:col-span-2"
            rows={2}
          />
          <button
            type="submit"
            disabled={pushSending}
            className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 justify-center disabled:opacity-50 sm:col-span-2 sm:w-fit"
          >
            {pushSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {pushSending ? "Отправляем..." : "Отправить всем"}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Уведомления</h1>
          <p className="text-sm text-white/40">
            Показываются пользователям в колокольчике в шапке сайта. Можно закрепить, добавить кнопку со ссылкой.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={16} /> Создать уведомление
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card p-5 grid sm:grid-cols-2 gap-4">
          <input
            autoComplete="off"
            required
            placeholder="Заголовок"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input-field py-2.5"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as AppNotification["category"] })}
            className="input-field py-2.5"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <textarea
            required
            placeholder="Текст уведомления"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            className="input-field py-2.5 sm:col-span-2"
            rows={3}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/40 shrink-0">Цвет метки</label>
            <input
              autoComplete="off"
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-10 w-16 rounded-btn bg-surface border border-border"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                autoComplete="off"
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              />
              Закрепить (без крестика закрытия)
            </label>
          </div>
          <input
            autoComplete="off"
            placeholder="Текст кнопки (необязательно)"
            value={form.buttonText}
            onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
            className="input-field py-2.5"
          />
          <input
            autoComplete="off"
            placeholder="Ссылка кнопки"
            value={form.buttonLink}
            onChange={(e) => setForm({ ...form, buttonLink: e.target.value })}
            className="input-field py-2.5"
          />
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              autoComplete="off"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Активно
          </label>
          <div className="sm:col-span-2 flex gap-3">
            <button className="btn-primary px-5 py-2.5 text-sm">{editing ? "Сохранить" : "Создать"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2.5 text-sm">
              Отмена
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 border-b border-border">
              <th className="p-3">Заголовок</th>
              <th className="p-3">Категория</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-white/40">
                  Загрузка...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-white/40">
                  Уведомлений ещё нет
                </td>
              </tr>
            ) : (
              items.map((n) => (
                <tr key={n.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="p-3 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: n.color }} />
                    {n.title}
                    {n.pinned && <Pin size={12} className="text-white/40" />}
                  </td>
                  <td className="p-3 text-white/50">{CATEGORIES.find((c) => c.value === n.category)?.label}</td>
                  <td className="p-3">
                    {n.active ? (
                      <span className="text-green-400 text-xs font-semibold">Активно</span>
                    ) : (
                      <span className="text-white/30 text-xs font-semibold">Выключено</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleToggleActive(n)} className="p-1.5 rounded-md hover:bg-white/10 text-white/60" title="Вкл/выкл">
                        <Power size={15} />
                      </button>
                      <button
                        onClick={() => handleTogglePinned(n)}
                        className={`p-1.5 rounded-md hover:bg-white/10 ${n.pinned ? "text-accent" : "text-white/60"}`}
                        title="Закрепить"
                      >
                        <Pin size={15} />
                      </button>
                      <button onClick={() => openEdit(n)} className="p-1.5 rounded-md hover:bg-white/10 text-white/60">
                        <Edit3 size={15} />
                      </button>
                      <button onClick={() => handleDelete(n)} className="p-1.5 rounded-md hover:bg-white/10 text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
