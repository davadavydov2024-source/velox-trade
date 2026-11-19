"use client";

import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { useMusic } from "./MusicPlayer";
import { Sheet } from "./ui";

// таймер живёт вне компонента — не сбрасывается, если закрыть страницу «Музыка»
let deadline = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
function setSleep(min: number, stop: () => void) {
  if (timer) clearTimeout(timer);
  timer = null; deadline = 0;
  if (min > 0) { deadline = Date.now() + min * 60_000; timer = setTimeout(() => { deadline = 0; timer = null; stop(); }, min * 60_000); }
}

/** Таймер сна: через выбранное время музыка остановится сама. */
export function SleepTimerButton() {
  const m = useMusic();
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 15_000); return () => clearInterval(i); }, []);
  const left = deadline ? Math.max(1, Math.ceil((deadline - Date.now()) / 60_000)) : 0;
  const pick = (min: number) => { setSleep(min, m.stop); setOpen(false); tick((x) => x + 1); };
  return (
    <>
      <button onClick={() => setOpen(true)} className="ml-auto h-9 px-3 my-0.5 rounded-full flex items-center gap-1.5 text-[13.5px] font-medium" style={{ background: left ? "var(--mx-accent)" : "var(--mx-surface)", color: left ? "#fff" : "var(--mx-muted)" }}>
        <Moon size={15} />{left ? `${left} мин` : "Сон"}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Таймер сна">
        <div className="px-4 pb-8 flex flex-col gap-2">
          <p className="mx-muted text-[13.5px] pb-1">Музыка выключится сама — можно засыпать под любимые треки.</p>
          {[15, 30, 45, 60, 90].map((min) => <button key={min} className="mx-btn" style={{ background: "var(--mx-surface)", color: "var(--mx-text)" }} onClick={() => pick(min)}>Через {min} мин</button>)}
          {left > 0 && <button className="mx-btn" style={{ background: "var(--mx-surface)", color: "var(--mx-danger)" }} onClick={() => pick(0)}>Выключить таймер</button>}
        </div>
      </Sheet>
    </>
  );
}
