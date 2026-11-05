"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, ImageIcon, Trophy, Users, Crown, Gift, Check, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { Avatar, Sheet, Spinner, Switch } from "./ui";
import { mApi, mUpload } from "./api";
import type { MMessage } from "./mtypes";
import type { MessengerGiveaway } from "@/lib/messenger/types";

const COLORS = ["#3390ec", "#5865f2", "#34c759", "#ff9500", "#ff3b30", "#af52de", "#ff2d92", "#111111"];

function left(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d} д ${p(h)}:${p(m)}:${p(x)}` : `${p(h)}:${p(m)}:${p(x)}`;
}

/** Карточка розыгрыша в ленте канала: баннер, описание, таймер, прогресс, участники, кнопка (текст и цвет задаёт админ), победители. */
export function GiveawayCard({ msg, chatId, me, preview }: { msg: MMessage; chatId: string; me: string; preview?: boolean }) {
  const g = msg.giveaway as MessengerGiveaway;
  const { toast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const ticked = useRef(false);
  const active = g.status === "active";
  const mine = msg.from === me;
  const won = !!g.winners?.some((w) => w.uid === me);

  useEffect(() => {
    if (preview || !active) return;
    mApi<{ joined: boolean }>(`giveaway?chatId=${encodeURIComponent(chatId)}&msgId=${encodeURIComponent(msg.id)}`).then((r) => setJoined(r.joined)).catch(() => {});
  }, [preview, active, chatId, msg.id]);

  useEffect(() => {
    if (!active || !g.endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, g.endsAt]);

  useEffect(() => {
    if (preview || !active || !g.endsAt || now < g.endsAt || ticked.current) return;
    ticked.current = true;
    mApi("giveaway", { action: "tick", chatId, msgId: msg.id }).catch(() => {});
  }, [now, active, g.endsAt, preview, chatId, msg.id]);

  const join = async () => {
    if (preview || busy || joined || !active) return;
    setBusy(true);
    try { await mApi("giveaway", { action: "join", chatId, msgId: msg.id }); setJoined(true); }
    catch (e: any) { if (/уже участвуешь/i.test(e?.message ?? "")) setJoined(true); else toast("error", e?.message || "Не удалось"); }
    finally { setBusy(false); }
  };
  const end = async () => {
    if (!confirm("Завершить розыгрыш сейчас и выбрать победителей?")) return;
    try { await mApi("giveaway", { action: "end", chatId, msgId: msg.id }); } catch (e: any) { toast("error", e?.message || "Ошибка"); }
  };

  const pct = g.maxParticipants ? Math.min(100, Math.round((g.count / g.maxParticipants) * 100)) : 0;
  const color = g.buttonColor || "#3390ec";
  return (
    <div className="mx-gw" style={{ width: 290, maxWidth: "100%" }}>
      <style>{`
        .mx-gw .gw-btn{transition:transform .12s,filter .12s}.mx-gw .gw-btn:active{transform:scale(.97)}
        @keyframes gw-fall{0%{transform:translateY(-20px) rotate(0);opacity:0}15%{opacity:1}100%{transform:translateY(240px) rotate(360deg);opacity:0}}
        .mx-gw .gw-conf{position:absolute;top:0;font-size:16px;animation:gw-fall 2.8s ease-in infinite;pointer-events:none}
        @keyframes gw-pulse{0%,100%{opacity:1}50%{opacity:.55}}
      `}</style>
      {msg.mediaUrl && <img src={msg.mediaUrl} alt="" className="w-full rounded-xl object-cover mb-2.5" style={{ maxHeight: 170 }} draggable={false} />}
      <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color }}>
        <Gift size={14} /> Розыгрыш{g.premiumOnly ? " · Premium" : ""}
        {active && <span className="ml-1 w-1.5 h-1.5 rounded-full" style={{ background: "#34c759", animation: "gw-pulse 1.4s infinite" }} />}
      </div>
      <p className="font-semibold text-[16.5px] leading-snug">{g.title}</p>
      {g.desc && <p className="text-[14px] mt-1 opacity-90 whitespace-pre-wrap">{g.desc}</p>}

      <div className="mt-2.5 rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: "rgba(127,127,127,0.16)", borderLeft: `3px solid ${color}` }}>
        <Crown size={16} style={{ color }} className="shrink-0" />
        <span className="min-w-0 text-[14px]"><span className="opacity-60 text-[12px] block">Приз{g.winnersCount > 1 ? ` · ${g.winnersCount} победителей` : ""}</span>{g.prize}</span>
      </div>

      {active ? (
        <>
          <div className="flex items-center justify-between text-[12.5px] mt-3 opacity-80">
            <span className="flex items-center gap-1"><Users size={14} /> {g.count}{g.maxParticipants ? ` / ${g.maxParticipants}` : ""}</span>
            {g.endsAt && <span className="flex items-center gap-1 tabular-nums"><Clock size={14} /> {left(g.endsAt - now)}</span>}
          </div>
          {g.maxParticipants ? <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "rgba(127,127,127,0.25)" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: "width .4s" }} /></div> : null}
          {!!g.recent?.length && (
            <div className="flex items-center mt-2.5">
              {g.recent.slice(0, 5).map((r, i) => <span key={r.uid} style={{ marginLeft: i ? -8 : 0, borderRadius: 999, boxShadow: "0 0 0 2px var(--mx-bubble-in, #1c1c1e)" }}><Avatar src={r.photoURL ?? undefined} name={r.name} seed={r.uid} size={22} /></span>)}
              {g.count > 5 && <span className="ml-1.5 text-[12px] opacity-70">+{g.count - 5}</span>}
            </div>
          )}
          {mine ? (
            <button onClick={end} className="gw-btn w-full mt-3 py-2.5 rounded-xl text-[14.5px] font-medium" style={{ background: "rgba(127,127,127,0.22)" }}>Завершить сейчас</button>
          ) : (
            <button onClick={join} disabled={busy || joined} className="gw-btn w-full mt-3 py-2.5 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-1.5" style={{ background: joined ? "rgba(52,199,89,0.9)" : color, opacity: busy ? 0.7 : 1 }}>
              {busy ? <Spinner /> : joined ? <><Check size={17} /> Вы участвуете</> : g.buttonText || "Участвовать"}
            </button>
          )}
        </>
      ) : (
        <div className="relative mt-3 rounded-xl px-3 py-2.5 overflow-hidden" style={{ background: "rgba(127,127,127,0.14)" }}>
          {won && [8, 22, 38, 54, 70, 86].map((l, i) => <span key={i} className="gw-conf" style={{ left: `${l}%`, animationDelay: `${i * 0.35}s` }}>{["🎉", "✨", "🎊"][i % 3]}</span>)}
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold"><Trophy size={15} style={{ color: "#f5a623" }} /> Розыгрыш завершён · участников: {g.count}</p>
          {won && <p className="text-[14px] font-semibold mt-1" style={{ color: "#34c759" }}>🏆 Поздравляем, вы победили!</p>}
          {g.winners?.length ? (
            <div className="mt-2 space-y-1.5">
              {g.winners.map((w) => <div key={w.uid} className="flex items-center gap-2 text-[14px]"><Avatar src={w.photoURL ?? undefined} name={w.name} seed={w.uid} size={24} /><span className="truncate">{w.name}{w.handle ? <span className="opacity-60"> @{w.handle}</span> : null}</span></div>)}
            </div>
          ) : <p className="text-[13px] opacity-70 mt-1">Победителей нет — никто не участвовал.</p>}
        </div>
      )}
    </div>
  );
}

const DURATIONS: [string, number][] = [["1 час", 3600e3], ["6 часов", 6 * 3600e3], ["24 часа", 86400e3], ["3 дня", 3 * 86400e3], ["7 дней", 7 * 86400e3]];

/** Окно «Запустить розыгрыш» — админ канала/группы: фото, название, описание, приз, кнопка (текст и цвет), окончание по времени и/или числу участников. */
export function GiveawaySheet({ open, onClose, chatId, me }: { open: boolean; onClose: () => void; chatId: string; me: string }) {
  const { toast } = useToast();
  const [photo, setPhoto] = useState<string | null>(null);
  const [upl, setUpl] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [prize, setPrize] = useState("");
  const [btnText, setBtnText] = useState("Участвовать");
  const [color, setColor] = useState(COLORS[0]);
  const [byTime, setByTime] = useState(true);
  const [dur, setDur] = useState(DURATIONS[2][1]);
  const [byCount, setByCount] = useState(false);
  const [max, setMax] = useState("100");
  const [winners, setWinners] = useState("1");
  const [premium, setPremium] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    setUpl(true);
    try { setPhoto((await mUpload(f, "image")).url); } catch (e: any) { toast("error", e?.message || "Не удалось загрузить"); } finally { setUpl(false); }
  };
  const submit = async () => {
    if (busy) return;
    if (!title.trim()) { toast("error", "Напиши название"); return; }
    if (!prize.trim()) { toast("error", "Укажи приз"); return; }
    if (!byTime && !byCount) { toast("error", "Выбери, когда закончится розыгрыш"); return; }
    setBusy(true);
    try {
      await mApi("giveaway", {
        action: "create", chatId, title, desc, prize, photoUrl: photo || undefined, buttonText: btnText, buttonColor: color,
        ...(byTime ? { endsAt: Date.now() + dur } : {}), ...(byCount ? { maxParticipants: Math.floor(Number(max) || 0) } : {}),
        winnersCount: Math.floor(Number(winners) || 1), premiumOnly: premium,
      });
      toast("success", "Розыгрыш запущен");
      setTitle(""); setDesc(""); setPrize(""); setPhoto(null);
      onClose();
    } catch (e: any) { toast("error", e?.message || "Ошибка"); } finally { setBusy(false); }
  };

  const fake = { id: "preview", from: me, kind: "giveaway", reactions: {}, createdAt: 0, mediaUrl: photo ?? undefined, giveaway: {
    title: title || "Название розыгрыша", desc, prize: prize || "Приз", buttonText: btnText, buttonColor: color, winnersCount: Math.max(1, Number(winners) || 1),
    premiumOnly: premium, count: 12, status: "active", ...(byTime ? { endsAt: Date.now() + dur } : {}), ...(byCount ? { maxParticipants: Number(max) || 100 } : {}),
    recent: [{ uid: "a", name: "Аня" }, { uid: "b", name: "Макс" }, { uid: "c", name: "Ира" }],
  } } as MMessage;

  const Label = ({ children }: { children: React.ReactNode }) => <p className="px-4 pt-4 pb-1.5 text-[12.5px] uppercase tracking-wide mx-muted">{children}</p>;
  const chip = (on: boolean) => ({ background: on ? "var(--mx-accent)" : "var(--mx-surface2, rgba(127,127,127,.18))", color: on ? "#fff" : undefined });
  return (
    <Sheet open={open} onClose={onClose} title="Запустить розыгрыш" full>
      <div className="overflow-y-auto pb-6" style={{ maxHeight: "78vh" }}>
        <Label>Так увидят подписчики</Label>
        <div className="px-4 flex justify-center"><div className="rounded-2xl p-3" style={{ background: "var(--mx-surface2, rgba(127,127,127,.14))" }}><GiveawayCard msg={fake} chatId={chatId} me={me} preview /></div></div>

        <Label>Картинка</Label>
        <div className="px-4 flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="mx-card px-3 py-2.5 flex items-center gap-2 text-[15px]">{upl ? <Spinner /> : <ImageIcon size={18} />} {photo ? "Заменить фото" : "Добавить фото"}</button>
          {photo && <button onClick={() => setPhoto(null)} className="text-[14px]" style={{ color: "#ff3b30" }}><X size={16} className="inline" /> убрать</button>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        <Label>Текст</Label>
        <div className="px-4 flex flex-col gap-2.5">
          <input className="mx-input" maxLength={80} placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="mx-input" rows={3} maxLength={1000} placeholder="Описание и условия" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <input className="mx-input" maxLength={120} placeholder="Приз: например, Mili Premium на месяц" value={prize} onChange={(e) => setPrize(e.target.value)} />
        </div>

        <Label>Кнопка участия</Label>
        <div className="px-4 flex flex-col gap-2.5">
          <input className="mx-input" maxLength={24} placeholder="Текст кнопки" value={btnText} onChange={(e) => setBtnText(e.target.value)} />
          <div className="flex items-center gap-2 flex-wrap">
            {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label={c} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: c, outline: color === c ? "2px solid var(--mx-accent)" : "none", outlineOffset: 2 }}>{color === c && <Check size={15} color="#fff" />}</button>)}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded-full border-0 p-0 bg-transparent" aria-label="Свой цвет" />
          </div>
        </div>

        <Label>Когда закончится</Label>
        <div className="px-4 flex flex-col gap-3">
          <div className="flex items-center justify-between"><span className="text-[15px]">По времени</span><Switch on={byTime} onChange={setByTime} /></div>
          {byTime && <div className="flex gap-2 flex-wrap">{DURATIONS.map(([l, v]) => <button key={v} onClick={() => setDur(v)} className="px-3 py-1.5 rounded-full text-[14px]" style={chip(dur === v)}>{l}</button>)}</div>}
          <div className="flex items-center justify-between"><span className="text-[15px]">По числу участников</span><Switch on={byCount} onChange={setByCount} /></div>
          {byCount && <input className="mx-input tabular-nums" inputMode="numeric" placeholder="Сколько участников" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, "").slice(0, 6))} />}
          <p className="text-[12.5px] mx-muted">Если включены оба условия, розыгрыш закончится по тому, что наступит раньше.</p>
        </div>

        <Label>Победители</Label>
        <div className="px-4 flex flex-col gap-3">
          <input className="mx-input tabular-nums" inputMode="numeric" placeholder="Сколько победителей" value={winners} onChange={(e) => setWinners(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          <div className="flex items-center justify-between"><span className="text-[15px]">Только для Mili Premium</span><Switch on={premium} onChange={setPremium} /></div>
        </div>

        <div className="px-4 pt-5">
          <button onClick={submit} disabled={busy} className="w-full py-3.5 rounded-2xl text-white text-[16px] font-semibold flex items-center justify-center gap-2" style={{ background: "var(--mx-accent)", opacity: busy ? 0.7 : 1 }}>{busy ? <Spinner /> : <><Gift size={18} /> Запустить</>}</button>
        </div>
      </div>
    </Sheet>
  );
}
