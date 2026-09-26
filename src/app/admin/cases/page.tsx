"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, X, Boxes, Eye, EyeOff } from "lucide-react";
import { getAllCases, createCase, updateCase, deleteCase, setCaseItems } from "@/lib/cases";
import { ImageUploadField } from "@/components/ImageUploadField";
import { safeImageSrc } from "@/lib/safeImage";
import { CaseData, CaseItem } from "@/types";
import { useToast } from "@/lib/toastContext";

const EMPTY_CASE_FORM = { name: "", image: "", price: 100, active: true };
const EMPTY_ITEM_FORM = { name: "", image: "", value: 50, weight: 10 };

function genItemId() {
  return `it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminCasesPage() {
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [caseForm, setCaseForm] = useState(EMPTY_CASE_FORM);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setCases(await getAllCases());
    setLoading(false);
  }

  function openCreateCase() {
    setEditingCaseId(null);
    setCaseForm(EMPTY_CASE_FORM);
    setShowCaseForm(true);
  }

  function openEditCase(c: CaseData) {
    setEditingCaseId(c.id);
    setCaseForm({ name: c.name, image: c.image, price: c.price, active: c.active });
    setShowCaseForm(true);
  }

  async function handleSaveCase(e: React.FormEvent) {
    e.preventDefault();
    if (!caseForm.name.trim()) return toast("warning", "Укажи название кейса");
    if (!caseForm.image) return toast("warning", "Загрузи картинку кейса");
    if (caseForm.price <= 0) return toast("warning", "Цена открытия должна быть больше 0");
    try {
      if (editingCaseId) {
        await updateCase(editingCaseId, caseForm);
        toast("success", "Кейс обновлён");
      } else {
        await createCase(caseForm);
        toast("success", "Кейс создан — теперь добавь в него предметы");
      }
      setShowCaseForm(false);
      await refresh();
    } catch {
      toast("error", "Не удалось сохранить кейс");
    }
  }

  async function handleDeleteCase(id: string) {
    if (!confirm("Удалить кейс безвозвратно? История уже совершённых открытий не пострадает.")) return;
    await deleteCase(id);
    if (expandedCaseId === id) setExpandedCaseId(null);
    await refresh();
  }

  async function handleToggleActive(c: CaseData) {
    await updateCase(c.id, { active: !c.active });
    await refresh();
  }

  function openAddItem() {
    setEditingItemId(null);
    setItemForm(EMPTY_ITEM_FORM);
  }

  function openEditItem(item: CaseItem) {
    setEditingItemId(item.id);
    setItemForm({ name: item.name, image: item.image, value: item.value, weight: item.weight });
  }

  async function handleSaveItem(activeCase: CaseData) {
    if (!itemForm.name.trim()) return toast("warning", "Укажи название предмета");
    if (!itemForm.image) return toast("warning", "Загрузи картинку предмета");
    if (itemForm.weight <= 0) return toast("warning", "Шанс (вес) должен быть больше 0");
    if (itemForm.value < 0) return toast("warning", "Стоимость выигрыша не может быть отрицательной");

    let items: CaseItem[];
    if (editingItemId) {
      items = activeCase.items.map((it) => (it.id === editingItemId ? { ...it, ...itemForm } : it));
    } else {
      items = [...activeCase.items, { id: genItemId(), ...itemForm }];
    }
    try {
      await setCaseItems(activeCase.id, items);
      toast("success", editingItemId ? "Предмет обновлён" : "Предмет добавлен");
      setEditingItemId(null);
      setItemForm(EMPTY_ITEM_FORM);
      await refresh();
    } catch {
      toast("error", "Не удалось сохранить предмет");
    }
  }

  async function handleDeleteItem(activeCase: CaseData, itemId: string) {
    if (!confirm("Убрать этот предмет из кейса?")) return;
    const items = activeCase.items.filter((it) => it.id !== itemId);
    await setCaseItems(activeCase.id, items);
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">📦 Кейсы</h1>
          <p className="text-sm text-white/40 max-w-2xl">
            Пользователь покупает открытие кейса за баланс сайта и получает случайный предмет из списка ниже — сумма
            его стоимости зачисляется на баланс покупателя. «Вес» — относительный шанс среди предметов этого кейса
            (как в Колесе Фортуны): не обязательно в сумме 100, проценты на публичной странице посчитаются сами.
          </p>
        </div>
        <button onClick={openCreateCase} className="btn-primary px-4 py-2.5 flex items-center gap-2 shrink-0">
          <Plus size={16} /> Новый кейс
        </button>
      </div>

      {showCaseForm && (
        <form onSubmit={handleSaveCase} className="card p-5 space-y-3">
          <p className="font-medium text-sm">{editingCaseId ? "Изменить кейс" : "Новый кейс"}</p>
          <ImageUploadField value={caseForm.image} onChange={(url) => setCaseForm({ ...caseForm, image: url })} folder="cases" label="Картинка кейса" />
          <input
            autoComplete="off"
            value={caseForm.name}
            onChange={(e) => setCaseForm({ ...caseForm, name: e.target.value })}
            placeholder="Название кейса"
            className="input-field py-2.5 text-sm w-full"
          />
          <div>
            <p className="text-xs text-white/40 mb-1">Цена открытия, ₽</p>
            <input
              autoComplete="off"
              type="number"
              min={1}
              value={caseForm.price}
              onChange={(e) => setCaseForm({ ...caseForm, price: Number(e.target.value) })}
              className="input-field py-2.5 text-sm w-full"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-white/60">
            <input type="checkbox" checked={caseForm.active} onChange={(e) => setCaseForm({ ...caseForm, active: e.target.checked })} />
            Показывать на сайте (/case)
          </label>
          <div className="flex gap-2">
            <button className="btn-primary px-5 py-2.5 text-sm">{editingCaseId ? "Сохранить" : "Создать"}</button>
            <button type="button" onClick={() => setShowCaseForm(false)} className="btn-secondary px-5 py-2.5 text-sm">
              Отмена
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : cases.length === 0 ? (
        <div className="card p-10 text-center text-white/40">Кейсов пока нет — создай первый кнопкой выше.</div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => {
            const totalWeight = c.items.reduce((s, it) => s + it.weight, 0);
            const isOpen = expandedCaseId === c.id;
            return (
              <div key={c.id} className={`card p-4 ${!c.active ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <img src={safeImageSrc(c.image)} alt={c.name} className="w-12 h-12 rounded-btn object-cover shrink-0 bg-black/30" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    <p className="text-xs text-white/40">
                      {c.price} ₽ за открытие · {c.items.length} предмет(ов) {!c.active && "· скрыт"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleActive(c)}
                    className="p-2 rounded-btn hover:bg-white/5 text-white/50 shrink-0"
                    title={c.active ? "Скрыть с сайта" : "Показать на сайте"}
                  >
                    {c.active ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button onClick={() => openEditCase(c)} className="p-2 rounded-btn hover:bg-white/5 text-white/50 shrink-0">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDeleteCase(c.id)} className="p-2 rounded-btn hover:bg-white/5 text-red-400 shrink-0">
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setExpandedCaseId(isOpen ? null : c.id);
                      openAddItem();
                    }}
                    className="btn-secondary px-3 py-2 text-xs flex items-center gap-1.5 shrink-0"
                  >
                    <Boxes size={14} /> {isOpen ? "Свернуть" : "Предметы"}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div className="grid sm:grid-cols-2 gap-2 items-end p-3 rounded-btn bg-black/20">
                      <ImageUploadField value={itemForm.image} onChange={(url) => setItemForm({ ...itemForm, image: url })} folder="cases" label="Фото предмета" size={64} />
                      <div className="space-y-2">
                        <input
                          autoComplete="off"
                          value={itemForm.name}
                          onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                          placeholder="Название предмета"
                          className="input-field py-2 text-sm w-full"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[11px] text-white/40 mb-1">Стоимость выигрыша, ₽</p>
                            <input
                              autoComplete="off"
                              type="number"
                              min={0}
                              value={itemForm.value}
                              onChange={(e) => setItemForm({ ...itemForm, value: Number(e.target.value) })}
                              className="input-field py-2 text-sm w-full"
                            />
                          </div>
                          <div>
                            <p className="text-[11px] text-white/40 mb-1">Вес (шанс)</p>
                            <input
                              autoComplete="off"
                              type="number"
                              min={1}
                              value={itemForm.weight}
                              onChange={(e) => setItemForm({ ...itemForm, weight: Number(e.target.value) })}
                              className="input-field py-2 text-sm w-full"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleSaveItem(c)} className="btn-primary px-4 py-2 text-xs flex-1">
                            {editingItemId ? "Сохранить предмет" : "Добавить предмет"}
                          </button>
                          {editingItemId && (
                            <button type="button" onClick={openAddItem} className="btn-secondary px-3 py-2 text-xs">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {c.items.length === 0 ? (
                      <p className="text-xs text-white/30 text-center py-3">Предметов пока нет — добавь хотя бы один выше.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {c.items.map((it) => (
                          <div key={it.id} className="flex items-center gap-2.5 p-2 rounded-btn bg-black/20">
                            <img src={safeImageSrc(it.image)} alt={it.name} className="w-8 h-8 rounded object-cover shrink-0 bg-black/30" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{it.name}</p>
                              <p className="text-[11px] text-white/40">
                                {it.value} ₽ · шанс ~{totalWeight > 0 ? ((it.weight / totalWeight) * 100).toFixed(1) : "0"}%
                              </p>
                            </div>
                            <button onClick={() => openEditItem(it)} className="p-1.5 rounded hover:bg-white/5 text-white/40 shrink-0">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDeleteItem(c, it.id)} className="p-1.5 rounded hover:bg-white/5 text-red-400 shrink-0">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
