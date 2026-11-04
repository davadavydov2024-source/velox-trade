"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Music2 } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { FRAMES, FRAME_COLORS, type EquippedFrame } from "@/lib/messenger/frames";
import { GIFTS } from "@/lib/messenger/gifts";
import type { MAccount } from "./mtypes";
import { mApi, MApiError } from "./api";
import { Avatar, Sheet, Spinner } from "./ui";
import { AvatarFrame } from "./AvatarFrame";
import { GiftShopSheet } from "./Gifts";
import { fmtTime, TrackCover, useMusic } from "./MusicPlayer";
import { ProfileShell } from "./ProfileHeader";

type Tab = "gifts" | "frames" | "melodies";
const TABS: [Tab, string][] = [["gifts", "Подарки"], ["frames", "Рамки"], ["melodies", "Мелодии"]];

const tileStyle = { borderRadius: 26, background: "#0d0d0f", border: "1px solid rgba(255,255,255,0.09)" } as const;

function PricePill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-extrabold" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>{children}</span>;
}

/** Магазин: Подарки / Рамки аватарок / Мелодии профиля — три вкладки-«таблетки», карточки-плитки с ценами. */
export function ShopSheet({ open, onClose, me, account }: { open: boolean; onClose: () => void; me: string; account: MAccount }) {
  const { toast } = useToast();
  const music = useMusic();
  const [tab, setTab] = useState<Tab>("frames");
  const [owned, setOwned] = useState<string[] | null>(null);
  const [equipped, setEquipped] = useState<EquippedFrame | null>(account.frame ?? null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [giftShop, setGiftShop] = useState(false);
  const [giftSelf, setGiftSelf] = useState(false);

  const load = useCallback(() => {
    mApi<{ owned: string[]; equipped: EquippedFrame | null }>("frames").then((d) => { setOwned(d.owned); setEquipped(d.equipped); }).catch(() => setOwned([]));
  }, []);
  useEffect(() => { if (open) { load(); music.ensureLoaded(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const colorOf = (id: string, def: string) => colors[id] ?? (equipped?.id === id ? equipped.color : def);
  const run = async (key: string, body: Record<string, unknown>, ok: string, path = "frames") => {
    if (busy) return;
    setBusy(key);
    try { await mApi(path, body); toast("success", ok); load(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); } finally { setBusy(""); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Магазин" full>
      <ProfileShell black>
        <div className="px-4 pt-3 pb-8">
          {/* вкладки-«таблетки» */}
          <div className="flex p-1 rounded-full mb-4" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {TABS.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className="flex-1 h-10 rounded-full text-[14.5px] font-extrabold transition-colors" style={tab === id ? { background: "rgba(255,255,255,0.18)", color: "#fff", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)" } : { color: "#9494a0" }}>{label}</button>
            ))}
          </div>

          {tab === "frames" && (
            <>
              <p className="mx-muted text-[13.5px] mb-3">Так рамка выглядит на твоей аватарке. Цвет можно менять.</p>
              {owned === null ? <div className="flex justify-center py-10"><Spinner /></div> : (
                <div className="grid grid-cols-2 gap-3">
                  {FRAMES.map((f) => {
                    const have = owned.includes(f.id);
                    const on = equipped?.id === f.id;
                    const color = colorOf(f.id, f.defaultColor);
                    return (
                      <div key={f.id} className="flex flex-col items-center px-3 pt-4 pb-3" style={tileStyle}>
                        <div className="flex items-center justify-center rounded-[20px] w-full" style={{ height: 112, background: "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.1), #000 75%)" }}>
                          <AvatarFrame frame={{ id: f.id, color }} size={62}><Avatar src={account.photoURL} name={account.displayName} seed={me} size={62} /></AvatarFrame>
                        </div>
                        <p className="font-extrabold text-[15px] mt-2.5">{f.name}</p>
                        <div className="flex items-center justify-center flex-wrap gap-1.5 my-2 px-2 py-1.5 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }}>
                          {FRAME_COLORS.map((c) => (
                            <button key={c} onClick={() => setColors((m) => ({ ...m, [f.id]: c }))} aria-label={c} className="w-[18px] h-[18px] rounded-full" style={{ background: c, boxShadow: color === c ? "0 0 0 2px #fff" : "0 0 0 1px rgba(255,255,255,0.2)" }} />
                          ))}
                        </div>
                        {have ? (
                          <>
                            <span className="text-[12px] mx-muted mb-1.5">Куплено</span>
                            <button disabled={!!busy} onClick={() => run(`eq${f.id}`, { action: "equip", id: on && equipped?.color === color ? null : f.id, color }, on && equipped?.color === color ? "Рамка снята" : "Рамка надета")} className="w-full h-9 rounded-full text-[13.5px] font-extrabold" style={{ background: on && equipped?.color === color ? "rgba(255,255,255,0.14)" : "#fff", color: on && equipped?.color === color ? "#fff" : "#111" }}>
                              {busy === `eq${f.id}` ? <Spinner size={15} /> : on && equipped?.color === color ? "Снять" : on ? "Сменить цвет" : "Надеть"}
                            </button>
                          </>
                        ) : (
                          <button disabled={!!busy} onClick={() => run(`buy${f.id}`, { action: "buy", id: f.id }, `«${f.name}» куплена`)} className="w-full h-9 rounded-full text-[13.5px] font-extrabold flex items-center justify-center gap-1" style={{ background: "#fff", color: "#111" }}>
                            {busy === `buy${f.id}` ? <Spinner size={15} /> : <>Купить · {f.price} ⭐</>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "gifts" && (
            <>
              <p className="mx-muted text-[13.5px] mb-3">Тапни подарок, выбери получателя и отправь.</p>
              <div className="grid grid-cols-3 gap-2.5">
                {GIFTS.slice(0, 18).map((g) => (
                  <button key={g.id} onClick={() => setGiftShop(true)} className="relative flex flex-col items-center justify-center pt-3 pb-2.5 active:scale-[0.97] transition-transform" style={{ ...tileStyle, borderRadius: 22 }}>
                    {g.limited ? <span className="absolute top-1.5 left-0 right-0 text-center text-[10px] font-bold mx-muted">Тираж {g.limited}</span> : null}
                    <span style={{ fontSize: 44, lineHeight: 1.1, marginTop: g.limited ? 8 : 0, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}>{g.emoji}</span>
                    <span className="mt-1.5"><PricePill>{g.price} ⭐</PricePill></span>
                  </button>
                ))}
              </div>
              <button className="w-full h-11 rounded-full mt-4 font-extrabold text-[15px] flex items-center justify-center gap-2" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }} onClick={() => setGiftSelf(true)}>🎁 Купить подарок себе</button>
              <button className="w-full h-11 rounded-full mt-4 font-extrabold text-[15px]" style={{ background: "#fff", color: "#111" }} onClick={() => setGiftShop(true)}>Все подарки и отправка</button>
            </>
          )}

          {tab === "melodies" && (
            <>
              <p className="mx-muted text-[13.5px] mb-3">Мелодия играет из твоего профиля по кнопке ▶. Треки берутся из раздела «Музыка».</p>
              {music.loading && !music.loaded ? <div className="flex justify-center py-10"><Spinner /></div> : music.tracks.length === 0 ? (
                <div className="text-center py-10 px-6"><Music2 size={34} className="mx-auto mx-muted mb-2" /><p className="mx-muted text-[14.5px]">В «Музыке» пока нет треков</p></div>
              ) : (
                <div className="flex flex-col gap-2">
                  {music.tracks.map((t) => {
                    const cur = account.profileTrack === t.id;
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-3 py-2.5" style={{ ...tileStyle, borderRadius: 22 }}>
                        <TrackCover track={t} size={48} radius={14} />
                        <div className="min-w-0 flex-1"><p className="font-extrabold text-[15.5px] truncate">{t.title}</p><p className="text-[13px] mx-muted truncate">{t.artist}{t.duration ? ` · ${fmtTime(t.duration)}` : ""}</p></div>
                        <button disabled={!!busy} onClick={() => run(`m${t.id}`, { profileTrack: cur ? null : t.id }, cur ? "Мелодия убрана" : "Мелодия профиля выбрана", "profile")} className="h-9 px-4 rounded-full text-[13.5px] font-extrabold flex items-center gap-1" style={cur ? { background: "rgba(255,255,255,0.14)", color: "#fff" } : { background: "#fff", color: "#111" }}>
                          {busy === `m${t.id}` ? <Spinner size={15} /> : cur ? <><Check size={15} />В профиле</> : "Поставить"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </ProfileShell>
      <GiftShopSheet open={giftShop} onClose={() => setGiftShop(false)} me={me} />
      <GiftShopSheet open={giftSelf} onClose={() => setGiftSelf(false)} me={me} toUid={me} toName="себя" />
    </Sheet>
  );
}
