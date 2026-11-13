"use client";

import { useEffect } from "react";
import { Check, Pause, Play } from "lucide-react";
import { fmtTime, TrackCover, useMusic } from "./MusicPlayer";
import { Sheet, Spinner } from "./ui";

/** Мелодия профиля: карточка с обложкой, названием и кнопкой «играть» — трек берётся из раздела «Музыка». */
export function ProfileMusic({ trackId }: { trackId: string }) {
  const m = useMusic();
  const { ensureLoaded } = m;
  useEffect(() => { ensureLoaded(); }, [trackId, ensureLoaded]);
  const t = m.tracks.find((x) => x.id === trackId);
  if (!t) return null;
  const on = m.current?.id === t.id;
  const playing = on && m.playing;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ margin: "0 16px 12px", borderRadius: 24, background: "var(--mx-surface)" }}>
      <TrackCover track={t} size={48} radius={14} />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-extrabold truncate">{t.title}</p>
        <p className="text-[13px] mx-muted truncate">{t.artist}</p>
      </div>
      {t.duration ? <span className="text-[13px] mx-muted tabular-nums">{fmtTime(t.duration)}</span> : null}
      <button onClick={() => (on ? m.toggle() : m.playQueue([t], 0))} className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: "#8f9bb6", color: "#fff" }} aria-label={playing ? "Пауза" : "Играть"}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
    </div>
  );
}

/** Выбор мелодии профиля из каталога «Музыки». onPick(null) — убрать мелодию. */
export function ProfileTrackPicker({ open, onClose, current, onPick }: { open: boolean; onClose: () => void; current?: string | null; onPick: (id: string | null) => void }) {
  const m = useMusic();
  const { ensureLoaded } = m;
  useEffect(() => { if (open) ensureLoaded(); }, [open, ensureLoaded]);
  return (
    <Sheet open={open} onClose={onClose} title="Мелодия профиля" full zIndex={70}>
      <div className="pb-8">
        <p className="mx-muted text-[14px] px-4 pb-3">Выбери трек из раздела «Музыка»: он будет играть из твоего профиля по кнопке.</p>
        {m.loading && !m.loaded ? <div className="flex justify-center py-8"><Spinner /></div> : m.tracks.length === 0 ? (
          <p className="mx-muted text-center px-8 py-10 text-[14.5px]">В «Музыке» пока нет треков. Админ скоро добавит.</p>
        ) : (
          <>
            {current && <button onClick={() => onPick(null)} className="w-full text-left px-4 py-3 text-[16px]" style={{ color: "var(--mx-danger)" }}>Убрать мелодию</button>}
            {m.tracks.map((t) => (
              <button key={t.id} onClick={() => onPick(t.id)} className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-white/5">
                <TrackCover track={t} size={46} radius={10} />
                <span className="min-w-0 flex-1"><span className="block text-[15.5px] truncate">{t.title}</span><span className="block text-[13px] mx-muted truncate">{t.artist}</span></span>
                {current === t.id && <Check size={20} style={{ color: "var(--mx-accent)" }} />}
              </button>
            ))}
          </>
        )}
      </div>
    </Sheet>
  );
}
