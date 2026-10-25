"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Bell, Camera, Check, ChevronRight, Database, Folder, Keyboard, Languages, LockKeyhole, LogOut, Palette, Settings, Smartphone, Sticker, Trash2, Plus, Laptop, Download } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { PushToggleCard } from "@/components/PushToggleCard";
import { canManageSessions, getCurrentSession, getDeviceId, listSessions, msUntilCanManage, terminateSession } from "@/lib/sessions";
import { UserSession } from "@/types";
import { mApi, mUpload, MApiError } from "./api";
import { Avatar, IconBox, PageHeader, Section, Sheet, Switch } from "./ui";
import { ACCENT_CHOICES, MxTheme, useMxPrefs } from "./prefs";
import { MAccount, MFolder, MFolderType } from "./mtypes";

export type Page = null | "notifications" | "data" | "privacy" | "general" | "folders" | "stickers" | "devices" | "language" | "hotkeys";

function Row({ icon, color, label, value, onClick, right }: { icon: ReactNode; color: string; label: string; value?: string; onClick?: () => void; right?: ReactNode }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3 text-left active:bg-white/5">
      <IconBox color={color}>{icon}</IconBox>
      <span className="flex-1 text-[16px]">{label}</span>
      {value && <span className="vc-muted text-[15px]">{value}</span>}
      {right}
      {onClick && !right && <ChevronRight size={18} className="vc-muted" />}
    </button>
  );
}

/** Квадратная обрезка по центру до 512 px — аватарка без отдельного окна обрезки. */
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

function ProfileEditor({ open, onClose, account }: { open: boolean; onClose: () => void; account: MAccount }) {
  const { toast } = useToast();
  const [name, setName] = useState(account.displayName);
  const [handle, setHandle] = useState(account.handle);
  const [bio, setBio] = useState(account.bio ?? "");
  const [birthday, setBirthday] = useState(account.birthday ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(account.displayName);
      setHandle(account.handle);
      setBio(account.bio ?? "");
      setBirthday(account.birthday ?? "");
    }
  }, [open, account]);

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await mApi("profile", { displayName: name.trim(), handle: handle.trim().replace(/^@/, ""), bio: bio.trim(), birthday: birthday || undefined, ...extra });
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

  return (
    <Sheet open={open} onClose={onClose} title="Профиль" full>
      <div className="p-4 space-y-3 pb-10">
        <div className="flex flex-col items-center gap-2 pb-2">
          <button onClick={() => fileRef.current?.click()} className="relative" disabled={busy}>
            <Avatar src={account.photoURL} name={account.displayName} seed={account.uid} size={96} />
            <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--vc-accent)", color: "var(--vc-accent-text)", border: "3px solid var(--vc-surface)" }}><Camera size={15} /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="vc-muted text-[13px]">Нажми, чтобы сменить фото</p>
        </div>
        <label className="block"><span className="vc-muted text-[13px] px-1">Имя</span><input className="vc-input mt-1" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="vc-muted text-[13px] px-1">Имя пользователя</span><input className="vc-input mt-1" value={handle} maxLength={32} autoCapitalize="none" autoCorrect="off" onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_@]/g, ""))} /></label>
        <label className="block"><span className="vc-muted text-[13px] px-1">О себе</span><textarea className="vc-input mt-1" rows={3} maxLength={140} value={bio} onChange={(e) => setBio(e.target.value)} /></label>
        <label className="block"><span className="vc-muted text-[13px] px-1">День рождения</span><input type="date" className="vc-input mt-1" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label>
        <button className="vc-btn" disabled={busy || name.trim().length < 2 || handle.replace("@", "").length < 5} onClick={() => save()}>{busy ? "Сохраняю…" : "Сохранить"}</button>
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
      if (edit === "new") await mApi("folders", { action: "create", folder: { ...base, order: folders.length } });
      else if (edit) await mApi("folders", { action: "update", folderId: edit.id, folder: { ...base, order: edit.order } });
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
      await mApi("folders", { action: "delete", folderId: f.id });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось удалить");
    }
  };

  const toggleType = (t: MFolderType) => setTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const TYPE_LABELS: [MFolderType, string][] = [["dm", "Личные чаты"], ["group", "Группы"], ["channel", "Каналы"], ["unread", "Непрочитанные"]];

  return (
    <>
      <PageHeader title="Папки чатов" onBack={onBack} />
      <div className="vc-scroll flex-1 pt-3 pb-24">
        <Section footer="Папки появляются вкладками над списком чатов. Добавить конкретный чат в папку можно долгим нажатием на чат.">
          {folders.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => open(f)} className="flex-1 flex items-center gap-3 text-left">
                <span className="text-xl w-7">{f.emoji || "📁"}</span>
                <span>{f.name}</span>
              </button>
              <button onClick={() => remove(f)} className="p-1.5" style={{ color: "var(--vc-danger)" }} aria-label="Удалить"><Trash2 size={18} /></button>
            </div>
          ))}
          <button onClick={() => open("new")} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ color: "var(--vc-accent)" }}>
            <Plus size={20} /> Создать папку
          </button>
        </Section>
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "Новая папка" : "Папка"}>
        <div className="p-4 space-y-3 pb-8">
          <div className="flex gap-2">
            <input className="vc-input" style={{ width: 72, textAlign: "center" }} placeholder="🙂" maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
            <input className="vc-input" placeholder="Название папки" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <p className="vc-muted text-[13px] px-1">Что попадает в папку автоматически</p>
          <div className="vc-card">
            {TYPE_LABELS.map(([t, label]) => (
              <div key={t} className="flex items-center justify-between px-4 py-3">
                <span>{label}</span>
                <Switch on={types.includes(t)} onChange={() => toggleType(t)} />
              </div>
            ))}
          </div>
          <button className="vc-btn" disabled={busy || name.trim().length < 1} onClick={save}>{busy ? "Сохраняю…" : "Сохранить"}</button>
        </div>
      </Sheet>
    </>
  );
}

function DevicesPage({ uid, onBack }: { uid: string; onBack: () => void }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [current, setCurrent] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const deviceId = typeof window !== "undefined" ? getDeviceId() : "";

  const load = async () => {
    try {
      const [list, cur] = await Promise.all([listSessions(uid), getCurrentSession(uid)]);
      setSessions(list);
      setCurrent(cur);
    } catch {
      toast("error", "Не удалось загрузить список устройств");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const can = canManageSessions(current);
  const wait = msUntilCanManage(current);

  const end = async (target: string | "all") => {
    if (!confirm(target === "all" ? "Завершить все остальные сеансы?" : "Завершить этот сеанс?")) return;
    try {
      await terminateSession(target);
      await load();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось завершить сеанс");
    }
  };

  return (
    <>
      <PageHeader title="Устройства" onBack={onBack} />
      <div className="vc-scroll flex-1 pt-3 pb-24">
        <Section title="Этот сеанс">
          {sessions.filter((s) => s.deviceId === deviceId).map((s) => (
            <div key={s.deviceId} className="flex items-center gap-3 px-4 py-3">
              <IconBox color="#34c759"><Laptop size={17} /></IconBox>
              <div><p>{s.deviceLabel}</p><p className="text-[13px] vc-muted">Сейчас в сети</p></div>
            </div>
          ))}
          {!loading && !sessions.some((s) => s.deviceId === deviceId) && <p className="px-4 py-3 vc-muted">Текущий сеанс ещё не зарегистрирован</p>}
        </Section>
        <Section title="Активные сеансы" footer={!can ? `Завершать другие сеансы можно через ${Math.ceil(wait / 3_600_000)} ч. после входа на этом устройстве — так аккаунт защищён, если им завладел чужой человек.` : undefined}>
          {sessions.filter((s) => s.deviceId !== deviceId).map((s) => (
            <div key={s.deviceId} className="flex items-center gap-3 px-4 py-3">
              <IconBox color="#3390ec"><Smartphone size={17} /></IconBox>
              <div className="flex-1 min-w-0"><p className="truncate">{s.deviceLabel}</p><p className="text-[13px] vc-muted">Активность: {new Date(s.lastActiveAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
              <button disabled={!can} onClick={() => end(s.deviceId)} className="text-[14px] disabled:opacity-40" style={{ color: "var(--vc-danger)" }}>Завершить</button>
            </div>
          ))}
          {sessions.filter((s) => s.deviceId !== deviceId).length === 0 && <p className="px-4 py-3 vc-muted">Других сеансов нет</p>}
        </Section>
        {sessions.length > 1 && (
          <div className="px-4"><button disabled={!can} onClick={() => end("all")} className="vc-btn" style={{ background: "var(--vc-surface)", color: "var(--vc-danger)" }}>Завершить все остальные сеансы</button></div>
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
  const [installHelp, setInstallHelp] = useState(false);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listSessions(me).then((l) => setSessionCount(l.length)).catch(() => {});
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
      Object.keys(localStorage).filter((k) => k.startsWith("vc-draft-")).forEach((k) => localStorage.removeItem(k));
      toast("success", "Черновики удалены");
    } catch {}
  };

  const pickAvatarQuick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const up = await mUpload(await squareAvatar(f), "avatar", { fileName: "avatar.jpg" });
      await mApi("profile", { photoURL: up.url });
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось загрузить фото");
    }
  };

  const back = () => setPage(null);

  if (page === "folders") return <div className="flex flex-col h-full"><FoldersPage folders={folders} onBack={back} /></div>;
  if (page === "devices") return <div className="flex flex-col h-full"><DevicesPage uid={me} onBack={back} /></div>;

  if (page) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          onBack={back}
          title={{ notifications: "Уведомления и звуки", data: "Данные и память", privacy: "Конфиденциальность", general: "Общие настройки", stickers: "Стикеры и эмодзи", language: "Язык", hotkeys: "Горячие клавиши" }[page]}
        />
        <div className="vc-scroll flex-1 pt-3 pb-24 px-4">
          {page === "notifications" && (
            <div className="space-y-3">
              <PushToggleCard />
              <p className="vc-muted text-[13px] px-2">Уведомления о сообщениях мессенджера приходят в категории «Сообщения». На iPhone и iPad они работают только если добавить Velox Chat на экран «Домой» (iOS 16.4 и новее).</p>
              <button className="vc-btn" style={{ background: "var(--vc-surface)", color: "var(--vc-text)" }} onClick={() => setInstallHelp(true)}>Как добавить на экран «Домой»</button>
            </div>
          )}
          {page === "data" && (
            <div className="space-y-3">
              <div className="vc-card"><div className="px-4 py-3.5 text-[15px] vc-muted">Фото, голосовые и видео загружаются при просмотре и хранятся на сервере. Файлы, удалённые у всех, пропадают из чата.</div></div>
              <button className="vc-btn" style={{ background: "var(--vc-surface)", color: "var(--vc-danger)" }} onClick={clearDrafts}>Удалить все черновики на этом устройстве</button>
            </div>
          )}
          {page === "privacy" && (
            <div className="space-y-4">
              <div className="vc-card">
                <div className="flex items-center justify-between px-4 py-3.5 gap-4">
                  <div><p>Время последнего визита</p><p className="text-[13px] vc-muted">Если выключить, другие увидят «был(а) недавно», и вы тоже не увидите их время.</p></div>
                  <Switch on={account.showLastSeen !== false} onChange={setShowLastSeen} />
                </div>
              </div>
            </div>
          )}
          {page === "general" && (
            <div className="space-y-5">
              <div>
                <p className="vc-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Тема</p>
                <div className="vc-card">
                  {([["dark", "Тёмная"], ["light", "Светлая"], ["system", "Как в системе"]] as [MxTheme, string][]).map(([t, label]) => (
                    <button key={t} onClick={() => prefs.setTheme(t)} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
                      {label}
                      {prefs.theme === t && <Check size={20} style={{ color: "var(--vc-accent)" }} />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="vc-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Акцентный цвет</p>
                <div className="vc-card px-4 py-3.5 flex gap-3 flex-wrap">
                  {ACCENT_CHOICES.map((c) => (
                    <button key={c || "default"} onClick={() => prefs.setAccent(c)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: c || "var(--color-accent, #ff9800)", outline: prefs.accent === c ? "3px solid var(--vc-text)" : "none", outlineOffset: 2 }} aria-label="Цвет">
                      {prefs.accent === c && <Check size={18} color="#fff" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="vc-muted text-[13px] uppercase tracking-wide px-3 mb-1.5">Размер текста: {prefs.textSize}</p>
                <div className="vc-card px-4 py-4 flex items-center gap-3">
                  <span className="text-[13px]">A</span>
                  <input type="range" min={13} max={19} step={1} value={prefs.textSize} onChange={(e) => prefs.setTextSize(Number(e.target.value))} className="flex-1" style={{ accentColor: "var(--vc-accent)" }} />
                  <span className="text-[20px]">A</span>
                </div>
              </div>
              <div className="vc-card">
                <div className="flex items-center justify-between px-4 py-3.5 gap-4">
                  <div><p>Enter — отправить</p><p className="text-[13px] vc-muted">На компьютере. Shift+Enter — перенос строки.</p></div>
                  <Switch on={prefs.enterToSend} onChange={prefs.setEnterToSend} />
                </div>
              </div>
            </div>
          )}
          {page === "stickers" && <div className="vc-card"><div className="px-4 py-5 text-center vc-muted">Стикеры появятся позже. Эмодзи доступны в поле ввода.</div></div>}
          {page === "language" && (
            <div className="vc-card"><div className="flex items-center justify-between px-4 py-3.5">Русский <Check size={20} style={{ color: "var(--vc-accent)" }} /></div></div>
          )}
          {page === "hotkeys" && (
            <div className="vc-card">
              {[["Enter", "Отправить сообщение"], ["Shift + Enter", "Новая строка"], ["Esc", "Закрыть просмотр / окно"], ["← →", "Листать фото и истории"], ["Правая кнопка мыши", "Меню сообщения"], ["Двойной клик", "Поставить ❤️"]].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-4 py-3"><span className="font-mono text-[13px] px-2 py-0.5 rounded-md" style={{ background: "var(--vc-surface2)" }}>{k}</span><span className="vc-muted text-[14px]">{v}</span></div>
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
      <div className="vc-scroll flex-1 pb-28">
        <div className="flex flex-col items-center pt-2 pb-5 px-6">
          <button onClick={() => fileRef.current?.click()} className="relative">
            <Avatar src={account.photoURL} name={account.displayName} seed={me} size={96} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickAvatarQuick(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="text-[22px] font-semibold mt-3">{account.displayName}</p>
          <p className="text-[14px]" style={{ color: "var(--vc-accent)" }}>{status}</p>
          <button onClick={() => setEditProfile(true)} className="mt-3 px-5 py-2 rounded-full text-[14.5px] font-medium" style={{ background: "var(--vc-surface)", color: "var(--vc-accent)" }}>Изменить профиль</button>
        </div>

        <Section>
          <button onClick={() => setEditProfile(true)} className="w-full px-4 py-3 text-left"><p className="vc-muted text-[12.5px]">Имя пользователя</p><p style={{ color: "var(--vc-accent)" }}>@{account.handle}</p></button>
          <button onClick={() => setEditProfile(true)} className="w-full px-4 py-3 text-left"><p className="vc-muted text-[12.5px]">О себе</p><p>{account.bio || "Добавь пару слов о себе"}</p></button>
          <button onClick={() => setEditProfile(true)} className="w-full px-4 py-3 text-left"><p className="vc-muted text-[12.5px]">День рождения</p><p>{account.birthday ? new Date(account.birthday).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "Не указан"}</p></button>
        </Section>

        <Section>
          <Row icon={<Bell size={17} />} color="#ff3b30" label="Уведомления и звуки" onClick={() => setPage("notifications")} />
          <Row icon={<Database size={17} />} color="#34c759" label="Данные и память" onClick={() => setPage("data")} />
          <Row icon={<LockKeyhole size={17} />} color="#8e8e93" label="Конфиденциальность" onClick={() => setPage("privacy")} />
          <Row icon={<Settings size={17} />} color="#8e8e93" label="Общие настройки" onClick={() => setPage("general")} />
          <Row icon={<Folder size={17} />} color="#3390ec" label="Папки чатов" value={folders.length ? String(folders.length) : undefined} onClick={() => setPage("folders")} />
          <Row icon={<Sticker size={17} />} color="#ff2d55" label="Стикеры и эмодзи" onClick={() => setPage("stickers")} />
        </Section>

        <Section>
          <Row icon={<Smartphone size={17} />} color="#3390ec" label="Устройства" value={sessionCount ? String(sessionCount) : undefined} onClick={() => setPage("devices")} />
          <Row icon={<Languages size={17} />} color="#af52de" label="Язык" value="Русский" onClick={() => setPage("language")} />
          <div className="max-[899px]:hidden"><Row icon={<Keyboard size={17} />} color="#ff9500" label="Горячие клавиши" onClick={() => setPage("hotkeys")} /></div>
          <Row icon={<Download size={17} />} color="#00b8d9" label="Добавить на экран «Домой»" onClick={() => setInstallHelp(true)} />
        </Section>

        <Section>
          <button
            onClick={async () => {
              if (!confirm("Выйти из аккаунта? Вы выйдете и с сайта Velox Trade.")) return;
              await logout();
              onLoggedOut();
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            style={{ color: "var(--vc-danger)" }}
          >
            <LogOut size={20} /> Выйти
          </button>
        </Section>
        <p className="text-center text-[12.5px] vc-muted pb-4">Velox Chat · сообщения не шифруются сквозным образом</p>
      </div>
      <ProfileEditor open={editProfile} onClose={() => setEditProfile(false)} account={account} />
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
      <p className="vc-muted text-[13px]">Уведомления на iPhone не приходят, если открыть сайт просто в браузере — только из установленного приложения.</p>
    </div>
  );
}
