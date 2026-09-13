"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, Edit3, X, Tags, Sparkles } from "lucide-react";
import { getGames, createGame, updateGame, deleteGame } from "@/lib/products";
import { GAME_CATEGORY_TEMPLATES } from "@/lib/gameCategoryTemplates";
import { Game } from "@/types";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import { ImageUploadField } from "@/components/ImageUploadField";

const EMPTY: Omit<Game, "id"> = { name: "", slug: "", image: "", categories: [] };

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Game | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [categoryInput, setCategoryInput] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
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
    setForm({ name: g.name, slug: g.slug, image: g.image, categories: g.categories ?? [] });
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
        await createGame(form);
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
        <button onClick={openCreate} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={16} /> Добавить игру
        </button>
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
              <button
                type="button"
                onClick={() => setShowTemplates((v) => !v)}
                className="text-xs text-accent hover:underline flex items-center gap-1"
              >
                <Sparkles size={12} /> Вставить шаблон
              </button>
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
            ) : games.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-white/40">
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
