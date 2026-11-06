"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { TAG_MAX, VERIFY_KINDS, type VerifyKind } from "@/lib/messenger/marks";
import { Avatar, VerifiedBadge } from "./ui";
import type { MAccount } from "./mtypes";

async function call<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await authedFetch(url, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Ошибка");
  return d as T;
}

type ChatHit = { id: string; type: string; title: string; handle: string; verifyKind: VerifyKind | null; verifyText: string; tag: string; tagText?: string };

/** Вкладка «Метки»: галочки (подтверждённый / официальный / major / доверенный) и текстовые метки (CEO, DEV…) людям и каналам. */
export function AdminMarks() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"user" | "chat">("user");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<MAccount[]>([]);
  const [user, setUser] = useState<MAccount | null>(null);
  const [chat, setChat] = useState<ChatHit | null>(null);
  const [kind, setKind] = useState<VerifyKind | null>(null);
  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "user") return;
    const t = q.trim().replace(/^@/, "");
    if (t.length < 2) { setFound([]); return; }
    const id = setTimeout(() => { call<{ accounts: MAccount[] }>(`/api/admin/messenger?q=${encodeURIComponent(t)}`).then((d) => setFound(d.accounts.slice(0, 6))).catch(() => {}); }, 300);
    return () => clearTimeout(id);
  }, [q, mode]);

  const pickUser = (a: MAccount) => {
    const x = a as any;
    setUser(a); setQ(""); setFound([]);
    setKind(x.verifyKind ?? (x.verified ? "verified" : null)); setText(x.verifyText ?? ""); setTag(x.tag ?? ""); setTagText(x.tagText ?? "");
  };
  const findChat = async () => {
    try {
      const d = await call<{ chat: ChatHit }>(`/api/admin/messenger/marks?handle=${encodeURIComponent(q.trim())}`);
      setChat(d.chat); setKind(d.chat.verifyKind); setText(d.chat.verifyText); setTag(d.chat.tag); setTagText(d.chat.tagText ?? "");
    } catch (e: any) { toast("error", e.message); }
  };
  const reset = () => { setUser(null); setChat(null); setKind(null); setText(""); setTag(""); setTagText(""); setQ(""); };
  const hasTarget = mode === "user" ? !!user : !!chat;

  const apply = async (clear: boolean) => {
    if (!hasTarget || busy) return;
    setBusy(true);
    try {
      await call("/api/admin/messenger/marks", {
        target: mode,
        ...(mode === "user" ? { uid: user!.uid } : { handle: chat!.handle }),
        kind: clear ? null : kind, text: clear ? "" : text, tag: clear ? "" : tag, tagText: clear ? "" : tagText,
      });
      toast("success", clear ? "Метки сняты" : "Сохранено");
      if (clear) { setKind(null); setText(""); setTag(""); setTagText(""); }
    } catch (e: any) { toast("error", e.message); } finally { setBusy(false); }
  };

  return (
    <div className="pb-10">
      <div className="px-4 pt-3 flex gap-2">
        {(["user", "chat"] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); reset(); }} className="px-4 py-1.5 rounded-full text-[14px]" style={{ background: mode === m ? "var(--mx-accent)" : "var(--mx-card)", color: mode === m ? "#fff" : undefined }}>
            {m === "user" ? "Человек" : "Канал / группа"}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 flex flex-col gap-2.5">
        {hasTarget ? (
          <div className="mx-card px-3 py-2.5 flex items-center gap-3">
            {mode === "user" && user && <Avatar src={user.photoURL} name={user.displayName} seed={user.uid} size={36} />}
            <span className="flex-1 min-w-0">
              <span className="block truncate">{mode === "user" ? user!.displayName : chat!.title}</span>
              <span className="block text-[12.5px] mx-muted">@{mode === "user" ? user!.handle : chat!.handle}</span>
            </span>
            <button className="text-[14px]" style={{ color: "var(--mx-accent)" }} onClick={reset}>Сменить</button>
          </div>
        ) : (
          <>
            <div className="mx-search">
              <Search size={17} className="mx-muted shrink-0" />
              <input className="bg-transparent outline-none flex-1 text-[16px] min-w-0" placeholder={mode === "user" ? "Кому: @username" : "@адрес канала или группы"} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (mode === "chat" && e.key === "Enter") findChat(); }} autoCapitalize="none" />
            </div>
            {mode === "chat" && <button className="mx-card px-3 py-2 text-[15px]" style={{ color: "var(--mx-accent)" }} onClick={findChat}>Найти</button>}
            {mode === "user" && found.map((a) => (
              <button key={a.uid} onClick={() => pickUser(a)} className="mx-card px-3 py-2 flex items-center gap-3 text-left">
                <Avatar src={a.photoURL} name={a.displayName} seed={a.uid} size={34} /><span className="min-w-0"><span className="block truncate">{a.displayName}</span><span className="block text-[12.5px] mx-muted">@{a.handle}</span></span>
              </button>
            ))}
          </>
        )}
      </div>

      {hasTarget && (
        <>
          <p className="px-4 pt-4 pb-2 text-[13px] uppercase tracking-wide mx-muted">Галочка</p>
          <div className="px-4 flex flex-col gap-2">
            <button onClick={() => setKind(null)} className="mx-card px-3 py-2.5 text-left text-[15px]" style={{ outline: kind === null ? "2px solid var(--mx-accent)" : "none" }}>Без галочки</button>
            {VERIFY_KINDS.map((k) => (
              <button key={k.id} onClick={() => setKind(k.id)} className="mx-card px-3 py-2.5 flex items-center gap-3 text-left" style={{ outline: kind === k.id ? "2px solid var(--mx-accent)" : "none" }}>
                <VerifiedBadge size={24} kind={k.id} />
                <span className="min-w-0"><span className="block text-[15px]">{k.label}</span><span className="block text-[12.5px] mx-muted">{k.desc}</span></span>
              </button>
            ))}
          </div>
          <p className="px-4 pt-4 pb-2 text-[13px] uppercase tracking-wide mx-muted">Подпись и метка</p>
          <div className="px-4 flex flex-col gap-2.5">
            <input className="mx-input" maxLength={200} placeholder="Описание под профилем (необязательно)" value={text} onChange={(e) => setText(e.target.value)} disabled={!kind} />
            <input className="mx-input" maxLength={TAG_MAX} placeholder="Метка рядом с именем: CEO, DEV, SUPPORT…" value={tag} onChange={(e) => setTag(e.target.value)} />
            <input className="mx-input" maxLength={200} placeholder="Что значит метка (видно по нажатию), необязательно" value={tagText} onChange={(e) => setTagText(e.target.value)} disabled={!tag} />
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => apply(false)} className="flex-1 py-3 rounded-2xl text-white text-[16px] font-medium" style={{ background: "var(--mx-accent)", opacity: busy ? 0.6 : 1 }}>Сохранить</button>
              <button disabled={busy} onClick={() => apply(true)} className="px-5 py-3 rounded-2xl mx-card text-[16px]" style={{ color: "#ff3b30" }}>Снять всё</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
