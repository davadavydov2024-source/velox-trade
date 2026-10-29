"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Save, Users, SlidersHorizontal, Megaphone, ToggleLeft, ToggleRight } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { MILIGRAM_BADGES, MILIGRAM_FLAG_ROWS, DEFAULT_MILIGRAM_CONFIG, MiliGramConfig, MiliGramProfile } from "@/lib/miligram";

type Row = { uid: string; displayName: string; username: string | null; email: string | null; photoURL: string | null; profile: MiliGramProfile | null };
type Tab = "users" | "flags" | "announce";

function GradientName({ name, from, to }: { name: string; from?: string | null; to?: string | null }) {
  if (!from || !to) return <span className="font-semibold">{name}</span>;
  return (
    <span className="font-semibold" style={{ background: `linear-gradient(90deg, ${from}, ${to})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
      {name}
    </span>
  );
}

function UserCard({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const { toast } = useToast();
  const p = row.profile;
  const [form, setForm] = useState({
    badge: p?.badge ?? "",
    gradientFrom: p?.gradientFrom ?? "",
    gradientTo: p?.gradientTo ?? "",
    borderColor: p?.borderColor ?? "",
    bannerURL: p?.bannerURL ?? "",
    banned: p?.banned ?? false,
    note: p?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const res = await authedFetch("/api/admin/miligram/users", { method: "POST", body: JSON.stringify({ uid: row.uid, patch: form }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("success", "Сохранено");
      onSaved();
    } catch (e: any) {
      toast("error", e?.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const badge = MILIGRAM_BADGES.find((b) => b.id === form.badge);
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-base"><GradientName name={row.displayName} from={form.gradientFrom} to={form.gradientTo} />
            {badge && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full text-white align-middle" style={{ background: badge.color }}>✓ {badge.label}</span>}
          </p>
          <p className="text-xs text-white/40 truncate">{[row.username && `@${row.username}`, row.email].filter(Boolean).join(" · ") || row.uid}</p>
          <p className="text-[11px] text-white/30">
            {p?.linkedAt ? `Привязан ${new Date(p.linkedAt).toLocaleDateString("ru-RU")} · версия ${p.appVersion || "?"}` : "Приложение не привязано (оформление можно выдать заранее)"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-red-300/80">
          <input autoComplete="off" type="checkbox" checked={form.banned} onChange={(e) => set("banned", e.target.checked)} /> Бан в MiliGram
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <select value={form.badge} onChange={(e) => set("badge", e.target.value)} className="input-field py-2 text-sm">
          <option value="">Без бейджа</option>
          {MILIGRAM_BADGES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <input autoComplete="off" value={form.bannerURL} onChange={(e) => set("bannerURL", e.target.value)} placeholder="Баннер: https://…" className="input-field py-2 text-sm" />
        {(["gradientFrom", "gradientTo", "borderColor"] as const).map((k) => (
          <div key={k} className="flex gap-2 items-center">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form[k]) ? form[k] : "#888888"} onChange={(e) => set(k, e.target.value)} className="w-10 h-9 rounded bg-transparent border border-border" />
            <input autoComplete="off" value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={k === "gradientFrom" ? "Ник: первый цвет" : k === "gradientTo" ? "Ник: второй цвет" : "Обводка аватарки"} className="input-field py-2 text-sm flex-1" />
          </div>
        ))}
        <input autoComplete="off" value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Заметка админа (видна только тебе)" className="input-field py-2 text-sm" />
      </div>
      <button onClick={save} disabled={saving} className="btn-primary px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
        <Save size={14} /> {saving ? "Сохранение..." : "Сохранить"}
      </button>
    </div>
  );
}

export default function AdminMiliGramPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("users");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<MiliGramConfig>(DEFAULT_MILIGRAM_CONFIG);
  const [savingCfg, setSavingCfg] = useState(false);

  const loadUsers = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/admin/miligram/users?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.rows);
    } catch (e: any) {
      toast("error", e?.message || "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
    authedFetch("/api/admin/miligram/config").then((r) => r.json()).then((d) => d.config && setConfig(d.config)).catch(() => {});
  }, [loadUsers]);

  async function saveConfig() {
    setSavingCfg(true);
    try {
      const res = await authedFetch("/api/admin/miligram/config", { method: "POST", body: JSON.stringify(config) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
      toast("success", "Настройки сохранены");
    } catch (e: any) {
      toast("error", e?.message || "Не удалось сохранить");
    } finally {
      setSavingCfg(false);
    }
  }

  const linked = rows.filter((r) => r.profile?.linkedAt).length;
  const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "users", label: "Пользователи", icon: Users },
    { id: "flags", label: "Функции", icon: SlidersHorizontal },
    { id: "announce", label: "Объявление", icon: Megaphone },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">MiliGram</h1>
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-full text-sm flex items-center gap-2 ${tab === t.id ? "bg-accent text-black font-medium" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <>
          <form onSubmit={(e) => { e.preventDefault(); loadUsers(q.trim()); }} className="flex gap-2">
            <input autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: email, @ник или имя пользователя Velox" className="input-field py-2.5 text-sm flex-1" />
            <button className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2"><Search size={14} /> Найти</button>
          </form>
          <p className="text-xs text-white/40">В списке: {rows.length} · из них с привязанным приложением: {linked}</p>
          {loading ? <div className="card p-8 text-center text-white/40">Загрузка...</div>
            : rows.length === 0 ? <div className="card p-8 text-center text-white/40">Никого нет. Найди пользователя Velox поиском — оформление можно выдать заранее.</div>
            : rows.map((r) => <UserCard key={r.uid + (r.profile?.updatedAt ?? 0)} row={r} onSaved={() => loadUsers(q.trim())} />)}
        </>
      )}

      {tab !== "users" && (
        <div className="card p-4 space-y-3">
          {tab === "flags" && (
            <>
              {MILIGRAM_FLAG_ROWS.map((row) => {
                const on = config.flags[row.key] !== false;
                return (
                  <button key={row.key} onClick={() => setConfig((c) => ({ ...c, flags: { ...c.flags, [row.key]: !on } }))} className="w-full flex items-center justify-between gap-3 text-left">
                    <span><span className="text-sm block">{row.label}</span><span className="text-xs text-white/40">{row.hint}</span></span>
                    {on ? <ToggleRight className="text-accent shrink-0" size={30} /> : <ToggleLeft className="text-white/30 shrink-0" size={30} />}
                  </button>
                );
              })}
              <div>
                <p className="text-xs text-white/40 mb-1">Минимальная версия приложения (пусто — без ограничения)</p>
                <input autoComplete="off" value={config.minVersion} onChange={(e) => setConfig((c) => ({ ...c, minVersion: e.target.value }))} placeholder="1.0.0" className="input-field py-2 text-sm max-w-[200px]" />
              </div>
            </>
          )}
          {tab === "announce" && (
            <>
              <textarea value={config.announcement.text} onChange={(e) => setConfig((c) => ({ ...c, announcement: { ...c.announcement, text: e.target.value } }))} maxLength={500} placeholder="Что нового в MiliGram… (до 500 символов)" className="input-field py-2 text-sm w-full min-h-[100px]" />
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input autoComplete="off" type="checkbox" checked={config.announcement.active} onChange={(e) => setConfig((c) => ({ ...c, announcement: { ...c.announcement, active: e.target.checked } }))} /> Показывать в приложении
              </label>
            </>
          )}
          <button onClick={saveConfig} disabled={savingCfg} className="btn-primary px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"><Save size={14} /> {savingCfg ? "Сохранение..." : "Сохранить"}</button>
        </div>
      )}
    </div>
  );
}
