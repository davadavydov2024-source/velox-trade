"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, Edit3, X, Tags, Sparkles, ShieldCheck } from "lucide-react";
import { getGames, createGame, updateGame, deleteGame } from "@/lib/products";
import { GAME_CATEGORY_TEMPLATES } from "@/lib/gameCategoryTemplates";
import { fetchAiCategories } from "@/lib/gamesAi";
import { Game } from "@/types";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { ImageUploadField } from "@/components/ImageUploadField";

const EMPTY: Omit<Game, "id"> = { name: "", slug: "", image: "", categories: [], aiAllowed: "", aiForbidden: "" };

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Game | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [categoryInput, setCategoryInput] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setGames(await getGames());
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setCategoryInput("");
    setShowTemplates(false);
    setShowForm(true);
  }

  function openEdit(g: Game) {
    setEditing(g);
    setForm({ name: g.name, slug: g.slug, image: g.image, categories: g.categories ?? [], aiAllowed: g.aiAllowed ?? "", aiForbidden: g.aiForbidden ?? "" });
    setCategoryInput("");
    setShowTemplates(false);
    setShowForm(true);
  }

  function addCategory() {
    const value = categoryInput.trim();
    if (!value) return;
    if ((form.categories ?? []).includes(value)) {
      toast("warning", "Такая категория уже добавлена");
      return;
    }
    setForm((f) => ({ ...f, categories: [...(f.categories ?? []), value] }));
    setCategoryInput("");
  }

  function removeCategory(value: string) {
    setForm((f) => ({ ...f, categories: (f.categories ?? []).filter((c) => c !== value) }));
  }

  function applyTemplate(categories: string[]) {
    // Добавляет к уже введённым категориям, не затирая их — админ мог что-то вписать вручную до
    // того, как решил ещё и вставить шаблон. Дубликаты (по точному совпадению) пропускаются.
    setForm((f) => {
      const existing = f.categories ?? [];
      const merged = [...existing, ...categories.filter((c) => !existing.includes(c))];
      return { ...f, categories: merged };
    });
    setShowTemplates(false);
  }

  /** Кнопка «ИИ»: подбирает категории и (если поля пусты) черновик правил модерации — всё попадает в форму, ничего не сохраняется само. */
  async function handleAiCategories() {
    const name = form.name.trim();
    if (!name) {
      toast("warning", "Сначала укажи название игры");
      return;
    }
    setAiBusy(true);
    try {
      const s = await fetchAiCategories(name, form.slug || undefined, form.categories ?? []);
      setForm((f) => ({
        ...f,
        categories: [...(f.categories ?? []), ...s.categories.filter((c) => !(f.categories ?? []).includes(c))],
        aiAllowed: f.aiAllowed?.trim() ? f.aiAllowed : s.allowed,
        aiForbidden: f.aiForbidden?.trim() ? f.aiForbidden : s.forbidden,
      }));
      toast("success", `ИИ предложил категорий: ${s.categories.length}. Проверь и сохрани`);
    } catch (err: any) {
      toast("error", err?.message || "ИИ недоступен");
    } finally {
      setAiBusy(false);
    }
  }

  /** Один клик: ИИ заполняет категории у всех игр, где их ещё нет (правила модерации не трогает). */
  async function handleBulkAi() {
    const targets = games.filter((g) => !g.categories || g.categories.length === 0);
    if (targets.length === 0) {
      toast("info", "У всех игр уже есть категории");
      return;
    }
    if (!confirm(`ИИ подберёт категории для игр без них: ${targets.length} шт. Продолжить?`)) return;
    setBulkBusy(true);
    let done = 0;
    for (const g of targets) {
      try {
        const s = await fetchAiCategories(g.name, g.slug, []);
        await updateGame(g.id, { categories: s.categories });
        done++;
      } catch (err: any) {
        toast("warning", `«${g.name}»: ${err?.message || "не удалось"}`);
        if (/не настроен/i.test(err?.message ?? "")) break; // без ключей дальше бессмысленно
      }
    }
    setBulkBusy(false);
    toast(done ? "success" : "warning", `Категории подобраны для игр: ${done} из ${targets.length}`);
    refresh();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.image && !isValidImageSrc(form.image)) {
      toast("warning", "Ссылка на изображение должна начинаться с http:// или https://");
      return;
    }
    try {
      if (editing) {
        await updateGame(editing.id, form);
        toast("success", "Игра обновлена");
      } else {
        let toCreate = form;
        // Новая игра без категорий — ИИ придумывает их автоматически (рабочая страница не блокируется
        // при сбое: игра просто создаётся без категорий, их можно добавить позже кнопкой «ИИ»).
        if (!form.categories || form.categories.length === 0) {
          try {
            const s = await fetchAiCategories(form.name.trim(), form.slug || undefined, []);
            toCreate = { ...form, categories: s.categories };
            toast("info", `ИИ подобрал категории: ${s.categories.join(", ")}`);
          } catch (err: any) {
            toast("warning", `Категории не подобраны автоматически: ${err?.message || "ИИ недоступен"}`);
          }
        }
        await createGame(toCreate);
        toast("success", "Игра добавлена");
      }
      setShowForm(false);
      refresh();
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Ошибка сохранения игры");
      }
      console.error(err);
    }
  }

  async function handleDelete(g: Game) {
    if (!confirm(`Удалить игру «${g.name}»? Товары этой игры останутся, но без категории.`)) return;
    await deleteGame(g.id);
    setGames((list) => list.filter((x) => x.id !== g.id));
    toast("success", "Игра удалена");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Игры</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleBulkAi} disabled={bulkBusy} className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
            <Sparkles size={15} /> {bulkBusy ? "ИИ работает..." : "ИИ: категории для всех без них"}
          </button>
          <button onClick={openCreate} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={16} /> Добавить игру
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card p-5 grid sm:grid-cols-2 gap-4">
          <input
            autoComplete="off"
            required
            placeholder="Название (напр. Adopt Me)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input-field py-2.5"
          />
          <input
            autoComplete="off"
            required
            placeholder="Slug (напр. adopt-me)"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="input-field py-2.5"
          />
          <div className="sm:col-span-2">
            <ImageUploadField value={form.image} onChange={(url) => setForm({ ...form, image: url })} folder="games" label="Изображение игры" />
          </div>

          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/40 flex items-center gap-1.5">
                <Tags size={13} /> Категории товаров для этой игры (необязательно)
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAiCategories}
                  disabled={aiBusy}
                  className="text-xs text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <Sparkles size={12} /> {aiBusy ? "ИИ думает..." : "Придумать с ИИ"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTemplates((v) => !v)}
                  className="text-xs text-white/50 hover:text-accent hover:underline flex items-center gap-1"
                >
                  Вставить шаблон
                </button>
              </div>
            </div>

            {showTemplates && (
              <div className="rounded-btn bg-surface p-2 flex flex-wrap gap-1.5">
                {GAME_CATEGORY_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t.categories)}
                    className="text-xs px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {(form.categories ?? []).map((c) => (
                <span key={c} className="text-xs pl-2.5 pr-1.5 py-1 rounded-full bg-accent/10 text-accent flex items-center gap-1">
                  {c}
                  <button type="button" onClick={() => removeCategory(c)} className="hover:text-white">
                    <X size={11} />
                  </button>
                </span>
              ))}
              {(form.categories ?? []).length === 0 && <p className="text-xs text-white/25">Категорий пока нет — товары этой игры будут без категорий</p>}
            </div>

            <div className="flex gap-2">
              <input
                autoComplete="off"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder="Своя категория и Enter…"
                className="input-field py-2 text-sm flex-1"
              />
              <button type="button" onClick={addCategory} className="btn-secondary px-3 py-2 text-sm">
                Добавить
              </button>
            </div>
          </div>

          <div className="sm:col-span-2 space-y-2">
            <p className="text-xs text-white/40 flex items-center gap-1.5">
              <ShieldCheck size={13} /> Правила для ИИ-модерации этой игры (необязательно)
            </p>
            <textarea
              value={form.aiAllowed ?? ""}
              onChange={(e) => setForm({ ...form, aiAllowed: e.target.value })}
              rows={3}
              maxLength={600}
              placeholder="Что МОЖНО продавать и пропускать (напр.: ножи, питомцы, внутриигровая валюта, услуги прокачки)"
              className="input-field py-2 text-sm w-full"
            />
            <textarea
              value={form.aiForbidden ?? ""}
              onChange={(e) => setForm({ ...form, aiForbidden: e.target.value })}
              rows={3}
              maxLength={600}
              placeholder="Что НЕЛЬЗЯ (напр.: аккаунты целиком, читы и скрипты, предметы из других игр)"
              className="input-field py-2 text-sm w-full"
            />
            <p className="text-[11px] text-white/25">
              ИИ видит эти правила и список всех игр сайта. «Нельзя» — отклоняет заявку, «Можно» — не даёт ИИ придираться к незнакомым предметам. Запреты на незаконное и обход площадки действуют всегда.
            </p>
          </div>

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
              <th className="p-3">Игра</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Категории</th>
              <th className="p-3">ИИ-правила</th>
              <th className="p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-white/40">
                  Загрузка...
                </td>
              </tr>
            ) : games.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-white/40">
                  Игры ещё не добавлены
                </td>
              </tr>
            ) : (
              games.map((g) => (
                <tr key={g.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="p-3 flex items-center gap-3">
                    <div className="relative w-9 h-9 rounded-lg bg-black/30 shrink-0">
                      {isValidImageSrc(g.image) && <Image src={safeImageSrc(g.image)} alt={g.name} fill className="object-cover rounded-lg" sizes="36px" />}
                    </div>
                    {g.name}
                  </td>
                  <td className="p-3 text-white/50">{g.slug}</td>
                  <td className="p-3 text-white/40 max-w-[240px]">
                    {g.categories && g.categories.length > 0 ? g.categories.join(", ") : "—"}
                  </td>
                  <td className="p-3 text-xs">
                    {g.aiAllowed || g.aiForbidden ? (
                      <span className="text-accent">
                        {g.aiAllowed ? "✓ можно " : ""}
                        {g.aiForbidden ? "✕ нельзя" : ""}
                      </span>
                    ) : (
                      <span className="text-white/25">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(g)} className="p-1.5 rounded-md hover:bg-white/10 text-white/60">
                        <Edit3 size={15} />
                      </button>
                      <button onClick={() => handleDelete(g)} className="p-1.5 rounded-md hover:bg-white/10 text-red-400">
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
