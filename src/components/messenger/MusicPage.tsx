"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Heart, Music2, Play, Search, Send, Shuffle, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { MUSIC_REQUEST_MAX, type MusicRequest, type MusicTrack } from "@/lib/messenger/music";
import { mApi, MApiError } from "./api";
import { PageHeader, Sheet, Spinner } from "./ui";
import { Equalizer, fmtTime, TrackCover, useMusic } from "./MusicPlayer";
import { MusicDiagSheet } from "./MusicDiag";

type Tab = "all" | "liked" | "requests";

function TrackRow({ t, list, i }: { t: MusicTrack; list: MusicTrack[]; i: number }) {
  const m = useMusic();
  const on = m.current?.id === t.id;
  const liked = m.likes.has(t.id);
  return (
    <div className="flex items-center gap-3 px-4 py-2 active:bg-white/5" style={{ background: on ? "color-mix(in srgb, var(--mx-accent) 10%, transparent)" : undefined }}>
      <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => (on ? m.toggle() : m.playQueue(list, i))}>
        <div className="relative">
          <TrackCover track={t} size={50} radius={10} />
          {on && (
            <span className="absolute inset-0 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.42)" }}>
              {m.playing ? <Equalizer active /> : <Play size={20} color="#fff" fill="#fff" />}
            </span>
          )}
        </div>
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-medium truncate" style={{ color: on ? "var(--mx-accent)" : undefined }}>{t.title}</span>
          <span className="block text-[13px] mx-muted truncate">{t.artist}</span>
        </span>
      </button>
      <span className="text-[12.5px] mx-muted tabular-nums shrink-0">{t.duration ? fmtTime(t.duration) : ""}</span>
      <button onClick={() => m.toggleLike(t.id)} className="w-9 h-9 flex items-center justify-center shrink-0" aria-label="В любимые" style={{ color: liked ? "#ff2d55" : "var(--mx-muted)" }}>
        <Heart size={20} fill={liked ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

const STATUS: Record<MusicRequest["status"], { label: string; color: string; icon: React.ReactNode }> = {
  new: { label: "На рассмотрении", color: "var(--mx-muted)", icon: <Clock size={14} /> },
  added: { label: "Добавлена", color: "#34c759", icon: <Check size={14} /> },
  rejected: { label: "Не подошла", color: "var(--mx-danger)", icon: <X size={14} /> },
};

/** Страница «Музыка»: каталог (как VK Музыка), новинки-карусель (как Spotify/SoundCloud), любимые и предложка песен админу. */
export function MusicPage({ onBack }: { onBack: () => void }) {
  const m = useMusic();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [reqOpen, setReqOpen] = useState(false);
  const [reqText, setReqText] = useState("");
  const [sending, setSending] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  const { setPageOpen, ensureLoaded } = m;
  useEffect(() => {
    setPageOpen(true);
    ensureLoaded();
    return () => setPageOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const term = q.trim().toLowerCase();
  const list = useMemo(() => {
    let l = tab === "liked" ? m.tracks.filter((t) => m.likes.has(t.id)) : m.tracks;
    if (term) l = l.filter((t) => t.title.toLowerCase().includes(term) || t.artist.toLowerCase().includes(term));
    return l;
  }, [m.tracks, m.likes, tab, term]);
  const fresh = useMemo(() => m.tracks.slice(0, 10), [m.tracks]);

  const sendRequest = async () => {
    const text = reqText.trim();
    if (text.length < 2 || sending) return;
    setSending(true);
    try {
      await mApi("music", { action: "request", text });
      toast("success", "Заявка отправлена админу 🎵");
      setReqText("");
      setReqOpen(false);
      setTab("requests");
      m.reload();
    } catch (e) {
      toast("error", e instanceof MApiError ? e.message : "Не удалось отправить");
    } finally { setSending(false); }
  };

  const playAll = (shuffle: boolean) => {
    if (!list.length) return;
    if (shuffle !== m.shuffle) m.toggleShuffle();
    m.playQueue(list, shuffle ? Math.floor(Math.random() * list.length) : 0);
  };

  const tabs: [Tab, string][] = [["all", "Все"], ["liked", "Любимые"], ["requests", "Мои заявки"]];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Музыка" onBack={onBack} />
      <div className="mx-scroll flex-1 min-h-0" style={{ paddingBottom: m.current ? 96 : 32 }}>
        {/* предложка */}
        <div className="px-4 pt-1">
          <div className="rounded-2xl px-4 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, var(--mx-accent), color-mix(in srgb, var(--mx-accent) 45%, #7c3aed))", color: "#fff" }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}><Music2 size={22} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold leading-tight">Нет нужной песни?</p>
              <p className="text-[13px] opacity-90">Напиши название — админ добавит её в Музыку</p>
            </div>
            <button onClick={() => setReqOpen(true)} className="px-3.5 py-2 rounded-full text-[14px] font-semibold shrink-0 active:scale-95 transition-transform" style={{ background: "#fff", color: "#111" }}>Предложить</button>
          </div>
        </div>

        {/* поиск */}
        <div className="px-4 pt-3">
          <div className="mx-search"><Search size={17} className="mx-muted shrink-0" /><input className="bg-transparent outline-none flex-1 text-[16px] min-w-0" placeholder="Поиск по названию или исполнителю" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button onClick={() => setQ("")} className="mx-muted"><X size={16} /></button>}</div>
        </div>

        {/* новинки */}
        {tab === "all" && !term && fresh.length > 0 && (
          <div className="pt-4">
            <p className="px-4 pb-2 text-[18px] font-bold">Новинки</p>
            <div className="flex gap-3 overflow-x-auto px-4 pb-1 mx-noscrollbar">
              {fresh.map((t, i) => (
                <button key={t.id} onClick={() => (m.current?.id === t.id ? m.toggle() : m.playQueue(fresh, i))} className="shrink-0 text-left active:scale-[0.97] transition-transform" style={{ width: 132 }}>
                  <div className="relative">
                    <TrackCover track={t} size={132} radius={14} />
                    {m.current?.id === t.id && m.playing && <span className="absolute left-2 bottom-2 px-1.5 py-1 rounded-md" style={{ background: "rgba(0,0,0,0.5)" }}><Equalizer active /></span>}
                  </div>
                  <p className="text-[14px] font-semibold truncate mt-1.5">{t.title}</p>
                  <p className="text-[12.5px] mx-muted truncate">{t.artist}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* вкладки */}
        <div className="flex gap-1 px-3 pt-4" style={{ borderBottom: "1px solid var(--mx-line)" }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className="px-3 h-10 text-[15px] font-semibold relative" style={{ color: tab === id ? "var(--mx-accent)" : "var(--mx-muted)" }}>
              {label}{id === "liked" && m.likes.size > 0 ? ` · ${m.likes.size}` : ""}
              {tab === id && <span className="absolute left-2 right-2 bottom-[-1px] h-[2px] rounded-full" style={{ background: "var(--mx-accent)" }} />}
            </button>
          ))}
        </div>

        {tab !== "requests" ? (
          <>
            {list.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => playAll(false)} className="h-11 px-5 rounded-full flex items-center gap-2 font-semibold text-[15px] active:scale-95 transition-transform" style={{ background: "var(--mx-accent)", color: "#fff" }}><Play size={18} fill="#fff" />Слушать</button>
                <button onClick={() => playAll(true)} className="h-11 px-4 rounded-full flex items-center gap-2 font-semibold text-[15px]" style={{ background: "var(--mx-surface)" }}><Shuffle size={17} />Вперемешку</button>
                <span className="mx-muted text-[13px] ml-auto">{list.length} {list.length % 10 === 1 && list.length % 100 !== 11 ? "трек" : [2, 3, 4].includes(list.length % 10) && ![12, 13, 14].includes(list.length % 100) ? "трека" : "треков"}</span>
              </div>
            )}
            {m.loading && !m.loaded ? <div className="flex justify-center py-10"><Spinner /></div> : list.length === 0 ? (
              <div className="text-center px-8 py-12">
                <Music2 size={40} className="mx-auto mx-muted mb-3" />
                <p className="text-[16px] font-semibold">{term ? "Ничего не нашлось" : tab === "liked" ? "Любимых пока нет" : "Музыки пока нет"}</p>
                <p className="mx-muted text-[14px] mt-1">{term ? "Предложи песню — админ добавит её" : tab === "liked" ? "Нажми ♥ у трека, чтобы он появился здесь" : "Админ скоро добавит первые треки. А пока можно предложить свою песню"}</p>
                {(term || tab === "all") && <button className="mx-btn mx-auto mt-4" style={{ width: "auto", padding: "10px 22px" }} onClick={() => { if (term) setReqText(q.trim().slice(0, MUSIC_REQUEST_MAX)); setReqOpen(true); }}>Предложить песню</button>}
              </div>
            ) : (
              <div className="pt-1">{list.map((t, i) => <TrackRow key={t.id} t={t} list={list} i={i} />)}</div>
            )}
          </>
        ) : (
          <div className="pt-2">
            {m.requests.length === 0 ? (
              <div className="text-center px-8 py-12"><Send size={36} className="mx-auto mx-muted mb-3" /><p className="text-[16px] font-semibold">Заявок пока нет</p><p className="mx-muted text-[14px] mt-1">Предложи песню — мы напишем в «MiliGram Push», когда она появится</p></div>
            ) : m.requests.map((r) => {
              const s = STATUS[r.status];
              const tr = r.trackId ? m.tracks.find((t) => t.id === r.trackId) : undefined;
              return (
                <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15.5px] truncate">{r.text}</p>
                    <p className="text-[12.5px] flex items-center gap-1 mt-0.5" style={{ color: s.color }}>{s.icon}{s.label}{r.note ? ` · ${r.note}` : ""}</p>
                  </div>
                  {tr && <button onClick={() => m.playQueue([tr], 0)} className="h-9 px-3.5 rounded-full text-[14px] font-semibold flex items-center gap-1.5" style={{ background: "var(--mx-accent)", color: "#fff" }}><Play size={14} fill="#fff" />Слушать</button>}
                </div>
              );
            })}
          </div>
        )}
        {m.tracks.length > 0 && (
          <button onClick={() => setDiagOpen(true)} className="block mx-auto mt-6 mb-2 text-[13.5px] mx-muted underline">Не играет? Диагностика</button>
        )}
      </div>

      <MusicDiagSheet open={diagOpen} onClose={() => setDiagOpen(false)} track={m.current ?? m.tracks[0] ?? null} />

      <Sheet open={reqOpen} onClose={() => setReqOpen(false)} title="Предложить песню">
        <div className="px-5 pb-8 flex flex-col gap-3">
          <p className="mx-muted text-[14px]">Напиши исполнителя и название. Заявка придёт администратору, а когда песня появится — мы сообщим в «MiliGram Push».</p>
          <input className="mx-input" placeholder="Например: The Weeknd — Blinding Lights" maxLength={MUSIC_REQUEST_MAX} value={reqText} onChange={(e) => setReqText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendRequest()} autoFocus />
          <p className="mx-muted text-[12px] text-right -mt-1">{reqText.length}/{MUSIC_REQUEST_MAX}</p>
          <button className="mx-btn" onClick={sendRequest} disabled={sending || reqText.trim().length < 2}>{sending ? <Spinner size={18} /> : "Отправить"}</button>
        </div>
      </Sheet>
    </div>
  );
}
