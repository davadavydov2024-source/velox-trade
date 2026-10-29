"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, Ban, CheckCircle, Tag, X, PowerOff, Palette, MessageCircle, Wallet, Copy, ExternalLink, ShieldCheck,
  ShieldAlert, Download, Eye, Users, Wifi, UserPlus, BadgeCheck, ChevronRight, Mail, Star, Gift, Bell, Clock, Hash, UserCog,
} from "lucide-react";
import { getAllUsers, setUserBalance, setUserBan, setUserBadges, setStaffRole, adminUpdateNickname } from "@/lib/users";
import { UserProfile, UserBadge, BADGE_COLOR, BADGE_LABEL, DEFAULT_PUSH_CATEGORIES } from "@/types";
import { NICKNAME_COLOR_PRESETS, NICKNAME_FONT_PRESETS } from "@/lib/nicknameStyles";
import { StyledNickname } from "@/components/StyledNickname";
import { safeImageSrc } from "@/lib/safeImage";
import { useToast } from "@/lib/toastContext";
import { useAuth } from "@/lib/authContext";
import { auth } from "@/lib/firebase";

const ALL_BADGES: UserBadge[] = [
  "user", "buyer", "verified", "creator", "blogger", "sponsor", "vip", "moderator", "developer", "admin", "founder",
  "checkmark_blue", "checkmark_grey",
];

const ONLINE_MS = 2 * 60 * 1000;
const PAGE_SIZE = 40;
const DAY = 24 * 60 * 60 * 1000;

type Filter = "all" | "online" | "banned" | "staff" | "unverified" | "new";
type SortKey = "new" | "active" | "balance" | "name";

const BAN_REASONS = ["Мошенничество", "Спам / реклама", "Оскорбления", "Нарушение правил площадки", "Мультиаккаунт"];
const BAN_DURATIONS: { label: string; value: number | "forever" }[] = [
  { label: "Навсегда", value: "forever" },
  { label: "1 день", value: DAY },
  { label: "7 дней", value: 7 * DAY },
  { label: "30 дней", value: 30 * DAY },
];

function isOnline(u: UserProfile) {
  return Date.now() - (u.lastActiveAt ?? 0) < ONLINE_MS;
}

function timeAgo(ts?: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(ts).toLocaleDateString("ru-RU");
}

function fullDate(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function lastSeen(u: UserProfile): string {
  if (isOnline(u)) return "в сети";
  return `был(а) ${timeAgo(u.lastActiveAt ?? u.lastLoginAt)}`;
}

function Avatar({ u, size = 40 }: { u: UserProfile; size?: number }) {
  return (
    <div className="relative shrink-0 rounded-full bg-black/30 overflow-hidden" style={{ width: size, height: size }}>
      <Image src={safeImageSrc(u.photoURL, "/placeholder.svg")} alt="" fill className="object-cover" sizes={`${size}px`} />
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-btn bg-white/[0.03] border border-white/5 p-4 space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-white/40 shrink-0">{label}</span>
      <span className="text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

function AdminUsersInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightUid = searchParams.get("uid");

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("new");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const [editingBadges, setEditingBadges] = useState<UserProfile | null>(null);
  const [draftBadges, setDraftBadges] = useState<UserBadge[]>([]);
  const [savingBadges, setSavingBadges] = useState(false);
  const [editingNick, setEditingNick] = useState<UserProfile | null>(null);
  const [nickDraft, setNickDraft] = useState({ displayName: "", nameColor: "default", nameFont: "default" });
  const [savingNick, setSavingNick] = useState(false);
  const [balanceTarget, setBalanceTarget] = useState<UserProfile | null>(null);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [banTarget, setBanTarget] = useState<UserProfile | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<number | "forever">("forever");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const listTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  // Переход из других разделов («Профиль» в поддержке, жалобах и т.п.) — сразу открываем карточку человека.
  useEffect(() => {
    if (highlightUid && !loading) setSelectedUid(highlightUid);
  }, [highlightUid, loading]);

  const byUid = useMemo(() => new Map(users.map((u) => [u.uid, u])), [users]);
  const selected = selectedUid ? byUid.get(selectedUid) ?? null : null;

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: users.length,
      online: users.filter(isOnline).length,
      banned: users.filter((u) => u.banned).length,
      staff: users.filter((u) => u.staffRole || u.badges?.includes("admin") || u.badges?.includes("moderator")).length,
      unverified: users.filter((u) => !u.emailVerified).length,
      fresh: users.filter((u) => now - u.createdAt < 7 * DAY).length,
    };
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users.filter((u) => {
      if (highlightUid && u.uid !== highlightUid) return false;
      if (q) {
        const hay = `${u.displayName} ${u.email} ${u.username ?? ""} ${u.uid}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case "online": return isOnline(u);
        case "banned": return !!u.banned;
        case "staff": return !!u.staffRole || u.badges?.includes("admin") || u.badges?.includes("moderator");
        case "unverified": return !u.emailVerified;
        case "new": return Date.now() - u.createdAt < 7 * DAY;
        default: return true;
      }
    });
    list = [...list];
    if (sort === "active") list.sort((a, b) => (b.lastActiveAt ?? b.lastLoginAt ?? 0) - (a.lastActiveAt ?? a.lastLoginAt ?? 0));
    else if (sort === "balance") list.sort((a, b) => b.balance - a.balance);
    else if (sort === "name") list.sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [users, search, filter, sort, highlightUid]);

  useEffect(() => setVisible(PAGE_SIZE), [search, filter, sort]);

  function patchUser(uid: string, patch: Partial<UserProfile>) {
    setUsers((list) => list.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("success", `${what} скопирован`);
    } catch {
      toast("error", "Не удалось скопировать");
    }
  }

  // ---- экспорт ----

  async function handleExport(format: "csv" | "json") {
    setExporting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/users/export?format=${format}`, { headers: { Authorization: `Bearer ${idToken}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Ошибка выгрузки");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("success", `Файл со всеми пользователями скачан (${format.toUpperCase()})`);
    } catch (err: any) {
      toast("error", err?.message || "Не удалось скачать список");
    } finally {
      setExporting(false);
    }
  }

  // ---- действия ----

  async function saveBalance() {
    if (!balanceTarget) return;
    const value = Number(balanceDraft.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      toast("error", "Некорректное значение баланса");
      return;
    }
    setBusy(true);
    try {
      await setUserBalance(balanceTarget.uid, Math.round(value * 100) / 100);
      patchUser(balanceTarget.uid, { balance: Math.round(value * 100) / 100 });
      toast("success", "Баланс обновлён");
      setBalanceTarget(null);
    } catch {
      toast("error", "Не удалось обновить баланс");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBan() {
    if (!banTarget) return;
    setBusy(true);
    try {
      const until = banDuration === "forever" ? "forever" : Date.now() + banDuration;
      await setUserBan(banTarget.uid, true, banReason.trim() || undefined, until);
      patchUser(banTarget.uid, { banned: true, banReason: banReason.trim() || undefined, banUntil: until });
      toast("warning", "Пользователь заблокирован");
      setBanTarget(null);
    } catch {
      toast("error", "Не удалось заблокировать");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnban(u: UserProfile) {
    try {
      await setUserBan(u.uid, false, undefined, null);
      patchUser(u.uid, { banned: false, banReason: undefined, banUntil: null });
      toast("success", "Пользователь разблокирован");
    } catch {
      toast("error", "Не удалось разблокировать");
    }
  }

  async function handleStaffRoleChange(u: UserProfile, role: "manager" | "helper" | "") {
    const value = role === "" ? null : role;
    try {
      await setStaffRole(u.uid, value);
      patchUser(u.uid, { staffRole: value });
      toast("success", value ? `Роль назначена: ${value === "manager" ? "менеджер" : "помощник"}` : "Роль снята");
    } catch {
      toast("error", "Не удалось изменить роль");
    }
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
      toast("success", "Сессия разорвана — при следующем действии потребуется вход заново");
    } catch {
      toast("error", "Не удалось связаться с сервером");
    }
  }

  function openNickEditor(u: UserProfile) {
    setEditingNick(u);
    setNickDraft({ displayName: u.displayName, nameColor: u.nameColor ?? "default", nameFont: u.nameFont ?? "default" });
  }

  async function saveNick() {
    if (!editingNick) return;
    setSavingNick(true);
    try {
      await adminUpdateNickname(editingNick.uid, {
        displayName: nickDraft.displayName,
        nameColor: nickDraft.nameColor,
        nameFont: nickDraft.nameFont,
      });
      patchUser(editingNick.uid, { displayName: nickDraft.displayName.trim(), nameColor: nickDraft.nameColor, nameFont: nickDraft.nameFont });
      toast("success", "Ник обновлён");
      setEditingNick(null);
    } catch (err: any) {
      toast("error", err?.code === "invalid-name" ? err.message : "Не удалось сохранить ник");
    } finally {
      setSavingNick(false);
    }
  }

  function openBadgeEditor(u: UserProfile) {
    setEditingBadges(u);
    setDraftBadges(u.badges);
  }

  async function saveBadges() {
    if (!editingBadges) return;
    setSavingBadges(true);
    try {
      await setUserBadges(editingBadges.uid, draftBadges);
      patchUser(editingBadges.uid, { badges: draftBadges });
      toast("success", "Метки обновлены");
      setEditingBadges(null);
    } catch (err: any) {
      toast("error", err?.code === "permission-denied" ? "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ." : "Не удалось сохранить метки");
    } finally {
      setSavingBadges(false);
    }
  }

  const FILTERS: { id: Filter; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "all", label: "Все", count: stats.total, icon: <Users size={13} /> },
    { id: "online", label: "В сети", count: stats.online, icon: <Wifi size={13} /> },
    { id: "new", label: "Новые (7 дн)", count: stats.fresh, icon: <UserPlus size={13} /> },
    { id: "banned", label: "Заблокированы", count: stats.banned, icon: <Ban size={13} /> },
    { id: "staff", label: "Персонал", count: stats.staff, icon: <ShieldCheck size={13} /> },
    { id: "unverified", label: "Email не подтверждён", count: stats.unverified, icon: <Mail size={13} /> },
  ];

  const shown = filtered.slice(0, visible);

  return (
    <div className="space-y-5">
      <div ref={listTopRef} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Пользователи</h1>
          <p className="text-sm text-white/40">Нажми на человека — откроется полная карточка со всей информацией и действиями.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport("csv")} disabled={exporting} className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
            <Download size={15} /> {exporting ? "Готовим файл..." : "Скачать всех (CSV)"}
          </button>
          <button onClick={() => handleExport("json")} disabled={exporting} className="btn-secondary px-3 py-2.5 text-sm disabled:opacity-50" title="Скачать в формате JSON">
            JSON
          </button>
        </div>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Всего", value: stats.total, color: undefined },
          { label: "Сейчас в сети", value: stats.online, color: "#4caf50" },
          { label: "Новых за 7 дней", value: stats.fresh, color: "#2196f3" },
          { label: "Заблокировано", value: stats.banned, color: "#f44336" },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <p className="text-2xl font-bold leading-none" style={{ color: s.value && s.color ? s.color : undefined }}>
              {loading ? "–" : s.value}
            </p>
            <p className="text-xs text-white/40 mt-1.5">{s.label}</p>
          </div>
        ))}
      </div>

      {highlightUid && (
        <div className="flex items-center justify-between p-3 rounded-btn bg-accent/10 border border-accent/20 text-sm">
          <span className="text-white/60">Показан конкретный пользователь по ссылке из другого раздела</span>
          <button onClick={() => { setSelectedUid(null); router.push("/admin/users"); }} className="text-accent hover:underline flex items-center gap-1">
            <X size={13} /> Показать всех
          </button>
        </div>
      )}

      {/* Поиск, фильтры, сортировка */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск: ник, @username, email или UID"
              className="input-field pl-9 py-2.5 text-sm"
            />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input-field py-2.5 text-sm sm:w-56">
            <option value="new">Сначала новые</option>
            <option value="active">Сначала активные</option>
            <option value="balance">По балансу</option>
            <option value="name">По имени (А–Я)</option>
          </select>
        </div>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f.id ? "bg-accent text-black" : "bg-white/5 text-white/55 hover:bg-white/10"
              }`}
            >
              {f.icon} {f.label}
              <span className={`text-[10px] font-bold ${filter === f.id ? "text-black/60" : "text-white/35"}`}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Список */}
      <div className="card divide-y divide-border/50 overflow-hidden">
        {loading ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="h-[68px] animate-pulse bg-white/[0.02]" />)
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-white/40 text-sm">Пользователи не найдены</p>
        ) : (
          shown.map((u) => (
            <button
              key={u.uid}
              onClick={() => setSelectedUid(u.uid)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors ${
                u.uid === selectedUid ? "bg-accent/[0.06]" : ""
              }`}
            >
              <div className="relative">
                <Avatar u={u} />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${isOnline(u) ? "bg-green-400" : "bg-white/20"}`}
                  title={lastSeen(u)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate max-w-[200px]">
                    <StyledNickname name={u.displayName} nameColor={u.nameColor} nameFont={u.nameFont} />
                  </span>
                  {u.username && <span className="text-xs text-white/35">@{u.username}</span>}
                  {u.banned && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">БАН</span>}
                  {u.staffRole && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                      {u.staffRole === "manager" ? "МЕНЕДЖЕР" : "ПОМОЩНИК"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/40 truncate">
                  {u.email} · {lastSeen(u)}
                </p>
              </div>
              <div className="hidden md:flex gap-1 flex-wrap max-w-[200px] justify-end">
                {u.badges.filter((b) => b !== "user").slice(0, 3).map((b) => (
                  <span key={b} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${BADGE_COLOR[b]}22`, color: BADGE_COLOR[b] }}>
                    {BADGE_LABEL[b]}
                  </span>
                ))}
              </div>
              <div className="text-right shrink-0 w-24">
                <p className="font-semibold text-sm">{u.balance.toFixed(2)} ₽</p>
                <p className="text-[10px] text-white/30">{new Date(u.createdAt).toLocaleDateString("ru-RU")}</p>
              </div>
              <ChevronRight size={16} className="text-white/20 shrink-0" />
            </button>
          ))
        )}
      </div>

      {!loading && filtered.length > visible && (
        <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="btn-secondary w-full py-2.5 text-sm">
          Показать ещё ({filtered.length - visible})
        </button>
      )}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-white/30 text-center">Показано {Math.min(visible, filtered.length)} из {filtered.length}</p>
      )}

      {/* Карточка пользователя */}
      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={() => setSelectedUid(null)}>
          <div
            className="w-full sm:max-w-md h-full bg-bg border-l border-border overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border px-5 py-4 flex items-center gap-3">
              <Avatar u={selected} size={48} />
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">
                  <StyledNickname name={selected.displayName} nameColor={selected.nameColor} nameFont={selected.nameFont} />
                </p>
                <p className="text-xs text-white/40">
                  {selected.username ? `@${selected.username} · ` : ""}
                  <span className={isOnline(selected) ? "text-green-400" : ""}>{lastSeen(selected)}</span>
                </p>
              </div>
              <button onClick={() => setSelectedUid(null)} className="p-2 rounded-md hover:bg-white/10 text-white/50">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Статус */}
              {selected.banned ? (
                <div className="rounded-btn bg-red-500/10 border border-red-500/20 p-3 text-sm">
                  <p className="font-semibold text-red-400 flex items-center gap-1.5"><Ban size={14} /> Аккаунт заблокирован</p>
                  <p className="text-white/60 mt-1">
                    Причина: {selected.banReason || "не указана"} · срок:{" "}
                    {selected.banUntil === "forever" || !selected.banUntil ? "навсегда" : `до ${fullDate(selected.banUntil as number)}`}
                  </p>
                </div>
              ) : (
                <div className="rounded-btn bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400 font-medium flex items-center gap-1.5">
                  <CheckCircle size={14} /> Аккаунт активен
                </div>
              )}

              {/* Быстрые действия */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    icon: <MessageCircle size={16} />, label: "Написать",
                    onClick: () => router.push(`/chats?dm=${selected.uid}&name=${encodeURIComponent(selected.displayName)}&photo=${encodeURIComponent(selected.photoURL ?? "")}`),
                  },
                  { icon: <Wallet size={16} />, label: "Баланс", onClick: () => { setBalanceTarget(selected); setBalanceDraft(String(selected.balance)); } },
                  { icon: <Palette size={16} />, label: "Ник", onClick: () => openNickEditor(selected) },
                  { icon: <Tag size={16} />, label: "Метки", onClick: () => openBadgeEditor(selected) },
                  { icon: <PowerOff size={16} />, label: "Кикнуть", onClick: () => handleKick(selected) },
                  selected.banned
                    ? { icon: <CheckCircle size={16} />, label: "Разбанить", onClick: () => handleUnban(selected) }
                    : { icon: <Ban size={16} />, label: "Забанить", onClick: () => { setBanTarget(selected); setBanReason(""); setBanDuration("forever"); } },
                ].map((a) => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-btn bg-white/5 hover:bg-white/10 text-white/70 text-xs transition-colors"
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => router.push(`/admin/messages?uid=${selected.uid}`)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-btn bg-white/5 hover:bg-white/10 text-sm text-white/70 transition-colors"
              >
                <Eye size={15} /> Читать переписки пользователя
              </button>

              <Section icon={<Hash size={13} />} title="Основное">
                <Row label="UID">
                  <button onClick={() => copy(selected.uid, "UID")} className="inline-flex items-center gap-1 font-mono text-xs text-white/70 hover:text-accent">
                    {selected.uid.slice(0, 10)}… <Copy size={11} />
                  </button>
                </Row>
                <Row label="Email">
                  <button onClick={() => copy(selected.email, "Email")} className="inline-flex items-center gap-1 hover:text-accent">
                    {selected.email} <Copy size={11} />
                  </button>
                </Row>
                <Row label="Email подтверждён">
                  {selected.emailVerified ? <span className="text-green-400">Да</span> : <span className="text-yellow-400">Нет</span>}
                </Row>
                <Row label="Юзернейм">
                  {selected.username ? (
                    <Link href={`/seller/${selected.username}`} target="_blank" className="inline-flex items-center gap-1 text-accent hover:underline">
                      @{selected.username} <ExternalLink size={11} />
                    </Link>
                  ) : (
                    <span className="text-white/30">не задан</span>
                  )}
                </Row>
                <Row label="Возраст">{selected.age ?? "—"}</Row>
                <Row label="Язык">{selected.language ? selected.language.toUpperCase() : "—"}</Row>
                {selected.bio && <Row label="О себе">{selected.bio}</Row>}
              </Section>

              <Section icon={<Clock size={13} />} title="Активность">
                <Row label="Регистрация">{fullDate(selected.createdAt)}</Row>
                <Row label="Последний вход">{fullDate(selected.lastLoginAt)}</Row>
                <Row label="Последняя активность">{selected.lastActiveAt ? `${fullDate(selected.lastActiveAt)} (${timeAgo(selected.lastActiveAt)})` : "—"}</Row>
                <Row label="Смена ника">{selected.lastNameChangeAt ? fullDate(selected.lastNameChangeAt) : "не менял"}</Row>
                <Row label="Смена аватара">{selected.lastAvatarChangeAt ? fullDate(selected.lastAvatarChangeAt) : "не менял"}</Row>
              </Section>

              <Section icon={<Wallet size={13} />} title="Деньги">
                <Row label="Баланс"><span className="font-semibold text-accent">{selected.balance.toFixed(2)} ₽</span></Row>
                <Row label="Баланс ⭐ (кошелёк для покупок)">{selected.starsWallet ?? 0} ⭐</Row>
                <Row label="Stars с продаж (вывод в боте)">{selected.starsBalance ?? 0} ⭐</Row>
              </Section>

              <Section icon={<Star size={13} />} title="Репутация и достижения">
                <Row label="Рейтинг продавца">
                  {selected.ratingCount ? `${((selected.ratingSum ?? 0) / selected.ratingCount).toFixed(1)} ★ (${selected.ratingCount} отзывов)` : "нет отзывов"}
                </Row>
                <Row label="Достижений получено">{selected.unlockedAchievements?.length ?? 0}</Row>
                <Row label="Прокруток колеса">{selected.wheelSpinsCount ?? 0}{selected.lastWheelSpinAt ? ` · последняя ${timeAgo(selected.lastWheelSpinAt)}` : ""}</Row>
              </Section>

              <Section icon={<Gift size={13} />} title="Рефералы">
                <Row label="Реферальный код">{selected.referralCode ?? "—"}</Row>
                <Row label="Пригласил(а)">
                  {selected.referredBy ? (
                    <button onClick={() => setSelectedUid(selected.referredBy!)} className="text-accent hover:underline">
                      {byUid.get(selected.referredBy)?.displayName ?? selected.referredBy.slice(0, 8) + "…"}
                    </button>
                  ) : (
                    <span className="text-white/30">никто</span>
                  )}
                </Row>
                <Row label="Пригласил(а) людей">{users.filter((x) => x.referredBy === selected.uid).length}</Row>
              </Section>

              <Section icon={<ShieldAlert size={13} />} title="Безопасность и уведомления">
                <Row label="Двухфакторная защита">{selected.twoFactorEnabled ? <span className="text-green-400">Включена</span> : <span className="text-white/40">Нет</span>}</Row>
                <Row label="Push по категориям">
                  {(() => {
                    const c = selected.pushCategories ?? DEFAULT_PUSH_CATEGORIES;
                    const on = [c.purchases !== false && "покупки", c.messages !== false && "сообщения", c.reminders !== false && "напоминания", c.news !== false && "новости"].filter(Boolean);
                    return on.length ? on.join(", ") : "всё выключено";
                  })()}
                </Row>
              </Section>

              <Section icon={<BadgeCheck size={13} />} title="Метки и роль">
                <div className="flex gap-1.5 flex-wrap">
                  {selected.badges.map((b) => (
                    <span key={b} className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${BADGE_COLOR[b]}22`, color: BADGE_COLOR[b] }}>
                      {BADGE_LABEL[b]}
                    </span>
                  ))}
                </div>
                <div className="pt-1">
                  <p className="text-xs text-white/40 mb-1.5 flex items-center gap-1"><UserCog size={12} /> Роль персонала (доступа к админке не даёт)</p>
                  <select
                    value={selected.staffRole ?? ""}
                    onChange={(e) => handleStaffRoleChange(selected, e.target.value as "manager" | "helper" | "")}
                    className="input-field py-2 text-sm w-full"
                  >
                    <option value="">— нет —</option>
                    <option value="manager">Менеджер (поддержка)</option>
                    <option value="helper">Помощник (выдача призов)</option>
                  </select>
                </div>
              </Section>
            </div>
          </div>
        </div>
      )}

      {/* Баланс */}
      {balanceTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setBalanceTarget(null)}>
          <div className="card p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Баланс — {balanceTarget.displayName}</h2>
            <p className="text-xs text-white/40">Сейчас: {balanceTarget.balance.toFixed(2)} ₽. Введи новое значение или добавь быстрой кнопкой.</p>
            <input
              autoFocus
              inputMode="decimal"
              value={balanceDraft}
              onChange={(e) => setBalanceDraft(e.target.value)}
              className="input-field py-2.5 text-sm"
            />
            <div className="flex gap-1.5 flex-wrap">
              {[-500, -100, 100, 500, 1000].map((d) => (
                <button
                  key={d}
                  onClick={() => setBalanceDraft(String(Math.max(0, (Number(balanceDraft.replace(",", ".")) || 0) + d)))}
                  className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-xs"
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={saveBalance} disabled={busy} className="btn-primary px-5 py-2.5 text-sm flex-1 disabled:opacity-50">Сохранить</button>
              <button onClick={() => setBalanceTarget(null)} className="btn-secondary px-5 py-2.5 text-sm">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Бан */}
      {banTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setBanTarget(null)}>
          <div className="card p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Заблокировать {banTarget.displayName}?</h2>
            <div>
              <p className="text-xs text-white/40 mb-2">Причина (увидит пользователь)</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {BAN_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setBanReason(r)}
                    className={`px-2.5 py-1 rounded-full text-[11px] ${banReason === r ? "bg-accent text-black font-medium" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Или своя причина" className="input-field py-2 text-sm w-full" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-2">Срок</p>
              <div className="flex gap-1.5 flex-wrap">
                {BAN_DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    onClick={() => setBanDuration(d.value)}
                    className={`px-3 py-1.5 rounded-full text-xs ${banDuration === d.value ? "bg-red-500 text-white font-medium" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={confirmBan} disabled={busy} className="flex-1 px-5 py-2.5 text-sm rounded-btn bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50">
                Заблокировать
              </button>
              <button onClick={() => setBanTarget(null)} className="btn-secondary px-5 py-2.5 text-sm">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Метки */}
      {editingBadges && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingBadges(null)}>
          <div className="card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Метки — {editingBadges.displayName}</h2>
              <button onClick={() => setEditingBadges(null)} className="text-white/40 hover:text-white/80"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {ALL_BADGES.map((b) => {
                const active = draftBadges.includes(b);
                return (
                  <button
                    key={b}
                    onClick={() => setDraftBadges((list) => (list.includes(b) ? list.filter((x) => x !== b) : [...list, b]))}
                    className={`text-left text-sm px-3 py-2 rounded-btn border transition-colors flex items-center gap-2 ${active ? "border-transparent" : "border-border text-white/50 hover:bg-white/5"}`}
                    style={active ? { background: `${BADGE_COLOR[b]}22`, color: BADGE_COLOR[b] } : undefined}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BADGE_COLOR[b] }} />
                    {BADGE_LABEL[b]}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={saveBadges} disabled={savingBadges} className="btn-primary px-5 py-2.5 text-sm flex-1 disabled:opacity-50">{savingBadges ? "Сохраняем..." : "Сохранить"}</button>
              <button onClick={() => setEditingBadges(null)} className="btn-secondary px-5 py-2.5 text-sm">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Ник */}
      {editingNick && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditingNick(null)}>
          <div className="card p-6 max-w-md w-full space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Ник — {editingNick.displayName}</h2>
              <button onClick={() => setEditingNick(null)} className="text-white/40 hover:text-white/80"><X size={18} /></button>
            </div>
            <div className="text-center py-3 rounded-btn bg-surface">
              <p className="text-xs text-white/30 mb-1.5">Предпросмотр</p>
              <p className="text-xl"><StyledNickname name={nickDraft.displayName || "Ник"} nameColor={nickDraft.nameColor} nameFont={nickDraft.nameFont} /></p>
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1.5">Имя</p>
              <input autoComplete="off" value={nickDraft.displayName} onChange={(e) => setNickDraft((d) => ({ ...d, displayName: e.target.value }))} className="input-field py-2 text-sm" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1.5">Цвет</p>
              <div className="flex flex-wrap gap-1.5">
                {NICKNAME_COLOR_PRESETS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setNickDraft((d) => ({ ...d, nameColor: c.id }))}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${nickDraft.nameColor === c.id ? "border-white/60" : "border-transparent bg-white/5 hover:bg-white/10"}`}
                    style={c.color ? { color: c.color, background: nickDraft.nameColor === c.id ? `${c.color}22` : undefined } : undefined}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1.5">Шрифт</p>
              <select value={nickDraft.nameFont} onChange={(e) => setNickDraft((d) => ({ ...d, nameFont: e.target.value }))} className="input-field py-2 text-sm w-full">
                {NICKNAME_FONT_PRESETS.map((f) => (<option key={f.id} value={f.id}>{f.label}</option>))}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={saveNick} disabled={savingNick} className="btn-primary px-5 py-2.5 text-sm flex-1 disabled:opacity-50">{savingNick ? "Сохраняем..." : "Сохранить"}</button>
              <button onClick={() => setEditingNick(null)} className="btn-secondary px-5 py-2.5 text-sm">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-white/40">Загрузка...</div>}>
      <AdminUsersInner />
    </Suspense>
  );
}
