"use client";

import { useEffect, useState } from "react";
import { Check, Megaphone, Search, Users, UserRound, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { Avatar, Sheet, Spinner, VerifiedBadge } from "./ui";
import { cacheAccounts } from "./hooks";
import { MAccount, MChatType } from "./mtypes";
import { lastSeenText } from "./util";

/** Поиск людей по имени или @username (GET /api/messenger/search?q=). */
export function usePeopleSearch(q: string, enabled = true) {
  const [results, setResults] = useState<MAccount[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const term = q.trim().replace(/^@/, "");
    if (!enabled || term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await mApi<{ accounts?: MAccount[]; users?: MAccount[]; results?: MAccount[] }>(`search?q=${encodeURIComponent(term)}`, undefined, "GET");
        const list = res.accounts ?? res.users ?? res.results ?? [];
        cacheAccounts(list);
        setResults(list);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, enabled]);
  return { results, loading };
}

export function PersonRow({ acc, selected, onPress, right }: { acc: MAccount; selected?: boolean; onPress: () => void; right?: React.ReactNode }) {
  return (
    <button onClick={onPress} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/5">
      <Avatar src={acc.photoURL} name={acc.displayName} seed={acc.uid} size={46} />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate flex items-center gap-1">
          {acc.displayName} {acc.verified && <VerifiedBadge />}
        </p>
        <p className="text-[13px] vc-muted truncate">@{acc.handle} · {lastSeenText(acc)}</p>
      </div>
      {selected !== undefined && (
        <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: selected ? "var(--vc-accent)" : "var(--vc-muted)", background: selected ? "var(--vc-accent)" : "transparent" }}>
          {selected && <Check size={14} color="var(--vc-accent-text)" />}
        </span>
      )}
      {right}
    </button>
  );
}

type Mode = "menu" | "dm" | "group" | "channel";

export function NewChatSheet({ open, onClose, me, onOpenChat }: { open: boolean; onClose: () => void; me: string; onOpenChat: (chatId: string) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("menu");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<MAccount[]>([]);
  const [step, setStep] = useState<"pick" | "details">("pick");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const { results, loading } = usePeopleSearch(q, mode !== "menu");

  const reset = () => {
    setMode("menu");
    setQ("");
    setPicked([]);
    setStep("pick");
    setTitle("");
    setDescription("");
    setBusy(false);
  };
  const close = () => {
    onClose();
    reset();
  };

  const create = async (type: MChatType, members: string[]) => {
    setBusy(true);
    try {
      const res = await mApi<{ chatId?: string; id?: string }>("chats", { type, members, title: title.trim() || undefined, description: description.trim() || undefined });
      const id = res.chatId ?? res.id;
      close();
      if (id) onOpenChat(id);
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось создать чат");
      setBusy(false);
    }
  };

  const togglePick = (a: MAccount) => setPicked((p) => (p.some((x) => x.uid === a.uid) ? p.filter((x) => x.uid !== a.uid) : [...p, a]));
  const people = results.filter((r) => r.uid !== me);

  return (
    <Sheet open={open} onClose={close} title={mode === "menu" ? "Новое сообщение" : mode === "dm" ? "Личное сообщение" : mode === "group" ? "Новая группа" : "Новый канал"} full={mode !== "menu"}>
      {mode === "menu" ? (
        <div className="pb-3">
          {[
            { m: "dm" as const, icon: <UserRound size={22} />, label: "Написать человеку", color: "#3390ec" },
            { m: "group" as const, icon: <Users size={22} />, label: "Создать группу", color: "#34c759" },
            { m: "channel" as const, icon: <Megaphone size={22} />, label: "Создать канал", color: "#ff9500" },
          ].map((i) => (
            <button key={i.m} onClick={() => setMode(i.m)} className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left active:bg-white/5">
              <span className="vc-icon-box" style={{ background: i.color, width: 38, height: 38, borderRadius: 11 }}>{i.icon}</span>
              <span className="text-[16px]">{i.label}</span>
            </button>
          ))}
        </div>
      ) : step === "details" ? (
        <div className="p-4 space-y-3 pb-8">
          <input className="vc-input" placeholder={mode === "group" ? "Название группы" : "Название канала"} value={title} maxLength={64} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className="vc-input" placeholder="Описание (необязательно)" value={description} maxLength={300} rows={3} onChange={(e) => setDescription(e.target.value)} />
          <p className="vc-muted text-[13px]">{picked.length} {picked.length === 1 ? "участник" : "участников"} кроме вас</p>
          <button className="vc-btn" disabled={busy || title.trim().length < 2} onClick={() => create(mode === "group" ? "group" : "channel", picked.map((p) => p.uid))}>
            {busy ? "Создаю…" : mode === "group" ? "Создать группу" : "Создать канал"}
          </button>
          <button className="vc-btn vc-btn-ghost" onClick={() => setStep("pick")}>Назад</button>
        </div>
      ) : (
        <div className="pb-24">
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 rounded-xl px-3 h-10" style={{ background: "var(--vc-surface2)" }}>
              <Search size={17} className="vc-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя или @username" className="bg-transparent outline-none flex-1 text-[16px]" autoFocus autoCapitalize="none" />
              {loading && <Spinner size={16} />}
            </div>
          </div>
          {mode !== "dm" && picked.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {picked.map((p) => (
                <button key={p.uid} onClick={() => togglePick(p)} className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full text-[13px]" style={{ background: "var(--vc-surface2)" }}>
                  <Avatar src={p.photoURL} name={p.displayName} seed={p.uid} size={22} /> {p.displayName.split(" ")[0]} <X size={13} />
                </button>
              ))}
            </div>
          )}
          {q.trim().length < 2 && <p className="vc-muted text-center py-8 text-[14px] px-8">Введи минимум 2 символа, чтобы найти человека по имени или @username.</p>}
          {q.trim().length >= 2 && !loading && people.length === 0 && <p className="vc-muted text-center py-8">Никого не найдено</p>}
          {people.map((a) =>
            mode === "dm" ? (
              <PersonRow key={a.uid} acc={a} onPress={() => !busy && create("dm", [a.uid])} />
            ) : (
              <PersonRow key={a.uid} acc={a} selected={picked.some((x) => x.uid === a.uid)} onPress={() => togglePick(a)} />
            )
          )}
          {mode !== "dm" && (
            <div className="fixed-bottom sticky bottom-0 p-4" style={{ background: "linear-gradient(transparent, var(--vc-surface) 35%)" }}>
              <button className="vc-btn" disabled={mode === "group" && picked.length === 0} onClick={() => setStep("details")}>
                Далее{picked.length ? ` (${picked.length})` : ""}
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
