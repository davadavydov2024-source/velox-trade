"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Power } from "lucide-react";
import { getAllSiteScreens, saveSiteScreen } from "@/lib/siteScreens";
import { SiteScreen, SiteScreenButton } from "@/types";
import { ImageUploadField } from "@/components/ImageUploadField";
import { SiteScreenView } from "@/components/SiteScreenView";
import { useToast } from "@/lib/toastContext";

const TABS: { id: SiteScreen["id"]; label: string; hint: string }[] = [
  { id: "global", label: "Весь сайт (тех.перерыв)", hint: "Закрывает вообще весь сайт для всех, кроме админов." },
  { id: "support", label: "Поддержка", hint: "Показывается вместо раздела поддержки в «Чатах»." },
  { id: "topup", label: "Пополнение", hint: "Показывается вместо страницы пополнения баланса." },
  { id: "notfound", label: "Страница 404", hint: "Показывается вместо стандартной страницы «не найдено»." },
];

function empty(id: SiteScreen["id"]): SiteScreen {
  return {
    id,
    enabled: false,
    image: "",
    title: id === "notfound" ? "Страница потерялась" : "Технический перерыв",
    description: "",
    buttons: [],
    updatedAt: 0,
  };
}

export default function AdminMaintenancePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<SiteScreen["id"]>("global");
  const [screens, setScreens] = useState<Record<string, SiteScreen>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAllSiteScreens()
      .then((list) => {
        const map: Record<string, SiteScreen> = {};
        for (const s of list) map[s.id] = s;
        setScreens(map);
      })
      .finally(() => setLoading(false));
  }, []);

  const current = screens[tab] ?? empty(tab);

  function update(patch: Partial<SiteScreen>) {
    setScreens((prev) => ({ ...prev, [tab]: { ...current, ...patch } }));
  }

  function updateButton(i: number, patch: Partial<SiteScreenButton>) {
    const buttons = current.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    update({ buttons });
  }

  function addButton() {
    if (current.buttons.length >= 10) {
      toast("warning", "Максимум 10 кнопок");
      return;
    }
    update({ buttons: [...current.buttons, { text: "", link: "" }] });
  }

  function removeButton(i: number) {
    update({ buttons: current.buttons.filter((_, idx) => idx !== i) });
  }

  async function handleSave() {
    if (!current.title.trim()) {
      toast("warning", "Заполни заголовок");
      return;
    }
    setSaving(true);
    try {
      await saveSiteScreen(current);
      toast("success", current.enabled ? "Сохранено и включено" : "Сохранено");
    } catch (err: any) {
      toast("error", err?.code === "permission-denied" ? "Нет прав на запись" : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="card p-8 text-center text-white/40">Загрузка...</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Закрывающие экраны</h1>
        <p className="text-sm text-white/40">Тех.перерыв, недоступность поддержки/пополнения, кастомная 404 — с картинкой и кнопками.</p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-xs font-medium px-3 py-2 rounded-btn transition-colors ${
              tab === t.id ? "bg-accent text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5 space-y-4">
          <p className="text-xs text-white/40">{TABS.find((t) => t.id === tab)?.hint}</p>

          <div className="flex items-center justify-between p-3 rounded-btn bg-white/5">
            <div className="flex items-center gap-2">
              <Power size={16} className={current.enabled ? "text-accent" : "text-white/30"} />
              <span className="text-sm font-medium">{current.enabled ? "Включено — экран показывается" : "Выключено"}</span>
            </div>
            <button
              onClick={() => update({ enabled: !current.enabled })}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${current.enabled ? "bg-accent" : "bg-white/15"}`}
              type="button"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${current.enabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          <ImageUploadField value={current.image} onChange={(v) => update({ image: v })} folder="site-screens" label="Картинка" size={96} />

          <div>
            <label className="text-xs text-white/40 mb-1 block">Заголовок</label>
            <input
              autoComplete="off"
              value={current.title}
              onChange={(e) => update({ title: e.target.value })}
              className="input-field py-2.5"
            />
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Описание</label>
            <textarea value={current.description} onChange={(e) => update({ description: e.target.value })} rows={3} className="input-field py-2.5" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-white/40">Кнопки ({current.buttons.length}/10)</label>
              <button onClick={addButton} className="text-accent text-xs flex items-center gap-1 hover:underline">
                <Plus size={13} /> Добавить
              </button>
            </div>
            <div className="space-y-2">
              {current.buttons.map((btn, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    autoComplete="off"
                    value={btn.text}
                    onChange={(e) => updateButton(i, { text: e.target.value })}
                    placeholder="Текст"
                    className="input-field py-2 text-sm flex-1"
                  />
                  <input
                    autoComplete="off"
                    value={btn.link}
                    onChange={(e) => updateButton(i, { link: e.target.value })}
                    placeholder="Ссылка (/catalog или https://...)"
                    className="input-field py-2 text-sm flex-[1.4]"
                  />
                  <button onClick={() => removeButton(i)} className="p-2 rounded-btn hover:bg-white/10 text-red-400 shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {current.buttons.length === 0 && <p className="text-xs text-white/30">Кнопок пока нет</p>}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2.5 text-sm disabled:opacity-50">
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>

        <div className="card overflow-hidden">
          <p className="text-xs text-white/40 p-3 border-b border-border">Предпросмотр</p>
          <SiteScreenView screen={{ ...current, buttons: current.buttons.filter((b) => b.text.trim()) }} />
        </div>
      </div>
    </div>
  );
}
