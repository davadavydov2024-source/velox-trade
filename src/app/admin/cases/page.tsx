"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, X, Boxes, Eye, EyeOff, Search } from "lucide-react";
import { getAllCases, createCase, updateCase, deleteCase, setCaseItems, getCaseItemRarity } from "@/lib/cases";
import { getProducts } from "@/lib/products";
import { RARITY_COLOR } from "@/lib/rarityColors";
import { ImageUploadField } from "@/components/ImageUploadField";
import { safeImageSrc } from "@/lib/safeImage";
import { CaseData, CaseItem, Product, RARITY_LABEL } from "@/types";
import { useToast } from "@/lib/toastContext";

const EMPTY_CASE_FORM = { name: "", image: "", priceTickets: 20, active: true };

function genItemId() {
  return `it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminCasesPage() {
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseData[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [caseForm, setCaseForm] = useState(EMPTY_CASE_FORM);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [pickedProduct, setPickedProduct] = useState<Product | null>(null);
  const [itemWeight, setItemWeight] = useState(10);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    const [c, p] = await Promise.all([getAllCases(), getProducts()]);
    setCases(c);
    setProducts(p);
    setLoading(false);
  }

  function openCreateCase() {
    setEditingCaseId(null);
    setCaseForm(EMPTY_CASE_FORM);
    setShowCaseForm(true);
  }

  function openEditCase(c: CaseData) {
    setEditingCaseId(c.id);
    setCaseForm({ name: c.name, image: c.image, priceTickets: c.priceTickets, active: c.active });
    setShowCaseForm(true);
  }

  async function handleSaveCase(e: React.FormEvent) {
    e.preventDefault();
    if (!caseForm.name.trim()) return toast("warning", "Укажи название кейса");
    if (!caseForm.image) return toast("warning", "Загрузи картинку кейса");
    if (caseForm.priceTickets <= 0) return toast("warning", "Цена открытия должна быть больше 0");
    try {
      if (editingCaseId) {
        await updateCase(editingCaseId, caseForm);
        toast("success", "Кейс обновлён");
      } else {
        await createCase(caseForm);
        toast("success", "Кейс создан — теперь добавь в него призы");
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

  function resetItemForm() {
    setEditingItemId(null);
    setPickedProduct(null);
    setProductSearch("");
    setItemWeight(10);
  }

  function openEditItem(item: CaseItem) {
    setEditingItemId(item.id);
    const prod = products.find((p) => p.id === item.productId) ?? null;
    setPickedProduct(prod);
    setProductSearch(item.name);
    setItemWeight(item.weight);
  }

  async function handleSaveItem(activeCase: CaseData) {
    if (!pickedProduct) return toast("warning", "Выбери товар из каталога — это и будет приз");
    if (itemWeight <= 0) return toast("warning", "Шанс (вес) должен быть больше 0");

    let items: CaseItem[];
    const itemData = { productId: pickedProduct.id, name: pickedProduct.name, image: pickedProduct.image, weight: itemWeight };
    if (editingItemId) {
      items = activeCase.items.map((it) => (it.id === editingItemId ? { ...it, ...itemData } : it));
    } else {
      items = [...activeCase.items, { id: genItemId(), ...itemData }];
    }
    try {
      await setCaseItems(activeCase.id, items);
      toast("success", editingItemId ? "Приз обновлён" : "Приз добавлен");
      resetItemForm();
      await refresh();
    } catch {
      toast("error", "Не удалось сохранить приз");
    }
  }

  async function handleDeleteItem(activeCase: CaseData, itemId: string) {
    if (!confirm("Убрать этот приз из кейса?")) return;
    const items = activeCase.items.filter((it) => it.id !== itemId);
    await setCaseItems(activeCase.id, items);
    await refresh();
  }

  const filteredProducts = productSearch.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(productSearch.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">📦 Кейсы</h1>
          <p className="text-sm text-white/40 max-w-2xl">
            Пользователь открывает кейс за тикеты (🎫, отдельная валюта — см. заявки на сдачу предмета) и получает
            случайный ПРИЗ — настоящий товар из каталога, который выдаётся так же, как обычная покупка. «Вес» —
            относительный шанс среди призов этого кейса: чем он ниже, тем выше редкость приза (проценты и цвет тира
            считаются сами).
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
            <p className="text-xs text-white/40 mb-1">Цена открытия, 🎫 тикетов</p>
            <input
              autoComplete="off"
              type="number"
              min={1}
              value={caseForm.priceTickets}
              onChange={(e) => setCaseForm({ ...caseForm, priceTickets: Number(e.target.value) })}
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
                      {c.priceTickets} 🎫 за открытие · {c.items.length} приз(ов) {!c.active && "· скрыт"}
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
                      resetItemForm();
                    }}
                    className="btn-secondary px-3 py-2 text-xs flex items-center gap-1.5 shrink-0"
                  >
                    <Boxes size={14} /> {isOpen ? "Свернуть" : "Призы"}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div className="p-3 rounded-btn bg-black/20 space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                          autoComplete="off"
                          value={productSearch}
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setPickedProduct(null);
                          }}
                          placeholder="Найти товар по названию..."
                          className="input-field py-2 pl-8 text-sm w-full"
                        />
                        {filteredProducts.length > 0 && !pickedProduct && (
                          <div className="absolute z-10 left-0 right-0 mt-1 card p-1.5 max-h-56 overflow-y-auto space-y-0.5">
                            {filteredProducts.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setPickedProduct(p);
                                  setProductSearch(p.name);
                                }}
                                className="w-full flex items-center gap-2 p-1.5 rounded-btn hover:bg-white/5 text-left"
                              >
                                <img src={safeImageSrc(p.image)} alt="" className="w-7 h-7 rounded object-cover bg-black/30 shrink-0" />
                                <span className="text-xs truncate">{p.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {pickedProduct && (
                        <div className="flex items-center gap-2 p-2 rounded-btn bg-white/5">
                          <img src={safeImageSrc(pickedProduct.image)} alt="" className="w-8 h-8 rounded object-cover bg-black/30 shrink-0" />
                          <span className="text-xs flex-1 truncate">{pickedProduct.name}</span>
                          <button type="button" onClick={() => setPickedProduct(null)} className="text-white/40 hover:text-white shrink-0">
                            <X size={14} />
                          </button>
                        </div>
                      )}

                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <p className="text-[11px] text-white/40 mb-1">Вес (шанс выпадения)</p>
                          <input
                            autoComplete="off"
                            type="number"
                            min={1}
                            value={itemWeight}
                            onChange={(e) => setItemWeight(Number(e.target.value))}
                            className="input-field py-2 text-sm w-full"
                          />
                        </div>
                        <button type="button" onClick={() => handleSaveItem(c)} className="btn-primary px-4 py-2 text-xs">
                          {editingItemId ? "Сохранить" : "Добавить"}
                        </button>
                        {editingItemId && (
                          <button type="button" onClick={resetItemForm} className="btn-secondary px-3 py-2 text-xs">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {c.items.length === 0 ? (
                      <p className="text-xs text-white/30 text-center py-3">Призов пока нет — добавь хотя бы один выше.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {c.items.map((it) => {
                          const rarity = getCaseItemRarity(it.weight, totalWeight);
                          return (
                            <div key={it.id} className="flex items-center gap-2.5 p-2 rounded-btn bg-black/20" style={{ borderLeft: `2px solid ${RARITY_COLOR[rarity]}` }}>
                              <img src={safeImageSrc(it.image)} alt={it.name} className="w-8 h-8 rounded object-cover shrink-0 bg-black/30" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">{it.name}</p>
                                <p className="text-[11px]" style={{ color: RARITY_COLOR[rarity] }}>
                                  {RARITY_LABEL[rarity]} · ~{totalWeight > 0 ? ((it.weight / totalWeight) * 100).toFixed(1) : "0"}%
                                </p>
                              </div>
                              <button onClick={() => openEditItem(it)} className="p-1.5 rounded hover:bg-white/5 text-white/40 shrink-0">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleDeleteItem(c, it.id)} className="p-1.5 rounded hover:bg-white/5 text-red-400 shrink-0">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                        })}
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
