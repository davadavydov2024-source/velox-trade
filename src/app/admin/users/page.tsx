"use client";

import { useEffect, useState } from "react";
import { Search, Ban, CheckCircle, Edit3, Tag, X, PowerOff } from "lucide-react";
import { getAllUsers, setUserBalance, setUserBan, setUserBadges } from "@/lib/users";
import { UserProfile, UserBadge, BADGE_COLOR, BADGE_LABEL } from "@/types";
import { useToast } from "@/lib/toastContext";
import { useAuth } from "@/lib/authContext";

const ALL_BADGES: UserBadge[] = [
  "user",
  "buyer",
  "verified",
  "creator",
  "blogger",
  "sponsor",
  "vip",
  "moderator",
  "developer",
  "admin",
  "founder",
  "checkmark_blue",
  "checkmark_grey",
];

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingBadges, setEditingBadges] = useState<UserProfile | null>(null);
  const [draftBadges, setDraftBadges] = useState<UserBadge[]>([]);
  const [savingBadges, setSavingBadges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getAllUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleEditBalance(u: UserProfile) {
    const input = prompt(`Новый баланс для ${u.displayName} (текущий: ${u.balance})`, u.balance.toString());
    if (input === null) return;
    const value = Number(input);
    if (Number.isNaN(value) || value < 0) {
      toast("error", "Некорректное значение баланса");
      return;
    }
    await setUserBalance(u.uid, value);
    setUsers((list) => list.map((x) => (x.uid === u.uid ? { ...x, balance: value } : x)));
    toast("success", "Баланс обновлён");
  }

  async function handleToggleBan(u: UserProfile) {
    const banned = !u.banned;
    let reason: string | undefined;
    if (banned) {
      reason = prompt("Причина блокировки:") ?? undefined;
    }
    await setUserBan(u.uid, banned, reason, banned ? "forever" : null);
    setUsers((list) => list.map((x) => (x.uid === u.uid ? { ...x, banned, banReason: reason } : x)));
    toast(banned ? "warning" : "success", banned ? "Пользователь заблокирован" : "Пользователь разблокирован");
  }

  async function handleKick(u: UserProfile) {
    if (!confirm(`Разорвать текущую сессию пользователя ${u.displayName}? Ему придётся войти заново.`)) return;
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/kick-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ targetUid: u.uid }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Не удалось выполнить действие");
        return;
      }
      toast("success", "Сессия пользователя разорвана — при следующем действии потребуется вход заново");
    } catch {
      toast("error", "Не удалось связаться с сервером");
    }
  }

  function openBadgeEditor(u: UserProfile) {
    setEditingBadges(u);
    setDraftBadges(u.badges);
  }

  function toggleDraftBadge(badge: UserBadge) {
    setDraftBadges((list) => (list.includes(badge) ? list.filter((b) => b !== badge) : [...list, badge]));
  }

  async function saveBadges() {
    if (!editingBadges) return;
    setSavingBadges(true);
    try {
      await setUserBadges(editingBadges.uid, draftBadges);
      setUsers((list) => list.map((x) => (x.uid === editingBadges.uid ? { ...x, badges: draftBadges } : x)));
      toast("success", "Метки обновлены");
      setEditingBadges(null);
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Не удалось сохранить метки");
      }
      console.error(err);
    } finally {
      setSavingBadges(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Пользователи</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по нику или email"
            className="input-field pl-9 py-2 text-sm"
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 border-b border-border">
              <th className="p-3">Пользователь</th>
              <th className="p-3">Email</th>
              <th className="p-3">Баланс</th>
              <th className="p-3">Метки</th>
              <th className="p-3">Регистрация</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-white/40">
                  Загрузка...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-white/40">
                  Пользователи не найдены
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.uid} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="p-3 font-medium">{u.displayName}</td>
                  <td className="p-3 text-white/50">{u.email}</td>
                  <td className="p-3">{u.balance.toFixed(2)} ₽</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap max-w-[220px]">
                      {u.badges.map((b) => (
                        <span
                          key={b}
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: `${BADGE_COLOR[b]}22`, color: BADGE_COLOR[b] }}
                        >
                          {BADGE_LABEL[b]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-white/40">{new Date(u.createdAt).toLocaleDateString("ru-RU")}</td>
                  <td className="p-3">
                    {u.banned ? (
                      <span className="text-red-400 text-xs font-semibold">Заблокирован</span>
                    ) : (
                      <span className="text-green-400 text-xs font-semibold">Активен</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openBadgeEditor(u)}
                        className="p-1.5 rounded-md hover:bg-white/10 text-white/60"
                        title="Метки пользователя"
                      >
                        <Tag size={15} />
                      </button>
                      <button
                        onClick={() => handleEditBalance(u)}
                        className="p-1.5 rounded-md hover:bg-white/10 text-white/60"
                        title="Изменить баланс"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleToggleBan(u)}
                        className="p-1.5 rounded-md hover:bg-white/10 text-white/60"
                        title={u.banned ? "Разблокировать" : "Заблокировать"}
                      >
                        {u.banned ? <CheckCircle size={15} /> : <Ban size={15} />}
                      </button>
                      <button
                        onClick={() => handleKick(u)}
                        className="p-1.5 rounded-md hover:bg-white/10 text-white/60"
                        title="Разорвать сессию (кикнуть)"
                      >
                        <PowerOff size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingBadges && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingBadges(null)}>
          <div className="card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Метки — {editingBadges.displayName}</h2>
              <button onClick={() => setEditingBadges(null)} className="text-white/40 hover:text-white/80">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {ALL_BADGES.map((b) => {
                const active = draftBadges.includes(b);
                return (
                  <button
                    key={b}
                    onClick={() => toggleDraftBadge(b)}
                    className={`text-left text-sm px-3 py-2 rounded-btn border transition-colors flex items-center gap-2 ${
                      active ? "border-transparent" : "border-border text-white/50 hover:bg-white/5"
                    }`}
                    style={active ? { background: `${BADGE_COLOR[b]}22`, color: BADGE_COLOR[b] } : undefined}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BADGE_COLOR[b] }} />
                    {BADGE_LABEL[b]}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={saveBadges} disabled={savingBadges} className="btn-primary px-5 py-2.5 text-sm flex-1 disabled:opacity-50">
                {savingBadges ? "Сохраняем..." : "Сохранить"}
              </button>
              <button onClick={() => setEditingBadges(null)} className="btn-secondary px-5 py-2.5 text-sm">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
