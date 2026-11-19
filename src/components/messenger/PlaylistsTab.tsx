"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ListMusic, Pencil, Play, Plus, Shuffle, Trash2, X, Check } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import type { MusicTrack } from "@/lib/messenger/music";
import { Sheet, Spinner } from "./ui";
import { fmtTime, TrackCover, useMusic } from "./MusicPlayer";

export interface Playlist { id: string; name: string; trackIds: string[] }

async function api(body?: unknown): Promise<any> {
  const r = await authedFetch("/api/messenger/playlists", body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Ошибка");
  return d;
}
function usePlaylists() {
  const [list, setList] = useState<Playlist[] | null>(null);
  const reload = useCallback(async () => { try { setList((await api()).playlists); } catch { setList([]); } }, []);
  useEffect(() => { reload(); }, [reload]);
  return { list, reload };
}

/** Окно «Добавить в плейлист» для трека. */
export function AddToPlaylistSheet({ track, onClose }: { track: MusicTrack | null; onClose: () => void }) {
  const { toast } = useToast();
  const { list, reload } = usePlaylists();
  const [name, setName] = useState("");
  const toggle = async (p: Playlist) => {
    if (!track) return;
    const has = p.trackIds.includes(track.id);
    try { await api({ action: has ? "remove" : "add", id: p.id, trackId: track.id }); toast("success", has ? `Убрано из «${p.name}»` : `Добавлено в «${p.name}»`); await reload(); } catch (e: any) { toast("error", e.message); }
  };
  const create = async () => {
    if (!track || !name.trim()) return;
    try { const d = await api({ action: "create", name }); await api({ action: "add", id: d.id, trackId: track.id }); setName(""); toast("success", "Плейлист создан"); await reload(); } catch (e: any) { toast("error", e.message); }
  };
  return (
    <Sheet open={!!track} onClose={onClose} title="В плейлист">
      <div className="px-4 pb-8 flex flex-col gap-2">
        {list === null ? <div className="flex justify-center py-4"><Spinner size={20} /></div> : list.map((p) => {
          const has = !!track && p.trackIds.includes(track.id);
          return (
            <button key={p.id} onClick={() => toggle(p)} className="mx-card px-4 py-3 flex items-center gap-3 text-left">
              <ListMusic size={19} className="mx-muted" /><span className="flex-1 min-w-0"><span className="block text-[15.5px] truncate">{p.name}</span><span className="block text-[12.5px] mx-muted">{p.trackIds.length} песен</span></span>
              {has && <Check size={19} style={{ color: "var(--mx-accent)" }} />}
            </button>
          );
        })}
        <div className="flex gap-2 pt-1">
          <input className="mx-input flex-1" placeholder="Новый плейлист" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <button className="mx-btn" style={{ width: "auto", padding: "0 16px" }} disabled={!name.trim()} onClick={create}><Plus size={18} /></button>
        </div>
      </div>
    </Sheet>
  );
}

function PlaylistView({ pl, onBack, onChanged }: { pl: Playlist; onBack: () => void; onChanged: () => void }) {
  const m = useMusic();
  const { toast } = useToast();
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const key = pl.trackIds.join(",");
  useEffect(() => {
    let live = true;
    (async () => {
      const out = new Map<string, MusicTrack>();
      for (let i = 0; i < pl.trackIds.length; i += 20) {
        try {
          const r = await authedFetch(`/api/messenger/music?ids=${pl.trackIds.slice(i, i + 20).join(",")}`);
          if (r.ok) for (const t of (await r.json()).tracks as MusicTrack[]) out.set(t.id, t);
        } catch {}
      }
      if (live) setTracks(pl.trackIds.map((id) => out.get(id)).filter(Boolean) as MusicTrack[]);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const rename = async () => { const n = prompt("Название плейлиста", pl.name); if (!n?.trim()) return; try { await api({ action: "rename", id: pl.id, name: n }); onChanged(); } catch (e: any) { toast("error", e.message); } };
  const del = async () => { if (!confirm(`Удалить плейлист «${pl.name}»? Песни из каталога останутся.`)) return; try { await api({ action: "delete", id: pl.id }); onChanged(); onBack(); } catch (e: any) { toast("error", e.message); } };
  const remove = async (id: string) => { try { await api({ action: "remove", id: pl.id, trackId: id }); onChanged(); } catch (e: any) { toast("error", e.message); } };
  const play = (shuffle: boolean) => {
    if (!tracks?.length) return;
    const q = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    m.playQueue(q, 0);
  };

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-3 pt-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center" aria-label="Назад"><ArrowLeft size={20} /></button>
        <p className="flex-1 min-w-0 text-[17px] font-semibold truncate">{pl.name}</p>
        <button onClick={rename} className="w-9 h-9 flex items-center justify-center mx-muted" aria-label="Переименовать"><Pencil size={17} /></button>
        <button onClick={del} className="w-9 h-9 flex items-center justify-center" style={{ color: "var(--mx-danger)" }} aria-label="Удалить"><Trash2 size={17} /></button>
      </div>
      <div className="flex gap-2 px-4 py-3">
        <button className="mx-btn flex-1 flex items-center justify-center gap-2" disabled={!tracks?.length} onClick={() => play(false)}><Play size={17} />Слушать</button>
        <button className="mx-btn flex-1 flex items-center justify-center gap-2" style={{ background: "var(--mx-surface)", color: "var(--mx-text)" }} disabled={!tracks?.length} onClick={() => play(true)}><Shuffle size={17} />Вперемешку</button>
      </div>
      {tracks === null ? <div className="flex justify-center py-6"><Spinner size={22} /></div> : tracks.length === 0 ? (
        <p className="mx-muted text-center text-[14px] px-8 py-8">Плейлист пуст. В каталоге нажми «＋» у песни, чтобы добавить её сюда.</p>
      ) : tracks.map((t, i) => (
        <div key={t.id} className="flex items-center gap-3 px-4 py-2">
          <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => m.playQueue(tracks, i)}>
            <TrackCover track={t} size={46} radius={10} />
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium truncate" style={{ color: m.current?.id === t.id ? "var(--mx-accent)" : undefined }}>{t.title}</span><span className="block text-[12.5px] mx-muted truncate">{t.artist}</span></span>
          </button>
          <span className="text-[12.5px] mx-muted tabular-nums">{t.duration ? fmtTime(t.duration) : ""}</span>
          <button onClick={() => remove(t.id)} className="w-8 h-8 flex items-center justify-center mx-muted" aria-label="Убрать"><X size={17} /></button>
        </div>
      ))}
    </div>
  );
}

/** Вкладка «Плейлисты» на странице «Музыка». */
export function PlaylistsTab() {
  const { toast } = useToast();
  const { list, reload } = usePlaylists();
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const create = async () => {
    if (!name.trim()) return;
    try { await api({ action: "create", name }); setName(""); await reload(); } catch (e: any) { toast("error", e.message); }
  };
  const open = list?.find((p) => p.id === openId);
  if (open) return <PlaylistView pl={open} onBack={() => setOpenId(null)} onChanged={reload} />;
  return (
    <div className="px-4 pt-3 pb-6 flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input className="mx-input flex-1" placeholder="Новый плейлист" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <button className="mx-btn flex items-center gap-1.5" style={{ width: "auto", padding: "0 16px" }} disabled={!name.trim()} onClick={create}><Plus size={18} />Создать</button>
      </div>
      {list === null ? <div className="flex justify-center py-6"><Spinner size={22} /></div> : list.length === 0 ? (
        <p className="mx-muted text-center text-[14px] px-6 py-8">Плейлистов пока нет. Создай первый и добавляй песни кнопкой «＋» в каталоге.</p>
      ) : list.map((p) => (
        <button key={p.id} onClick={() => setOpenId(p.id)} className="mx-card px-4 py-3 flex items-center gap-3 text-left active:opacity-80">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--mx-accent) 18%, transparent)", color: "var(--mx-accent)" }}><ListMusic size={21} /></span>
          <span className="flex-1 min-w-0"><span className="block text-[16px] font-medium truncate">{p.name}</span><span className="block text-[12.5px] mx-muted">{p.trackIds.length} песен</span></span>
        </button>
      ))}
    </div>
  );
}
