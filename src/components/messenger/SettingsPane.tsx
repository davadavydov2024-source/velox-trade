"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Eye, AtSign, Cake, Megaphone, Phone, X, Bell, Camera, Check, ChevronRight, Database, Folder, Keyboard, Languages, LockKeyhole, LogOut, Settings, Smartphone, Sticker, Trash2, Plus, Laptop, Download, Star, Gift, Shield, FileText, Music2, Hash, Pencil, MessageSquare, ShoppingBag } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { PushToggleCard } from "@/components/PushToggleCard";
import { getDeviceId } from "@/lib/messenger/client";
import { isPremium } from "@/lib/messenger/premium";
import { PAY_DOCS, PLUS_PRICE_RUB, PREMIUM_PRICE_RUB } from "@/lib/messenger/pricing";
import { mApi, mUpload, MApiError } from "./api";
import { GiftsProfileTab } from "./Gifts";
import { PerksList, StatusPicker } from "./PremiumExtras";
import { StickersSettings } from "./StickersUI";
import { AdminPanel } from "./AdminPanel";
import { MusicPage } from "./MusicPage";
import { isAdminUid } from "@/lib/isAdmin";
import { Avatar, IconBox, PageHeader, Section, Sheet, Spinner, Switch, TagChip, VerifiedBadge, VerifyMark } from "./ui";
import { StatusBadge } from "./StatusBadge";
import { UsernameRow, UsernamesPage } from "./Usernames";
import { ProfileHeader, ProfileRoundBtn, ProfileShell, useProfileGifts } from "./ProfileHeader";
import { PostsTab } from "./Posts";
import { ShopSheet } from "./Shop";
import { ProfileTrackPicker } from "./ProfileMusic";
import { ChatInfoSheet } from "./ChatInfoSheet";
import { NumbersSheet, NumberTierChip } from "./Numbers";
import { formatNumber } from "@/lib/messenger/numbers";
import { WalletPage, startTopup } from "./Wallet";
import { ACCENT_CHOICES, FONT_CHOICES, MxTheme, useMxPrefs } from "./prefs";
import { MAccount, MChat, MFolder, MFolderType } from "./mtypes";

export type Page = null | "notifications" | "data" | "privacy" | "general" | "folders" | "stickers" | "devices" | "language" | "hotkeys" | "premium" | "admin" | "docs" | "wallet" | "music" | "usernames";

function Row({ icon, color, label, value, onClick, right }: { icon: ReactNode; color: string; label: string; value?: string; onClick?: () => void; right?: ReactNode }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3 text-left active:bg-white/5">
      <IconBox color={color}>{icon}</IconBox>
      <span className="flex-1 text-[16px]">{label}</span>
      {value && <span className="mx-muted text-[15px]">{value}</span>}
      {right}
      {onClick && !right && <ChevronRight size={18} className="mx-muted" />}
    </button>
  );
}

/** Квадратная обрезка по центру до 512 px — аватарка без отдельного окна обрезки. */
/** Обрезка по центру под баннер 3:1 (1200×400). */
async function bannerCrop(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const W = 1200, H = 400;
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const w = bmp.width * scale, h = bmp.height * scale;
  ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Не удалось обработать картинку"))), "image/jpeg", 0.88));
}

async function squareAvatar(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(512, side);
    canvas.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ProfileEditor({ open, onClose, account, onLogout }: { open: boolean; onClose: () => void; account: MAccount; onLogout: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(account.displayName);
  const [handle, setHandle] = useState(account.handle);
  const [bio, setBio] = useState(account.bio ?? "");
  const [birthday, setBirthday] = useState(account.birthday ?? "");
  const [channel, setChannel] = useState(account.channelHandle ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(account.displayName);
      setHandle(account.handle);
      setBio(account.bio ?? "");
      setBirthday(account.birthday ?? "");
      setChannel(account.channelHandle ?? "");
    }
  }, [open, account]);

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await mApi("profile", { displayName: name.trim(), handle: handle.trim().replace(/^@/, ""), bio: bio.trim(), birthday: birthday || undefined, channelHandle: channel.trim().replace(/^@/, ""), ...extra });
      toast("success", "Профиль сохранён");
      onClose();
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const blob = await squareAvatar(f);
      const up = await mUpload(blob, "avatar", { fileName: "avatar.jpg" });
      await mApi("profile", { photoURL: up.url });
      toast("success", "Фото обновлено");
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось загрузить фото");
    } finally {
      setBusy(false);
    }
  };

  const pickBanner = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const up = await mUpload(await bannerCrop(f), "banner", { fileName: "banner.jpg" });
      await mApi("profile", { bannerURL: up.url });
      toast("success", "Баннер обновлён");
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось загрузить баннер");
    } finally {
      setBusy(false);
    }
  };
  const removeBanner = async () => {
    setBusy(true);
    try {
      await mApi("profile", { bannerURL: null });
      toast("success", "Баннер убран");
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось убрать баннер");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "bg-transparent outline-none w-full px-4 py-3.5 text-[17px]";
  const canSave = !busy && name.trim().length >= 2 && handle.replace("@", "").length >= 4;
  const dirty = name.trim() !== account.displayName || handle.replace("@", "") !== account.handle || bio.trim() !== (account.bio ?? "") || (birthday || "") !== (account.birthday ?? "") || channel.replace("@", "") !== (account.channelHandle ?? "");
  const cardCls = "overflow-hidden";
  const cardSt = { margin: "0 16px", borderRadius: 22, background: "var(--mx-surface)" } as const;
  const hint = "mx-muted text-[13.5px] px-8 mt-2";
  const Ic = ({ c, children }: { c: string; children: ReactNode }) => <span className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0 text-white" style={{ background: c }}>{children}</span>;
  return (
    <Sheet open={open} onClose={onClose} full>
      <div className="pb-10">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <button onClick={onClose} aria-label="Закрыть" className="w-11 h-11 rounded-full flex items-center justify-center active:opacity-70" style={{ background: "var(--mx-surface2)" }}><X size={22} /></button>
          <button
            disabled={busy}
            onClick={() => {
              if (name.trim().length < 2) { toast("error", "Имя — минимум 2 символа"); return; }
              if (handle.replace("@", "").length < 4) { toast("error", "Ник — минимум 4 символа: латиница, цифры и _"); return; }
              if (!dirty) { onClose(); return; }
              save();
            }}
            aria-label="Готово"
            className="w-11 h-11 rounded-full flex items-center justify-center active:opacity-70 transition-colors"
            style={dirty && canSave ? { background: "var(--mx-accent)", color: "var(--mx-accent-text, #fff)" } : { background: "var(--mx-surface2)" }}
          >{busy ? "…" : <Check size={24} />}</button>
        </div>

        <div className="flex flex-col items-center -mt-6 pb-5">
          <button onClick={() => fileRef.current?.click()} className="relative" disabled={busy} aria-label="Сменить фото">
            <Avatar src={account.photoURL} name={account.displayName} seed={account.uid} size={112} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="mt-3 text-[19px] font-medium mx-muted">Изменить фотографию</button>
        </div>

        <div className={cardCls} style={cardSt}>
          <input className={inputCls} placeholder="Имя" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <p className={hint}>Укажите имя и, если хотите, добавьте фотографию для вашего профиля.</p>

        <div className="relative mt-6" style={cardSt}>
          <textarea className={inputCls + " resize-none pr-12"} rows={3} placeholder="О себе" maxLength={140} value={bio} onChange={(e) => setBio(e.target.value)} />
          <span className="absolute right-4 bottom-3 text-[14px] mx-muted">{140 - bio.length}</span>
        </div>
        <p className={hint}>Раздел «О себе» виден всем.</p>

        <label className="flex items-center gap-3 px-4 py-3 mt-6 relative" style={cardSt}>
          <Ic c="#3b9bff"><Cake size={18} /></Ic>
          <span className="flex-1 text-[17px]">День рождения</span>
          <input type="date" className="bg-transparent outline-none text-[16px] mx-muted text-right" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>
        <p className={hint}>Ваш день рождения виден всем.</p>

        <div className={cardCls + " mt-6"} style={cardSt}>
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--mx-line)" }}>
            <Ic c="#34c759"><Phone size={18} /></Ic>
            <span className="flex-1 text-[17px]">Номер</span>
            <span className="text-[16px] mx-muted tabular-nums">{account.number ? formatNumber(account.number) : "нет"}</span>
          </div>
          <label className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--mx-line)" }}>
            <Ic c="#6c63ff"><AtSign size={18} /></Ic>
            <span className="text-[17px] shrink-0">Имя пользователя</span>
            <input className="bg-transparent outline-none flex-1 min-w-0 text-right text-[16px] mx-muted" placeholder="username" value={handle} maxLength={25} autoCapitalize="none" autoCorrect="off" onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""))} />
          </label>
          <label className="flex items-center gap-3 px-4 py-3">
            <Ic c="#ff9f0a"><Megaphone size={18} /></Ic>
            <span className="text-[17px] shrink-0">Канал</span>
            <input className="bg-transparent outline-none flex-1 min-w-0 text-right text-[16px] mx-muted" value={channel} maxLength={25} placeholder="@mychannel" autoCapitalize="none" autoCorrect="off" onChange={(e) => setChannel(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""))} />
          </label>
        </div>
        <p className={hint}>Ник: латиница, цифры и _, от 4 символов — по нему вас находят. Канал показывается в профиле.</p>

        <div className="relative mt-6 overflow-hidden" style={{ ...cardSt, aspectRatio: "3 / 1", background: "linear-gradient(135deg, var(--mx-accent), color-mix(in srgb, var(--mx-accent) 62%, #000))" }}>
          {account.bannerURL && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.bannerURL} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-x-0 bottom-0 p-2 flex gap-2 justify-end" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.45))" }}>
            <button onClick={() => bannerRef.current?.click()} disabled={busy} className="h-8 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 text-white" style={{ background: "rgba(0,0,0,0.5)" }}>
              <Camera size={14} /> {account.bannerURL ? "Сменить баннер" : "Добавить баннер"}
            </button>
            {account.bannerURL && (
              <button onClick={removeBanner} disabled={busy} className="h-8 w-8 rounded-full flex items-center justify-center text-white" style={{ background: "rgba(0,0,0,0.5)" }} aria-label="Убрать баннер"><Trash2 size={14} /></button>
            )}
          </div>
          <input ref={bannerRef} type="file" accept="image/*" hidden onChange={(e) => { pickBanner(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className={hint}>Баннер показывается в шапке вашего профиля.</p>

        <button onClick={onLogout} className="mt-8 w-full h-14 text-[18px] font-semibold" style={{ ...cardSt, width: "calc(100% - 32px)", color: "var(--mx-danger)" }}>Выйти</button>
      </div>
    </Sheet>
  );
}

function FoldersPage({ folders, onBack }: { folders: MFolder[]; onBack: () => void }) {
  const { toast } = useToast();
  const [edit, setEdit] = useState<MFolder | "new" | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [types, setTypes] = useState<MFolderType[]>([]);
  const [busy, setBusy] = useState(false);

  const open = (f: MFolder | "new") => {
    setEdit(f);
    setName(f === "new" ? "" : f.name);
    setEmoji(f === "new" ? "" : f.emoji ?? "");
    setTypes(f === "new" ? [] : f.includeTypes ?? []);
  };

  const save = async () => {
    setBusy(true);
    try {
      const base = { name: name.trim(), emoji: emoji.trim() || undefined, includeTypes: types };
      if (edit === "new") await mApi("folders", { action: "create", ...base });
      else if (edit) await mApi("folders", { action: "update", id: edit.id, ...base });
      setEdit(null);
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось сохранить папку");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: MFolder) => {
    if (!confirm(`Удалить папку «${f.name}»? Чаты останутся на месте.`)) return;
    try {
      await mApi("folders", { action: "delete", id: f.id });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось удалить");
    }
  };

  const toggleType = (t: MFolderType) => setTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const TYPE_LABELS: [MFolderType, string][] = [["dm", "Личные чаты"], ["group", "Группы"], ["channel", "Каналы"], ["unread", "Непрочитанные"]];

  return (
    <>
      <PageHeader title="Папки чатов" onBack={onBack} />
      <div className="mx-scroll flex-1 pt-3 pb-24">
        <Section footer="Папки появляются вкладками над списком чатов. Добавить конкретный чат в папку можно долгим нажатием на чат.">
          {folders.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => open(f)} className="flex-1 flex items-center gap-3 text-left">
                <span className="text-xl w-7">{f.emoji || "📁"}</span>
                <span>{f.name}</span>
              </button>
              <button onClick={() => remove(f)} className="p-1.5" style={{ color: "var(--mx-danger)" }} aria-label="Удалить"><Trash2 size={18} /></button>
            </div>
          ))}
          <button onClick={() => open("new")} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ color: "var(--mx-accent)" }}>
            <Plus size={20} /> Создать папку
          </button>
        </Section>
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "Новая папка" : "Папка"}>
        <div className="p-4 space-y-3 pb-8">
          <div className="flex gap-2">
            <input className="mx-input" style={{ width: 72, textAlign: "center" }} placeholder="🙂" maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
            <input className="mx-input" placeholder="Название папки" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <p className="mx-muted text-[13px] px-1">Что попадает в папку автоматически</p>
          <div className="mx-card">
            {TYPE_LABELS.map(([t, label]) => (
              <div key={t} className="flex items-center justify-between px-4 py-3">
                <span>{label}</span>
                <Switch on={types.includes(t)} onChange={() => toggleType(t)} />
              </div>
            ))}
          </div>
          <button className="mx-btn" disabled={busy || name.trim().length < 1} onClick={save}>{busy ? "Сохраняю…" : "Сохранить"}</button>
        </div>
      </Sheet>
    </>
  );
}

type MxSession = { id: string; deviceName: string; city: string; country: string; ip: string; lastActiveAt: number; current: boolean };

/** Устройства MiliGram: список сеансов с этого аккаунта, завершение отдельного или всех остальных. */
function DevicesPage({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<MxSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const d = await mApi<{ sessions: MxSession[] }>(`session?deviceId=${getDeviceId()}`);
      setSessions(d.sessions ?? []);
    } catch {
      toast("error", "Не удалось загрузить список устройств");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const end = async (body: Record<string, unknown>, ask: string) => {
    if (!confirm(ask)) return;
    try {
      await mApi("session/terminate", body);
      await load();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось завершить сеанс");
    }
  };

  const current = sessions.find((s) => s.current);
  const others = sessions.filter((s) => !s.current);
  const place = (s: MxSession) => [s.city, s.country].filter(Boolean).join(", ");
  return (
    <>
      <PageHeader title="Устройства" onBack={onBack} />
      <div className="mx-scroll flex-1 pt-3 pb-24">
        <Section title="Это устройство">
          {current ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <IconBox color="#34c759"><Laptop size={17} /></IconBox>
              <div><p>{current.deviceName}</p><p className="text-[13px] mx-muted">{place(current)} · сейчас в сети</p></div>
            </div>
          ) : (
            <p className="px-4 py-3 mx-muted">{loading ? "Загрузка…" : "Текущий сеанс ещё не зарегистрирован"}</p>
          )}
        </Section>
        <Section title="Активные сеансы" footer="Если видишь незнакомое устройство — заверши сеанс и смени пароль.">
          {others.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <IconBox color="#3390ec"><Smartphone size={17} /></IconBox>
              <div className="flex-1 min-w-0">
                <p className="truncate">{s.deviceName}</p>
                <p className="text-[13px] mx-muted truncate">{place(s)}{place(s) ? " · " : ""}{new Date(s.lastActiveAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <button onClick={() => end({ id: s.id }, "Завершить этот сеанс?")} className="text-[14px]" style={{ color: "var(--mx-danger)" }}>Завершить</button>
            </div>
          ))}
          {others.length === 0 && <p className="px-4 py-3 mx-muted">Других сеансов нет</p>}
        </Section>
        {others.length > 0 && (
          <div className="px-4">
            <button onClick={() => end({ others: true, currentDeviceId: getDeviceId() }, "Завершить все остальные сеансы?")} className="mx-btn" style={{ background: "var(--mx-surface)", color: "var(--mx-danger)" }}>Завершить все остальные сеансы</button>
          </div>
        )}
      </div>
    </>
  );
}

type PremiumInfo = { premium: boolean; premiumUntil: number | null; priceStars: number; days: number; wallet: number; plus?: boolean; plusUntil?: number | null; plusPriceStars?: number; plusDays?: number };

function PremiumPage({ onBack, account }: { onBack: () => void; account: MAccount }) {
  const { toast } = useToast();
  const [info, setInfo] = useState<PremiumInfo | null>(null);
  const load = () => mApi<PremiumInfo>("premium").then(setInfo).catch(() => {});
  const [agree, setAgree] = useState(false);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [orders, setOrders] = useState<{ orderId: string; plan: string; amount: number; status: string; createdAt: number }[]>([]);
  /** Сверяет оплату с платёжной системой и включает подписку, если счёт оплачен. */
  const sync = () => mApi<{ credited: number; orders: typeof orders }>("premium/pay").then((d) => { setOrders(d.orders); if (d.credited > 0) { toast("success", "Оплата получена — подписка активна ✨"); load(); } }).catch(() => {});
  useEffect(() => {
    load();
    sync();
    const on = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", on);
    window.addEventListener("focus", on);
    const t = setInterval(on, 15000);
    return () => { document.removeEventListener("visibilitychange", on); window.removeEventListener("focus", on); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pay = async (plan: "premium" | "plus") => {
    if (!agree) { toast("error", "Отметь, что согласен с условиями и документами"); return; }
    setPayBusy(plan);
    try {
      const r = await mApi<{ url: string }>("premium/pay", { plan, accept: true });
      window.open(r.url, "_blank");
      toast("info", "Оплати счёт и вернись сюда — подписка включится сама");
      sync();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось создать платёж");
    } finally {
      setPayBusy(null);
    }
  };
  const buy = async () => {
    if (!info || !confirm(`Купить Mili Premium на ${info.days} дн. за ${info.priceStars} 🪙?`)) return;
    try {
      await mApi("premium", { action: "buy" });
      toast("success", "Mili Premium активен ✨");
      load();
    } catch (err: any) {
      toast("error", err?.message || "Не получилось");
    }
  };
  const buyPlus = async () => {
    if (!info || !confirm(`Подключить Премиум Плюс на ${info.plusDays ?? 30} дн. за ${info.plusPriceStars ?? 49} 🪙?`)) return;
    try {
      await mApi("premium", { action: "buy-plus" });
      toast("success", "Премиум Плюс активен 💫");
      load();
    } catch (err: any) {
      toast("error", err?.message || "Не получилось");
    }
  };
  return (
    <>
      <PageHeader title="Mili Premium" onBack={onBack} />
      <div className="mx-scroll flex-1 pt-4 pb-24 px-4 space-y-4">
        <div className="mx-card"><div className="px-5 py-6 text-center">
          <div className="text-5xl mb-2">⭐</div>
          <p className="text-[19px] font-semibold mb-1">{info?.premium ? "Premium активен" : "Mili Premium"}</p>
          <p className="mx-muted text-[14px]">{info?.premium && info.premiumUntil ? `До ${new Date(info.premiumUntil).toLocaleDateString("ru-RU")}` : "Статус рядом с ником, премиум-стикеры, больше папок и закреплённых чатов."}</p>
        </div></div>
        {info && (
          <div className="mx-card p-4 space-y-2" style={{ outline: info.plus ? "2px solid #ffb400" : "none" }}>
            <div className="flex items-center justify-between"><p className="text-[17px] font-semibold">💫 Премиум Плюс</p><span className="font-semibold" style={{ color: "#ffb400" }}>{info.plusPriceStars ?? 49} 🪙 / {info.plusDays ?? 30} дн.</span></div>
            <p className="mx-muted text-[13.5px]">Всё из Premium + платные сообщения: назначьте цену в 🪙, и каждое сообщение от новых людей будет приносить вам монеты на баланс. Операции — на странице «Кошелёк 🪙».</p>
            {info.plus && info.plusUntil && <p className="text-[13px]" style={{ color: "#ffb400" }}>Активен до {new Date(info.plusUntil).toLocaleDateString("ru-RU")}</p>}
            <button className="mx-btn" onClick={buyPlus}>{info.plus ? "Продлить Плюс" : "Подключить Плюс"}</button>
          </div>
        )}
        <div className="mx-card p-4 space-y-3">
          <div>
            <p className="text-[17px] font-semibold">💳 Оплата картой, СБП, криптой</p>
            <p className="mx-muted text-[13.5px]">Разовый платёж на 30 дней, без автопродления. Подписка включится сама сразу после оплаты.</p>
          </div>
          <label className="flex items-start gap-2.5 text-[13.5px] cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-[18px] h-[18px] shrink-0" style={{ accentColor: "var(--mx-accent)" }} />
            <span>Я ознакомился и принимаю {PAY_DOCS.map((d, i) => <span key={d.href}>{i > 0 ? (i === PAY_DOCS.length - 1 ? " и " : ", ") : ""}<a href={d.href} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--mx-accent)" }} onClick={(e) => e.stopPropagation()}>{d.title}</a></span>)}</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button className="mx-btn" disabled={!!payBusy} style={{ opacity: agree ? 1 : 0.55 }} onClick={() => pay("premium")}>{payBusy === "premium" ? <Spinner size={18} /> : `Premium · ${PREMIUM_PRICE_RUB} ₽`}</button>
            <button className="mx-btn" disabled={!!payBusy} style={{ opacity: agree ? 1 : 0.55, background: "#ffb400", color: "#1a1300" }} onClick={() => pay("plus")}>{payBusy === "plus" ? <Spinner size={18} /> : `Плюс · ${PLUS_PRICE_RUB} ₽`}</button>
          </div>
          {orders.length > 0 && (
            <div className="pt-1 space-y-1.5">
              {orders.slice(0, 3).map((o) => (
                <div key={o.orderId} className="flex items-center justify-between text-[13px]">
                  <span className="mx-muted">{o.plan === "plus" ? "Плюс" : "Premium"} · {o.amount} ₽ · {new Date(o.createdAt).toLocaleDateString("ru-RU")}</span>
                  <span style={{ color: o.status === "paid" ? "#34c759" : o.status === "pending" ? "#ffb400" : "var(--mx-muted)" }}>{o.status === "paid" ? "оплачено" : o.status === "pending" ? "ждём оплату" : "отменён"}</span>
                </div>
              ))}
              {orders.some((o) => o.status === "pending") && <button className="mx-btn-ghost w-full py-2" onClick={sync}>Проверить оплату</button>}
            </div>
          )}
        </div>
        <PerksList />
        <StatusPicker account={account} premium={!!info?.premium} />
        {info ? (
          <>
            <p className="mx-muted text-[13px] text-center">{info.priceStars} 🪙 за {info.days} дн. · на кошельке: {info.wallet} 🪙 · <button className="underline" style={{ color: "var(--mx-accent)" }} onClick={() => startTopup(Math.max(10, info.priceStars - info.wallet)).then(() => toast("info", "Оплати счёт в Telegram и вернись сюда")).catch((e) => toast("error", e instanceof MApiError ? e.message : "Не удалось создать счёт"))}>пополнить</button></p>
            <button className="mx-btn" onClick={buy}>{info.premium ? "Продлить" : "Купить Premium"}</button>
          </>
        ) : (
          <p className="mx-muted text-center">Загрузка…</p>
        )}
      </div>
    </>
  );
}

export function SettingsPane({ me, account, folders, onLoggedOut, initialPage }: { me: string; account: MAccount; folders: MFolder[]; onLoggedOut: () => void; initialPage?: Page }) {
  const { toast } = useToast();
  const { logout } = useAuth();
  const prefs = useMxPrefs();
  const [page, setPage] = useState<Page>(initialPage ?? null);
  const [editProfile, setEditProfile] = useState(false);
  const [myGifts, setMyGifts] = useState(false);
  const [myNumbers, setMyNumbers] = useState(false);
  const [trackPicker, setTrackPicker] = useState(false);
  const [myPosts, setMyPosts] = useState(false);
  const [shop, setShop] = useState(false);
  const [viewAs, setViewAs] = useState(false);
  const profileGifts = useProfileGifts(me);
  const orbitGifts = profileGifts?.filter((g) => g.pinned && !g.hidden) ?? [];
  const [installHelp, setInstallHelp] = useState(false);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mApi<{ sessions: unknown[] }>(`session?deviceId=${getDeviceId()}`).then((d) => setSessionCount(d.sessions?.length ?? 0)).catch(() => {});
  }, [me]);

  const setShowLastSeen = async (v: boolean) => {
    try {
      await mApi("profile", { showLastSeen: v });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось сохранить");
    }
  };

  const clearDrafts = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("mx-draft-")).forEach((k) => localStorage.removeItem(k));
      toast("success", "Черновики удалены");
    } catch {}
  };

  const pickAvatarQuick = async (f: File | undefined) => {
    if (!f) return;
    setAvatarBusy(true);
    try {
      const up = await mUpload(await squareAvatar(f), "avatar", { fileName: "avatar.jpg" });
      await mApi("profile", { photoURL: up.url });
      toast("success", "Фото обновлено");
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось загрузить фото");
    } finally {
      setAvatarBusy(false);
    }
  };

  const back = () => setPage(null);

  if (page === "folders") return <div className="flex flex-col h-full"><FoldersPage folders={folders} onBack={back} /></div>;
  if (page === "devices") return <div className="flex flex-col h-full"><DevicesPage onBack={back} /></div>;
  if (page === "docs") {
    const docs: [string, string, string][] = [["/rules", "Правила платформы", "Что можно и нельзя в Velox Trade и MiliGram"], ["/privacy", "Политика конфиденциальности", "Какие данные мы храним и как защищаем"], ["/terms", "Пользовательское соглашение", "Условия использования сервиса"], ["/premium-terms", "Условия подписки Mili Premium", "Оплата, срок действия и возврат"]];
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Документы" onBack={back} />
        <div className="mx-scroll flex-1 pt-4 pb-24 px-4 space-y-4">
          <div className="mx-card">
            {docs.map(([href, title, sub]) => (
              <a key={href} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3.5 px-4 py-3 active:bg-white/5">
                <IconBox color="#8e8e93"><FileText size={17} /></IconBox>
                <span className="flex-1 min-w-0"><span className="block text-[16px]">{title}</span><span className="block mx-muted text-[13px]">{sub}</span></span>
                <ChevronRight size={18} className="mx-muted" />
              </a>
            ))}
          </div>
          <p className="mx-muted text-[12.5px] px-2">Администрация может открывать переписку только для безопасности (по жалобе или при расследовании нарушений), каждый такой доступ записывается в журнал. Подробнее — в Политике конфиденциальности, п. 5.3–5.5.</p>
        </div>
      </div>
    );
  }
  if (page === "admin" && isAdminUid(me)) return <div className="flex flex-col h-full"><AdminPanel onBack={back} /></div>;
  if (page === "music") return <div className="flex flex-col h-full"><MusicPage onBack={back} /></div>;
  if (page === "usernames") return <div className="flex flex-col h-full"><UsernamesPage onBack={back} /></div>;
  if (page === "wallet") return <div className="flex flex-col h-full"><WalletPage onBack={back} onOpenPremium={() => setPage("premium")} /></div>;
  if (page === "premium") return <div className="flex flex-col h-full"><PremiumPage onBack={back} account={account} /></div>;

  if (page) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          onBack={back}
          title={{ notifications: "Уведомления и звуки", data: "Данные и память", privacy: "Конфиденциальность", general: "Общие настройки", stickers: "Стикеры и эмодзи", language: "Язык", hotkeys: "Горячие клавиши", admin: "Админ-панель", docs: "Документы" }[page]}
        />
        <div className="mx-scroll flex-1 pt-3 pb-24 px-4">
          {page === "notifications" && (
            <div className="space-y-3">
              <PushToggleCard />
              <p className="mx-muted text-[13px] px-2">Уведомления о сообщениях мессенджера приходят в категории «Сообщения». На iPhone и iPad они работают только если добавить Velox Chat на экран «Домой» (iOS 16.4 и новее).</p>
              <button className="mx-btn" style={{ background: "var(--mx-surface)", color: "var(--mx-text)" }} onClick={() => setInstallHelp(true)}>Как добавить на экран «Домой»</button>
            </div>
          )}
          {page === "data" && (
            <div className="space-y-3">
              <div className="mx-card"><div className="px-4 py-3.5 text-[15px] mx-muted">Фото, голосовые и видео загружаются при просмотре и хранятся на сервере. Файлы, удалённые у всех, пропадают из чата.</div></div>
              <button className="mx-btn" style={{ background: "var(--mx-surface)", color: "var(--mx-danger)" }} onClick={clearDrafts}>Удалить все черновики на этом устройстве</button>
            </div>
          )}
          {page === "privacy" && (
            <div className="space-y-4">
              <div className="mx-card">
                <div className="flex items-center justify-between px-4 py-3.5 gap-4">
                  <div><p>Время последнего визита</p><p className="text-[13px] mx-muted">Если выключить, другие увидят «был(а) недавно», и вы тоже не увидите их время.</p></div>
                  <Switch on={account.showLastSeen !== false} onChange={setShowLastSeen} />
                </div>
              </div>
              {(["whoCanMessage", "whoCanAddToGroups"] as const).map((k) => {
                const privacy = account.privacy ?? { whoCanMessage: "everyone", whoCanAddToGroups: "everyone" };
                return (
                  <div key={k} className="mx-card">
                    <div className="flex items-center justify-between px-4 py-3.5 gap-4">
                      <span>{k === "whoCanMessage" ? "Кто может мне писать" : "Кто может добавлять меня в группы"}</span>
                      <select
                        value={privacy[k]}
                        onChange={(e) => mApi("profile", { privacy: { ...privacy, [k]: e.target.value } }).catch((err) => toast("error", err?.message || "Не удалось сохранить"))}
                        className="mx-input"
                        style={{ width: "auto", padding: "8px 12px" }}
                      >
                        <option value="everyone">Все</option>
                        <option value="nobody">Никто</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {page === "general" && (
            <div className="space-y-5">
              <div>
                <p className="mx-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Тема</p>
                <div className="mx-card">
                  {([["dark", "Тёмная"], ["light", "Светлая"], ["system", "Как в системе"]] as [MxTheme, string][]).map(([t, label]) => (
                    <button key={t} onClick={() => prefs.setTheme(t)} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
                      {label}
                      {prefs.theme === t && <Check size={20} style={{ color: "var(--mx-accent)" }} />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mx-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Акцентный цвет</p>
                <div className="mx-card px-4 py-3.5 flex gap-3 flex-wrap">
                  {ACCENT_CHOICES.map((c) => (
                    <button key={c || "default"} onClick={() => prefs.setAccent(c)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: c || "#3390ec", outline: prefs.accent === c ? "3px solid var(--mx-text)" : "none", outlineOffset: 2 }} aria-label="Цвет">
                      {prefs.accent === c && <Check size={18} color="#fff" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mx-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Тема чатов</p>
                <div className="mx-card p-3">
                  <div className="grid grid-cols-3 gap-2.5">
                    {([["Классика", "none", "round", false], ["Контур", "noir", "outline", false], ["Аврора", "aurora", "round", false], ["Закат", "sunset", "round", false], ["Океан", "ocean", "round", false], ["Лес", "forest", "round", false], ["Полночь", "midnight", "round", false], ["Сладкая вата", "candy", "round", false], ["Хеллоуин 🎃", "halloween", "classic", false], ["💫 Живой поток", "flow", "glass", true], ["⚡ Неон", "neon", "glass", true], ["👑 Золото", "gold", "outline", true], ["🌌 Космос", "space", "glass", true]] as const).map(([label, wp, bs, pro]) => {
                      const on = prefs.wallpaper === wp && prefs.bubbleStyle === bs;
                      const locked = pro && !isPremium(account);
                      return (
                        <button key={label} onClick={() => { if (locked) { toast("error", "Эта тема — только для Premium"); setPage("premium"); return; } prefs.setWallpaper(wp); prefs.setBubbleStyle(bs); }} className="text-center" aria-label={label}>
                          <span className={`block h-[118px] rounded-2xl relative overflow-hidden mx-chat-wall ${wp !== "none" ? `mx-wp mx-wp-${wp}` : ""}`} style={{ ["--mx-in" as string]: "#1f2126", ["--mx-text" as string]: "#f4f4f5", background: wp === "none" ? "#17212b" : undefined, outline: on ? "3px solid var(--mx-accent)" : "1px solid var(--mx-line)", outlineOffset: on ? 2 : -1 }}>
                            <span className="absolute left-2 right-2 top-3 flex flex-col gap-1.5">
                              <span className="mx-bubble in self-start" data-bubble={bs} style={{ fontSize: 9, padding: "4px 7px", borderRadius: 10 }}>Привет!</span>
                              <span className="mx-bubble out self-end" data-bubble={bs} style={{ fontSize: 9, padding: "4px 7px", borderRadius: 10 }}>Как дела?</span>
                            </span>
                            {pro && <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.55)", color: "#ffd56a" }}>{locked ? "🔒 PRO" : "PRO"}</span>}
                            {on && <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--mx-accent)" }}><Check size={13} color="#fff" /></span>}
                          </span>
                          <span className="block text-[12.5px] mt-1.5">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <p className="mx-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Шрифт</p>
                <div className="mx-card">
                  {FONT_CHOICES.map((f) => (
                    <button key={f.id || "default"} onClick={() => prefs.setFont(f.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                      <span className="text-[16px]" style={f.css ? { fontFamily: f.css } : undefined}>{f.label}<span className="block text-[13px] mx-muted" style={f.css ? { fontFamily: f.css } : undefined}>Привет! Как дела? 123</span></span>
                      {prefs.font === f.id && <Check size={18} style={{ color: "var(--mx-accent)" }} />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mx-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Размер текста: {prefs.textSize}</p>
                <div className="mx-card px-4 py-4 flex items-center gap-3">
                  <span className="text-[13px]">A</span>
                  <input type="range" min={13} max={19} step={1} value={prefs.textSize} onChange={(e) => prefs.setTextSize(Number(e.target.value))} className="flex-1" style={{ accentColor: "var(--mx-accent)" }} />
                  <span className="text-[20px]">A</span>
                </div>
              </div>
              <div className="mx-card">
                <div className="flex items-center justify-between px-4 py-3.5 gap-4">
                  <div><p>Enter — отправить</p><p className="text-[13px] mx-muted">На компьютере. Shift+Enter — перенос строки.</p></div>
                  <Switch on={prefs.enterToSend} onChange={prefs.setEnterToSend} />
                </div>
              </div>
            </div>
          )}
          {page === "stickers" && <StickersSettings />}
          {page === "language" && (
            <div className="mx-card"><div className="flex items-center justify-between px-4 py-3.5">Русский <Check size={20} style={{ color: "var(--mx-accent)" }} /></div></div>
          )}
          {page === "hotkeys" && (
            <div className="mx-card">
              {[["Enter", "Отправить сообщение"], ["Shift + Enter", "Новая строка"], ["Esc", "Закрыть просмотр / окно"], ["← →", "Листать фото и истории"], ["Правая кнопка мыши", "Меню сообщения"], ["Двойной клик", "Поставить ❤️"]].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-4 py-3"><span className="font-mono text-[13px] px-2 py-0.5 rounded-md" style={{ background: "var(--mx-surface2)" }}>{k}</span><span className="mx-muted text-[14px]">{v}</span></div>
              ))}
            </div>
          )}
        </div>
        <Sheet open={installHelp} onClose={() => setInstallHelp(false)} title="Добавить на экран «Домой»">
          <InstallSteps />
        </Sheet>
      </div>
    );
  }

  const status = account.showLastSeen === false ? "был(а) недавно" : "в сети";
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Настройки" />
      <div className="mx-scroll flex-1 pb-28">
        <div className="mx-3 mt-1 mb-1 overflow-hidden" style={{ borderRadius: 30 }}>
        <ProfileShell>
        <ProfileHeader
          seed={me}
          name={account.displayName}
          photo={account.photoURL}
          account={account}
          badges={<><VerifyMark acc={account} size={20} /><TagChip acc={account} light /><StatusBadge acc={account} size={20} /></>}
          statusPill={status}
          subtitle={<>{account.number ? `${formatNumber(account.number)} · ` : ""}@{account.handle}{isPremium(account) ? " · Premium" : ""}</>}
          onAvatarClick={() => fileRef.current?.click()}
          avatarBusy={avatarBusy}
          avatarOverlay={<span className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--mx-accent)", color: "#fff", border: "3px solid rgba(0,0,0,0.25)" }}><Camera size={15} /></span>}
          topRight={<><ProfileRoundBtn icon={<Eye size={17} />} label="Как видят другие" onClick={() => setViewAs(true)} /><ProfileRoundBtn icon={<Pencil size={17} />} label="Изменить" onClick={() => setEditProfile(true)} /></>}
        />
        </ProfileShell>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickAvatarQuick(e.target.files?.[0]); e.target.value = ""; }} />
        <div style={{ height: 12 }} />

        <Section>
          {account.numId ? <div className="w-full px-4 py-3 text-left"><span className="block mx-muted text-[12.5px]">Идентификатор</span><span className="block tabular-nums">ID: {account.numId}</span></div> : null}
          {account.number && <button onClick={() => setMyNumbers(true)} className="w-full px-4 py-3 text-left flex items-center justify-between gap-3"><span><span className="block mx-muted text-[12.5px]">Номер</span><span className="block tabular-nums">{formatNumber(account.number)}</span></span><NumberTierChip digits={account.number} /></button>}
          <UsernameRow uid={account.uid} handle={account.handle} onCopy={(t) => { navigator.clipboard?.writeText(t).then(() => toast("success", "Скопировано")).catch(() => {}); }} />
          <button onClick={() => setEditProfile(true)} className="w-full px-4 py-3 text-left"><p className="mx-muted text-[12.5px]">О себе</p><p>{account.bio || "Добавь пару слов о себе"}</p></button>
          <button onClick={() => setEditProfile(true)} className="w-full px-4 py-3 text-left"><p className="mx-muted text-[12.5px]">День рождения</p><p>{account.birthday ? new Date(account.birthday).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "Не указан"}</p></button>
        </Section>
        <Section>
          <Row icon={<ShoppingBag size={17} />} color="#ff9f0a" label="Магазин" value="Рамки, подарки, мелодии" onClick={() => setShop(true)} />
          <Row icon={<Gift size={17} />} color="#ff2d55" label="Мои подарки" onClick={() => setMyGifts(true)} />
          <Row icon={<MessageSquare size={17} />} color="#0a84ff" label="Мои посты" onClick={() => setMyPosts(true)} />
          <Row icon={<Hash size={17} />} color="#5856d6" label="Мои номера" value={account.number ? formatNumber(account.number) : undefined} onClick={() => setMyNumbers(true)} />
          <Row icon={<Star size={17} />} color="#5856d6" label="Юзернеймы" onClick={() => setPage("usernames")} />
          <Row icon={<Music2 size={17} />} color="#1db954" label="Мелодия профиля" value={account.profileTrack ? "Выбрана" : "Не выбрана"} onClick={() => setTrackPicker(true)} />
          <Row icon={<Folder size={17} />} color="#3390ec" label="Папки чатов" value={folders.length ? String(folders.length) : undefined} onClick={() => setPage("folders")} />
          <Row icon={<Smartphone size={17} />} color="#3390ec" label="Устройства" value={sessionCount ? String(sessionCount) : undefined} onClick={() => setPage("devices")} />
        </Section>

        <Section>
          <Row icon={<Bell size={17} />} color="#ff3b30" label="Уведомления и звуки" onClick={() => setPage("notifications")} />
          <Row icon={<LockKeyhole size={17} />} color="#8e8e93" label="Конфиденциальность" onClick={() => setPage("privacy")} />
          <Row icon={<Database size={17} />} color="#34c759" label="Данные и память" onClick={() => setPage("data")} />
          <Row icon={<Settings size={17} />} color="#8e8e93" label="Общие настройки" onClick={() => setPage("general")} />
          <Row icon={<Sticker size={17} />} color="#ff2d55" label="Стикеры и эмодзи" onClick={() => setPage("stickers")} />
          <Row icon={<Music2 size={17} />} color="#1db954" label="Музыка" onClick={() => setPage("music")} />
          <Row icon={<Languages size={17} />} color="#af52de" label="Язык" value="Русский" onClick={() => setPage("language")} />
          <div className="max-[899px]:hidden"><Row icon={<Keyboard size={17} />} color="#ff9500" label="Горячие клавиши" onClick={() => setPage("hotkeys")} /></div>
          <Row icon={<Download size={17} />} color="#00b8d9" label="Добавить на экран «Домой»" onClick={() => setInstallHelp(true)} />
        </Section>

        <Section>
          <Row icon={<Star size={17} />} color="#34c759" label="Кошелёк 🪙" value={account.plusUntil && account.plusUntil > Date.now() ? "Плюс" : undefined} onClick={() => setPage("wallet")} />
          <Row icon={<Star size={17} />} color="#ffb400" label="Mili Premium" value={isPremium(account) ? "активен" : undefined} onClick={() => setPage("premium")} />
        </Section>

        <Section>
          <Row icon={<FileText size={17} />} color="#8e8e93" label="Документы" onClick={() => setPage("docs")} />
          {isAdminUid(me) && <Row icon={<Shield size={17} />} color="#ff453a" label="Админ-панель" onClick={() => setPage("admin")} />}
        </Section>

        <Section>
          <button
            onClick={async () => {
              if (!confirm("Выйти из аккаунта? Вы выйдете и с сайта Velox Trade.")) return;
              await logout();
              onLoggedOut();
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            style={{ color: "var(--mx-danger)" }}
          >
            <LogOut size={20} /> Выйти
          </button>
        </Section>

        <button
          className="block mx-auto text-center text-[11.5px] mx-muted pb-2 break-all px-6"
          onClick={() => { try { navigator.clipboard.writeText(me); toast("success", "ID аккаунта скопирован"); } catch { toast("info", me); } }}
        >
          ID аккаунта: {me}{isAdminUid(me) ? " · админ" : ""}
        </button>
        <div className="pb-4" />
      </div>
      <ProfileEditor open={editProfile} onClose={() => setEditProfile(false)} account={account} onLogout={async () => {
        if (!confirm("Выйти из аккаунта? Вы выйдете и с сайта Velox Trade.")) return;
        await logout();
        onLoggedOut();
      }} />
      <ChatInfoSheet
        open={viewAs}
        onClose={() => setViewAs(false)}
        preview
        chat={{ id: "__preview", type: "dm", members: [me, "__viewer"], admins: [], createdBy: me, createdAt: 0, updatedAt: 0, readBy: {} } as unknown as MChat}
        me="__viewer"
        accounts={{ [me]: account }}
        peer={account}
        isAdmin={false}
        onLeave={() => {}}
      />
      <ShopSheet open={shop} onClose={() => setShop(false)} me={me} account={account} />
      <NumbersSheet open={myNumbers} onClose={() => setMyNumbers(false)} me={me} />
      <ProfileTrackPicker open={trackPicker} onClose={() => setTrackPicker(false)} current={account.profileTrack} onPick={async (id) => {
        try { await mApi("profile", { profileTrack: id }); toast("success", id ? "Мелодия профиля выбрана" : "Мелодия убрана"); setTrackPicker(false); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); }
      }} />
      <Sheet open={myGifts} onClose={() => setMyGifts(false)} title="Мои подарки" full>
        {myGifts && <ProfileShell><GiftsProfileTab uid={me} mine /></ProfileShell>}
      </Sheet>
      <Sheet open={myPosts} onClose={() => setMyPosts(false)} title="Мои посты" full>
        {myPosts && <ProfileShell><div className="pt-3"><PostsTab uid={me} mine /></div></ProfileShell>}
      </Sheet>
      <Sheet open={installHelp} onClose={() => setInstallHelp(false)} title="Добавить на экран «Домой»">
        <InstallSteps />
      </Sheet>
    </div>
  );
}

export function InstallSteps() {
  return (
    <div className="px-5 pb-8 space-y-3 text-[15px]">
      <p><b>iPhone / iPad (Safari):</b> открой этот чат в Safari → кнопка «Поделиться» ⬆️ → «На экран “Домой”» → «Добавить». Приложение откроется отдельным окном, и там заработают уведомления (нужна iOS 16.4 или новее).</p>
      <p><b>Android (Chrome):</b> меню ⋮ → «Установить приложение» или «Добавить на главный экран».</p>
      <p><b>Компьютер (Chrome / Edge):</b> значок установки справа в адресной строке.</p>
      <p className="mx-muted text-[13px]">Уведомления на iPhone не приходят, если открыть сайт просто в браузере — только из установленного приложения.</p>
    </div>
  );
}

