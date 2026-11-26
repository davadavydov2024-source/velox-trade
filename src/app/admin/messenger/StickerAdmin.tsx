"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import type { MessengerStickerPack } from "@/lib/messenger/types";

const empty = { slug: "", title: "", premium: false, published: false, stickers: [] as { url: string; emoji: string }[] };

/** Редактор стикерпаков Mili. Ссылка набора для пользователей: /m?stickers=<slug> */
export function StickerAdmin() {
  const { toast } = useToast();
  const [packs, setPacks] = useState<MessengerStickerPack[]>([]);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/messenger/stickers");
    const d = await res.json();
    if (res.ok) setPacks(d.packs);
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!/^[a-z0-9_]{3,32}$/.test(form.slug)) return toast("warning", "Сначала укажи slug набора (a-z, 0-9, _)");
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const added: { url: string; emoji: string }[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("slug", form.slug);
        const res = await fetch("/api/admin/messenger/stickers/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(`${file.name}: ${d.error}`);
        added.push({ url: d.url, emoji: "🙂" });
      }
      setForm((f) => ({ ...f, stickers: [...f.stickers, ...added] }));
    } catch (e: any) {
      toast("error", e?.message || "Не удалось загрузить");
    } finally {
      setBusy(false);
    }
  }

  async function save(action: "save" | "delete", slug = form.slug) {
    setBusy(true);
    try {
      const res = await authedFetch("/api/admin/messenger/stickers", { method: "POST", body: JSON.stringify({ action, ...form, slug }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast("success", action === "save" ? "Набор сохранён" : "Набор удалён");
      if (action === "save" || slug === form.slug) setForm(empty);
      await load();
    } catch (e: any) {
      toast("error", e?.message || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <p className="text-sm font-medium">Стикеры Mili</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input autoComplete="off" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))} placeholder="slug (ссылка /m?stickers=slug)" className="input-field py-2 text-sm" />
        <input autoComplete="off" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Название набора" className="input-field py-2 text-sm" />
      </div>
      <div className="flex gap-4 flex-wrap text-sm text-white/70">
        <label className="flex items-center gap-2"><input autoComplete="off" type="checkbox" checked={form.premium} onChange={(e) => setForm((f) => ({ ...f, premium: e.target.checked }))} /> Только Mili Premium</label>
        <label className="flex items-center gap-2"><input autoComplete="off" type="checkbox" checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} /> Опубликован</label>
      </div>
      <input autoComplete="off" type="file" multiple accept="image/png,image/webp,image/gif,video/webm" disabled={busy} onChange={(e) => uploadFiles(e.target.files)} className="text-xs" />
      <div className="flex flex-wrap gap-2">
        {form.stickers.map((s, i) => (
          <div key={s.url} className="relative w-20 space-y-1">
            {s.url.endsWith(".webm") ? <video src={s.url} className="w-20 h-20 object-contain bg-black/30 rounded-btn" muted loop autoPlay playsInline /> : <img src={s.url} alt="" className="w-20 h-20 object-contain bg-black/30 rounded-btn" />}
            <input autoComplete="off" value={s.emoji} onChange={(e) => setForm((f) => ({ ...f, stickers: f.stickers.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)) }))} className="input-field py-1 text-xs w-full text-center" />
            <button onClick={() => setForm((f) => ({ ...f, stickers: f.stickers.filter((_, j) => j !== i) }))} className="text-[10px] text-red-300">убрать</button>
          </div>
        ))}
      </div>
      <button disabled={busy} onClick={() => save("save")} className="btn-primary px-5 py-2 text-sm disabled:opacity-50">{busy ? "..." : "Сохранить набор"}</button>

      <div className="space-y-2 pt-2 border-t border-border">
        {packs.map((p) => (
          <div key={p.slug} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{p.title} <span className="text-white/40">· {p.stickers.length} шт · /m?stickers={p.slug}{p.premium ? " · ⭐ Premium" : ""}{p.published ? "" : " · черновик"}</span></span>
            <span className="flex gap-3 shrink-0">
              <button onClick={() => setForm({ slug: p.slug, title: p.title, premium: p.premium, published: p.published, stickers: p.stickers })} className="text-xs text-accent">изменить</button>
              <button onClick={() => confirm(`Удалить набор «${p.title}»?`) && save("delete", p.slug)} className="text-xs text-red-300">удалить</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
