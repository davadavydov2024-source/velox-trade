"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Sheet } from "./ui";
import { useMxPrefs } from "./prefs";

/** Быстрые ответы: свои шаблоны, вставляются в поле ввода одним нажатием. Хранятся на этом устройстве. */
export function QuickReplies({ open, onClose, onPick, draft }: { open: boolean; onClose: () => void; onPick: (t: string) => void; draft: string }) {
  const list = useMxPrefs((s) => s.quickReplies);
  const setList = useMxPrefs((s) => s.setQuickReplies);
  const [val, setVal] = useState("");

  const add = (t: string) => {
    const v = t.trim().slice(0, 500);
    if (!v || list.includes(v) || list.length >= 20) return;
    setList([...list, v]);
    setVal("");
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-4 pb-4">
        <p className="font-semibold text-[17px] mb-2">Быстрые ответы</p>
        {list.length === 0 && <p className="mx-muted text-[14px] mb-2">Пока пусто. Добавьте фразы, которые часто отправляете.</p>}
        <div className="mx-card mb-3">
          {list.map((t) => (
            <div key={t} className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--mx-line)" }}>
              <button className="flex-1 text-left text-[15px] break-words min-w-0" onClick={() => { onPick(t); onClose(); }}>{t}</button>
              <button className="mx-muted p-1" aria-label="Удалить" onClick={() => setList(list.filter((x) => x !== t))}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(val); }} maxLength={500} placeholder="Новая фраза" className="flex-1 rounded-xl px-3 py-2.5 text-[15px] outline-none" style={{ background: "var(--mx-surface)", border: "1px solid var(--mx-line)" }} />
          <button onClick={() => add(val)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text)" }} aria-label="Добавить"><Plus size={20} /></button>
        </div>
        {draft.trim() && !list.includes(draft.trim()) && (
          <button onClick={() => add(draft)} className="mt-3 text-[14px]" style={{ color: "var(--mx-accent)" }}>Сохранить текст из поля ввода как шаблон</button>
        )}
      </div>
    </Sheet>
  );
}
