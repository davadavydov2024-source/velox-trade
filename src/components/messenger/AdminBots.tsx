"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Copy, Search } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Avatar, Spinner } from "./ui";
import { InfoRow } from "./ProfileHeader";

type Owner = { uid: string; handle: string; displayName: string; photoURL: string | null };
type AdminBot = {
  id: string; uid: string; handle: string; name: string; description: string; owner: Owner | null;
  running: boolean; hostedUntil: number; usersCount: number; messagesCount: number; createdAt: number;
};

async function load(url: string): Promise<AdminBot[]> {
  const res = await authedFetch(url);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Ошибка");
  return d.bots as AdminBot[];
}

const day = (t: number) => new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });

/** Вкладка «Боты» админ-панели: все боты из конструктора и кто их создал. */
export function AdminBots() {
  const { toast } = useToast();
  const [bots, setBots] = useState<AdminBot[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    load("/api/admin/messenger/bots").then(setBots).catch((e) => { toast("error", e.message); setBots([]); });
  }, [toast]);

  const list = useMemo(() => {
    const t = q.trim().replace(/^@/, "").toLowerCase();
    if (!bots || !t) return bots ?? [];
    return bots.filter((b) => [b.handle, b.name, b.owner?.handle, b.owner?.displayName, b.owner?.uid].some((x) => (x ?? "").toLowerCase().includes(t)));
  }, [bots, q]);

  const copy = (text: string) => { navigator.clipboard?.writeText(text).then(() => toast("success", "Скопировано")).catch(() => {}); };

  if (!bots) return <div className="flex justify-center py-10"><Spinner size={22} /></div>;

  return (
    <div className="space-y-3">
      <div className="mx-search" style={{ height: 44 }}>
        <Search size={18} className="mx-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по боту или создателю" className="bg-transparent outline-none flex-1 text-[15px]" />
      </div>
      <p className="text-[13px] mx-muted px-1">Ботов: {bots.length}. Создателя видят только админы сайта.</p>
      {list.length === 0 && <p className="text-center mx-muted text-[14px] py-8">{bots.length ? "Ничего не найдено" : "Ботов пока никто не создал"}</p>}
      {list.map((b) => (
        <div key={b.id} className="mx-card p-3" style={{ borderRadius: 20 }}>
          <div className="flex items-center gap-3">
            <Avatar name={b.name} seed={b.uid} size={44}><Bot size={22} /></Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[15.5px] truncate">{b.name}</p>
              <p className="mx-muted text-[13px] truncate">@{b.handle} · {b.usersCount} польз. · {b.messagesCount} сообщ.</p>
            </div>
            <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ background: b.running ? "rgba(52,199,89,0.16)" : "var(--mx-surface2)", color: b.running ? "#34c759" : "var(--mx-muted)" }}>
              {b.running ? `до ${day(b.hostedUntil)}` : "остановлен"}
            </span>
          </div>
          <div className="mt-2 pt-1" style={{ borderTop: "1px solid var(--mx-line)" }}>
            {b.owner ? (
              <InfoRow
                icon={<Avatar src={b.owner.photoURL} name={b.owner.displayName || "?"} seed={b.owner.uid} size={30} />}
                value={b.owner.displayName || "Без имени"}
                label={`Создатель${b.owner.handle ? ` · @${b.owner.handle}` : ""} · создан ${day(b.createdAt)}`}
                onClick={() => copy(b.owner!.handle ? `@${b.owner!.handle}` : b.owner!.uid)}
                right={<Copy size={16} className="mx-muted" />}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Строка «Создатель бота» в профиле бота — видна только админам (родитель проверяет isAdminUid). */
export function BotCreatorRow({ botUid, onCopy }: { botUid: string; onCopy: (text: string, msg: string) => void }) {
  const [bot, setBot] = useState<AdminBot | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    load(`/api/admin/messenger/bots?uid=${encodeURIComponent(botUid)}`).then((l) => alive && setBot(l[0] ?? null)).catch(() => alive && setBot(null));
    return () => { alive = false; };
  }, [botUid]);
  if (!bot?.owner) return null;
  const o = bot.owner;
  return (
    <InfoRow
      icon={<Bot size={19} />}
      value={`${o.displayName || "Без имени"}${o.handle ? ` (@${o.handle})` : ""}`}
      label="Создатель бота · видно только админам"
      onClick={() => onCopy(o.handle ? `@${o.handle}` : o.uid, "Создатель скопирован")}
    />
  );
}
