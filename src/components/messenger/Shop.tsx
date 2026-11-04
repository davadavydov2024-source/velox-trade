"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Minus, Music2, Plus, Search } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { FRAMES, FRAME_COLORS, type EquippedFrame } from "@/lib/messenger/frames";
import { GIFTS, type GiftDef } from "@/lib/messenger/gifts";
import { NftFigure, hasNftFigure } from "./NftFigures";
import type { MAccount } from "./mtypes";
import { mApi, MApiError } from "./api";
import { Avatar, Sheet, Spinner } from "./ui";
import { AvatarFrame } from "./AvatarFrame";
import { GiftShopSheet } from "./Gifts";
import { fmtTime, TrackCover, useMusic } from "./MusicPlayer";
import { ProfileShell } from "./ProfileHeader";

type Tab = "gifts" | "frames" | "melodies";
const TABS: [Tab, string][] = [["gifts", "Подарки"], ["frames", "Рамки"], ["melodies", "Мелодии"]];

const tileStyle = { borderRadius: 26, background: "linear-gradient(160deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))", border: "1px solid rgba(255,255,255,0.1)" } as const;

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
  const [wallet, setWallet] = useState<number | null>(null);
  const [giftQ, setGiftQ] = useState("");
  const [giftCat, setGiftCat] = useState<"all" | "plain" | "nft" | "rare">("all");
  const [picked, setPicked] = useState<GiftDef | null>(null);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);

  const load = useCallback(() => {
    mApi<{ owned: string[]; equipped: EquippedFrame | null }>("frames").then((d) => { setOwned(d.owned); setEquipped(d.equipped); }).catch(() => setOwned([]));
  }, []);
  const loadWallet = useCallback(() => { mApi<{ wallet: number }>("wallet").then((d) => setWallet(d.wallet)).catch(() => {}); }, []);
  useEffect(() => { if (open) { load(); music.ensureLoaded(); loadWallet(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // покупка подарка себе в профиль (до 5 штук за раз); NFT выпадают со случайными признаками
  const buyForMe = async () => {
    if (!picked || buying) return;
    setBuying(true);
    let done = 0;
    try {
      for (let i = 0; i < qty; i++) { await mApi("gifts", { action: "send", giftId: picked.id, toUid: me }); done++; }
      toast("success", done > 1 ? `Куплено ${done} шт. — они в твоём профиле` : "Подарок в твоём профиле");
      setPicked(null); setQty(1);
    } catch (e) {
      toast("error", e instanceof MApiError ? e.message : "Не удалось купить");
      if (done) toast("info", `Успели купить: ${done}`);
    } finally { setBuying(false); loadWallet(); }
  };
  const gifts = GIFTS.filter((g) => {
    if (giftCat === "plain" && g.nft) return false;
    if (giftCat === "nft" && !g.nft) return false;
    if (giftCat === "rare" && g.category !== "rare") return false;
    const q = giftQ.trim().toLowerCase();
    return !q || g.title.toLowerCase().includes(q);
  });

  const colorOf = (id: string, def: string) => colors[id] ?? (equipped?.id === id ? equipped.color : def);
  const run = async (key: string, body: Record<string, unknown>, ok: string, path = "frames") => {
    if (busy) return;
    setBusy(key);
    try { await mApi(path, body); toast("success", ok); load(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); } finally { setBusy(""); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Магазин" full>
      <ProfileShell>
        <div className="relative px-4 pt-3 pb-8">
          <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: 190, background: "linear-gradient(180deg, rgba(214,24,34,0.85) 0%, rgba(214,24,34,0.25) 55%, transparent 100%)" }} />
          <div className="relative pt-2 pb-5">
            <p className="text-[26px] font-extrabold leading-tight">Магазин</p>
            <p className="text-[14px] mt-1" style={{ color: "rgba(255,255,255,0.8)" }}>Рамки для аватарок, мелодии профиля и подарки. Всё покупается за ⭐.</p>
          </div>
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
                        <div className="flex items-center justify-center rounded-[20px] w-full" style={{ height: 112, background: "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.08), rgba(0,0,0,0.35))" }}>
                          <AvatarFrame frame={{ id: f.id, color }} size={62}><Avatar src={account.photoURL} name={account.displayName} seed={me} size={62} /></AvatarFrame>
                        </div>
                        <p className="font-extrabold text-[15px] mt-2.5">{f.name}</p>
                        <div className="flex items-center gap-1.5 my-2 px-2 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.35)" }}>
                          {FRAME_COLORS.slice(0, 6).map((c) => (
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-[18px] font-extrabold">Подарок себе</p>
                <span className="px-3 py-1 rounded-full text-[13.5px] font-extrabold" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>⭐ {wallet === null ? "…" : wallet.toLocaleString("ru-RU")}</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 h-11 rounded-2xl mb-3" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Search size={17} className="mx-muted shrink-0" />
                <input className="bg-transparent outline-none flex-1 text-[15.5px] min-w-0" placeholder="Найти подарок" value={giftQ} onChange={(e) => setGiftQ(e.target.value)} />
              </div>
              <div className="flex p-1 rounded-2xl mb-3.5" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {([["all", "Все"], ["plain", "Обычные"], ["nft", "Коллекции"], ["rare", "Редкие"]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setGiftCat(id)} className="flex-1 h-9 rounded-xl text-[13.5px] font-extrabold" style={giftCat === id ? { background: "rgba(255,255,255,0.16)", color: "#fff" } : { color: "#9494a0" }}>{label}</button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {gifts.map((g) => (
                  <button key={g.id} onClick={() => { setPicked(g); setQty(1); }} className="relative flex flex-col items-center justify-center pt-3.5 pb-2.5 active:scale-[0.97] transition-transform" style={{ ...tileStyle, borderRadius: 22, border: g.limited && g.limited <= 800 ? "1.5px solid #f59e0b" : tileStyle.border }}>
                    {g.limited ? <span className="absolute top-1.5 left-0 right-0 text-center text-[10px] font-extrabold" style={{ color: g.limited <= 800 ? "#f59e0b" : "#8b8b96" }}>Тираж {g.limited.toLocaleString("ru-RU")}</span> : null}
                    <div className="flex items-center justify-center" style={{ width: 62, height: 62, marginTop: g.limited ? 9 : 0 }}>
                      {g.nft && hasNftFigure(g.id) ? <svg viewBox="0 0 200 200" width={62} height={62} style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.45))" }}><NftFigure id={g.id} /></svg> : <span style={{ fontSize: 44, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}>{g.emoji}</span>}
                    </div>
                    <span className="mt-1.5"><PricePill>⭐ {g.price}</PricePill></span>
                  </button>
                ))}
              </div>
              {gifts.length === 0 && <p className="mx-muted text-center py-8 text-[14.5px]">Ничего не найдено</p>}
              <button className="w-full h-11 rounded-full mt-4 font-extrabold text-[15px]" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }} onClick={() => setGiftShop(true)}>Отправить подарок другу</button>
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
      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.title ?? ""} zIndex={85}>
        {picked && (
          <ProfileShell>
            <div className="px-5 pt-4 pb-7 flex flex-col items-center">
              <div style={{ width: 128, height: 128 }} className="flex items-center justify-center">
                {picked.nft && hasNftFigure(picked.id) ? <svg viewBox="0 0 200 200" width={128} height={128} style={{ filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.5))" }}><NftFigure id={picked.id} /></svg> : <span style={{ fontSize: 96, lineHeight: 1 }}>{picked.emoji}</span>}
              </div>
              <p className="text-[22px] font-extrabold mt-2">{picked.title}</p>
              <p className="text-[13.5px] mx-muted text-center mt-1.5 px-2">{picked.nft ? `Коллекционный подарок: модель, фон и узор выпадают случайно, каждому достаётся свой номер из тиража ${picked.limited?.toLocaleString("ru-RU") ?? ""}.` : "Обычный подарок: остаётся в профиле и не превращается в NFT."}</p>
              <div className="flex items-center justify-between w-full mt-5">
                <span className="text-[15px] font-bold">Количество</span>
                <span className="flex items-center gap-3">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }} aria-label="Меньше"><Minus size={16} /></button>
                  <span className="w-6 text-center text-[17px] font-extrabold tabular-nums">{qty}</span>
                  <button onClick={() => setQty((q) => Math.min(5, q + 1))} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }} aria-label="Больше"><Plus size={16} /></button>
                </span>
              </div>
              <p className="text-[12.5px] mx-muted self-end mt-1">до 5 за раз</p>
              <div className="flex gap-2.5 w-full mt-4">
                <button onClick={() => setPicked(null)} className="flex-1 h-12 rounded-full font-extrabold text-[15px]" style={{ background: "rgba(255,255,255,0.12)" }}>Назад</button>
                <button disabled={buying} onClick={buyForMe} className="flex-[1.6] h-12 rounded-full font-extrabold text-[15px] flex items-center justify-center" style={{ background: "#fff", color: "#111" }}>{buying ? <Spinner size={18} /> : `Купить за ⭐ ${(picked.price * qty).toLocaleString("ru-RU")}`}</button>
              </div>
            </div>
          </ProfileShell>
        )}
      </Sheet>
    </Sheet>
  );
}
