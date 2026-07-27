"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Power, Snowflake, Sun, Sparkles } from "lucide-react";
import { getAllEvents, createEvent, updateEvent, deleteEvent } from "@/lib/events";
import { SiteEvent } from "@/types";
import { useToast } from "@/lib/toastContext";

type FormState = {
  name: string;
  bonusRub: number;
  theme: "winter" | "summer" | "none";
  active: boolean;
};

const EMPTY_FORM: FormState = { name: "", bonusRub: 15, theme: "none", active: false };

const THEME_ICON = { winter: Snowflake, summer: Sun, none: Sparkles };
const THEME_LABEL = { winter: "Зимнее оформление", summer: "Летнее оформление", none: "Без оформления" };

export default function AdminEventsPage() {
  const { toast } = useToast();
  const [events, setEvents] = useState<SiteEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setEvents(await getAllEvents());
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast("warning", "Укажи название ивента");
      return;
    }
    try {
      await createEvent(form);
      toast("success", `Ивент «${form.name}» создан`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await refresh();
    } catch {
      toast("error", "Не удалось создать ивент");
    }
  }

  async function toggleActive(ev: SiteEvent) {
    await updateEvent(ev.id, { active: !ev.active });
    await refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить этот ивент?")) return;
    await deleteEvent(id);
    await refresh();
  }

  function createPreset(name: string, bonusRub: number, theme: FormState["theme"]) {
    setForm({ name, bonusRub, theme, active: false });
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">Ивенты</h1>
          <p className="text-sm text-white/40">
            Сезонные события: тематическое оформление сайта + бонус на баланс, который пользователь получает один раз
            за ивент. Обычно активен один ивент за раз — включай/выключай кнопкой.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary px-4 py-2.5 flex items-center gap-2">
          <Plus size={16} /> Новый ивент
        </button>
      </div>

      {events.length === 0 && !loading && (
        <div className="card p-5 flex flex-wrap gap-3">
          <p className="text-sm text-white/40 w-full mb-1">Быстрый старт — готовые заготовки:</p>
          <button onClick={() => createPreset("Зима", 15, "winter")} className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
            <Snowflake size={14} /> Зима (+15 ₽)
          </button>
          <button onClick={() => createPreset("Лето", 18, "summer")} className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
            <Sun size={14} /> Лето (+18 ₽)
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              placeholder="Название (например Зима)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field py-2.5"
            />
            <input
              type="number"
              min={0}
              placeholder="Бонус на баланс, ₽"
              value={form.bonusRub}
              onChange={(e) => setForm({ ...form, bonusRub: Number(e.target.value) })}
              className="input-field py-2.5"
            />
          </div>
          <select
            value={form.theme}
            onChange={(e) => setForm({ ...form, theme: e.target.value as FormState["theme"] })}
            className="input-field py-2.5 w-full"
          >
            <option value="none">Без оформления</option>
            <option value="winter">Зимнее оформление (снег)</option>
            <option value="summer">Летнее оформление (солнце)</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-white/60">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Сделать активным сразу
          </label>
          <div className="flex gap-2">
            <button className="btn-primary px-5 py-2.5 text-sm">Создать</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2.5 text-sm">
              Отмена
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : events.length === 0 ? (
        <div className="card p-10 text-center text-white/40">Ивентов пока нет — создай первый выше.</div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const Icon = THEME_ICON[ev.theme];
            return (
              <div key={ev.id} className={`card p-4 flex items-center justify-between gap-4 ${ev.active ? "border-accent/50" : ""}`}>
                <div className="flex items-center gap-3">
                  <Icon size={20} className={ev.active ? "text-accent" : "text-white/30"} />
                  <div>
                    <p className="font-medium">{ev.name}</p>
                    <p className="text-xs text-white/40">
                      +{ev.bonusRub} ₽ на баланс · {THEME_LABEL[ev.theme]} · {ev.active ? "Активен" : "Выключен"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(ev)}
                    className={`px-3 py-2 rounded-btn text-sm flex items-center gap-1.5 ${ev.active ? "bg-accent text-black" : "btn-secondary"}`}
                  >
                    <Power size={14} /> {ev.active ? "Выключить" : "Включить"}
                  </button>
                  <button onClick={() => handleDelete(ev.id)} className="p-2 rounded-btn hover:bg-white/5 text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
