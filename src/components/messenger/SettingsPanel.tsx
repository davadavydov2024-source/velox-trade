"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { BadgeCheck, Camera, FolderPlus, LogOut, Smartphone, Star, Trash2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useToast } from "@/lib/toastContext";
import { PushToggleCard } from "@/components/PushToggleCard";
import { getDeviceId, mApi, uploadMedia } from "@/lib/messenger/client";
import type { MessengerAccount, MessengerFolder } from "@/lib/messenger/types";
import { Avatar, cx, fmtListTime } from "./ui";

type Session = { id: string; deviceName: string; city: string; country: string; ip: string; lastActiveAt: number; current: boolean };
type PremiumInfo = { premium: boolean; premiumUntil: number | null; priceStars: number; days: number; wallet: number };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mx-3 mb-3 rounded-[20px] bg-surface p-4 space-y-3"><h2 className="text-xs uppercase tracking-wide text-white/40">{title}</h2>{children}</section>;
}

export function SettingsPanel({ uid, account, folders }: { uid: string; account: MessengerAccount; folders: MessengerFolder[] }) {
  const { toast } = useToast();
  const [name, setName] = useState(account.displayName);
  const [bio, setBio] = useState(account.bio ?? "");
  const [prem, setPrem] = useState<PremiumInfo | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [folderName, setFolderName] = useState("");
  const [folderTypes, setFolderTypes] = useState<string[]>(["dm"]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fail = (e: any) => toast("error", e?.message || "Не получилось");

  const loadSessions = () => mApi<{ sessions: Session[] }>(`session?deviceId=${getDeviceId()}`).then((d) => setSessions(d.sessions)).catch(() => {});
  const loadPrem = () => mApi<PremiumInfo>("premium").then(setPrem).catch(() => {});
  useEffect(() => { loadSessions(); loadPrem(); }, []);

  const saveProfile = async () => { try { await mApi("profile", { displayName: name, bio }); toast("success", "Сохранено"); } catch (e) { fail(e); } };
  async function pickAvatar(f?: File) {
    if (!f) return;
    setBusy(true);
    try { const url = await uploadMedia(f, "avatar", (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")); await mApi("profile", { photoURL: url }); } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function buy() {
    if (!confirm(`Купить Mili Premium на ${prem?.days} дн. за ${prem?.priceStars} ⭐?`)) return;
    try { await mApi("premium", { action: "buy" }); toast("success", "Mili Premium активен ⭐"); loadPrem(); } catch (e: any) { toast("error", e?.data?.needTopup ? `${e.message}` : e?.message || "Не получилось"); }
  }
  async function terminate(body: Record<string, unknown>) { try { await mApi("session/terminate", body); loadSessions(); } catch (e) { fail(e); } }
  async function addFolder() {
    if (!folderName.trim()) return;
    try { await mApi("folders", { action: "create", name: folderName, includeTypes: folderTypes }); setFolderName(""); } catch (e) { fail(e); }
  }
  const privacy = account.privacy ?? { whoCanMessage: "everyone", whoCanAddToGroups: "everyone" };
  const setPrivacy = (k: "whoCanMessage" | "whoCanAddToGroups", v: string) => mApi("profile", { privacy: { ...privacy, [k]: v } }).catch(fail);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-4">
      <div className="flex flex-col items-center pt-5 pb-4">
        <button onClick={() => fileRef.current?.click()} className="relative" disabled={busy}>
          <Avatar name={account.displayName} src={account.photoURL} size={96} className={busy ? "opacity-50" : ""} />
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-accent text-black flex items-center justify-center"><Camera size={16} /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
        <p className="text-xl font-bold mt-3 flex items-center gap-1">{account.displayName}{account.verified && <BadgeCheck size={18} className="text-accent" />}{prem?.premium && <Star size={16} className="text-yellow-400 fill-yellow-400" />}</p>
        <p className="text-sm text-white/40">@{account.handle}</p>
      </div>

      <Card title="Профиль">
        <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Имя" className="input-field py-2.5 text-sm" />
        <input autoComplete="off" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} placeholder="О себе" className="input-field py-2.5 text-sm" />
        <button onClick={saveProfile} className="btn-primary px-5 py-2 text-sm">Сохранить</button>
      </Card>

      <Card title="Mili Premium ⭐">
        {prem ? (
          <>
            <p className="text-sm text-white/70">{prem.premium ? `Активен до ${new Date(prem.premiumUntil!).toLocaleDateString("ru-RU")}` : "Премиум-стикеры, больше папок и закреплённых чатов."}</p>
            <p className="text-xs text-white/40">{prem.priceStars} ⭐ за {prem.days} дн. · на балансе кошелька: {prem.wallet} ⭐ · <a href="/profile/stars" className="text-accent underline">пополнить</a></p>
            <button onClick={buy} className="btn-primary px-5 py-2 text-sm">{prem.premium ? "Продлить" : "Купить Premium"}</button>
          </>
        ) : <p className="text-sm text-white/40">Загрузка…</p>}
      </Card>

      <Card title="Папки чатов">
        {folders.map((f) => (
          <div key={f.id} className="flex items-center justify-between text-sm"><span>{f.emoji} {f.name} <span className="text-white/30">· {(f.includeTypes ?? []).join(", ") || "вручную"}</span></span>
            <button onClick={() => mApi("folders", { action: "delete", id: f.id }).catch(fail)} className="text-red-300"><Trash2 size={16} /></button></div>
        ))}
        <input autoComplete="off" value={folderName} onChange={(e) => setFolderName(e.target.value)} maxLength={24} placeholder="Название новой папки" className="input-field py-2.5 text-sm" />
        <div className="flex flex-wrap gap-1.5">
          {([["dm", "Личные"], ["group", "Группы"], ["channel", "Каналы"], ["unread", "Непрочитанные"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFolderTypes((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))} className={cx("px-3 py-1 rounded-full text-xs", folderTypes.includes(id) ? "bg-accent text-black" : "bg-white/10 text-white/70")}>{label}</button>
          ))}
        </div>
        <button onClick={addFolder} className="btn-secondary px-4 py-2 text-sm flex items-center gap-2"><FolderPlus size={16} /> Создать папку</button>
        <p className="text-[11px] text-white/30">Новые чаты и сообщения сами попадают во все подходящие папки.</p>
      </Card>

      <Card title="Приватность">
        {([["whoCanMessage", "Кто может мне писать"], ["whoCanAddToGroups", "Кто может добавлять меня в группы"]] as const).map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm">{label}
            <select defaultValue={privacy[k]} onChange={(e) => setPrivacy(k, e.target.value)} className="input-field py-1.5 text-sm w-auto"><option value="everyone">Все</option><option value="nobody">Никто</option></select>
          </label>
        ))}
      </Card>

      <Card title="Устройства">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 text-sm">
            <Smartphone size={20} className="text-accent shrink-0" />
            <div className="min-w-0 flex-1"><p className="truncate">{s.deviceName}{s.current && <span className="text-accent"> · это устройство</span>}</p><p className="text-xs text-white/40 truncate">{[s.city, s.country].filter(Boolean).join(", ")} · {fmtListTime(s.lastActiveAt)}</p></div>
            {!s.current && <button onClick={() => terminate({ id: s.id })} className="text-xs text-red-300">Завершить</button>}
          </div>
        ))}
        {sessions.length > 1 && <button onClick={() => confirm("Завершить все остальные сеансы?") && terminate({ others: true, currentDeviceId: getDeviceId() })} className="text-sm text-red-300">Завершить все остальные</button>}
      </Card>

      <div className="mx-3 mb-3"><PushToggleCard /></div>

      <button onClick={() => signOut(auth)} className="mx-3 w-[calc(100%-1.5rem)] flex items-center justify-center gap-2 py-3 rounded-[16px] bg-surface text-red-300"><LogOut size={18} /> Выйти</button>
      <p className="text-center text-[11px] text-white/25 mt-3">MiliGram · сообщения не имеют сквозного шифрования</p>
    </div>
  );
}
