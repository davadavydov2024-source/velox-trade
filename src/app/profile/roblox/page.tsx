"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ShieldCheck, ExternalLink, Copy, Check, X, Loader2, Package } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getRobloxLink, startRobloxVerification, confirmRobloxVerification, unlinkRoblox, getRobloxInventory, RobloxInventoryItem } from "@/lib/robloxLink";
import { RobloxLink } from "@/types";

export default function RobloxLinkPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<RobloxLink | null>(null);

  const [username, setUsername] = useState("");
  const [pending, setPending] = useState<{ code: string; robloxUsername: string; avatarUrl: string | null; profileUrl: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [worn, setWorn] = useState<RobloxInventoryItem[]>([]);
  const [collectibles, setCollectibles] = useState<RobloxInventoryItem[]>([]);
  const [collectiblesPrivate, setCollectiblesPrivate] = useState(false);
  const [invLoading, setInvLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    getRobloxLink(user.uid)
      .then(setLink)
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!link) return;
    setInvLoading(true);
    getRobloxInventory(link.robloxUserId)
      .then((data) => {
        setWorn(data.worn);
        setCollectibles(data.collectibles);
        setCollectiblesPrivate(data.collectiblesPrivate);
      })
      .finally(() => setInvLoading(false));
  }, [link]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setStarting(true);
    try {
      const result = await startRobloxVerification(username.trim());
      setPending(result);
    } catch (err: any) {
      toast("error", err.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    try {
      const result = await confirmRobloxVerification();
      toast("success", `Аккаунт ${result.robloxDisplayName} привязан!`);
      setPending(null);
      // Перечитываем из базы — там сохранён реальный robloxUserId, нужный для показа инвентаря.
      const fresh = await getRobloxLink(user!.uid);
      if (fresh) setLink(fresh);
    } catch (err: any) {
      toast("error", err.message);
    } finally {
      setConfirming(false);
    }
  }

  async function handleUnlink() {
    if (!confirm("Отвязать Roblox-аккаунт? Придётся привязывать заново для автоматической выдачи товаров.")) return;
    try {
      await unlinkRoblox();
      setLink(null);
      toast("success", "Аккаунт отвязан");
    } catch {
      toast("error", "Не удалось отвязать");
    }
  }

  function copyCode() {
    if (!pending) return;
    navigator.clipboard.writeText(pending.code);
    toast("success", "Код скопирован");
  }

  if (loading) return <div className="card p-6 text-center text-white/40">Загрузка...</div>;

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ShieldCheck size={20} className="text-accent" /> Roblox-аккаунт
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Привязка подтверждает, что аккаунт Roblox действительно принадлежит тебе — без пароля и без доступа к
          самому аккаунту. Мы никогда не спрашиваем твой пароль или cookie от Roblox — только публичный ник.
        </p>
      </div>

      {link ? (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14 rounded-full overflow-hidden bg-black/30 shrink-0">
              {link.avatarUrl && <Image src={link.avatarUrl} alt="" fill className="object-cover" sizes="56px" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold flex items-center gap-1.5">
                {link.robloxDisplayName}
                <ShieldCheck size={15} className="text-green-400" aria-label="Подтверждено" />
              </p>
              <p className="text-xs text-white/40">@{link.robloxUsername}</p>
            </div>
            <a
              href={`https://www.roblox.com/users/${link.robloxUserId}/profile`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary p-2"
            >
              <ExternalLink size={15} />
            </a>
          </div>

          <div className="rounded-btn bg-surface p-3 text-xs text-white/50">
            При покупках через бота-посредника твой ник теперь подставляется автоматически — не нужно вводить его
            заново в каждом заказе.
          </div>

          <button onClick={handleUnlink} className="text-xs text-red-400 hover:underline">
            Отвязать аккаунт
          </button>

          <div className="pt-2 border-t border-border">
            <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
              <Package size={15} className="text-white/40" /> Предметы на аватаре
            </p>
            {invLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-btn bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : worn.length === 0 && collectibles.length === 0 ? (
              <p className="text-xs text-white/30">Не удалось получить предметы — возможно, инвентарь скрыт настройками приватности.</p>
            ) : (
              <>
                {worn.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-3">
                    {worn.map((item) => (
                      <div key={item.id} className="aspect-square rounded-btn bg-surface overflow-hidden relative" title={item.name}>
                        {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-contain p-1" sizes="80px" />}
                      </div>
                    ))}
                  </div>
                )}
                {collectiblesPrivate ? (
                  <p className="text-xs text-white/30">
                    Полный инвентарь коллекционных предметов скрыт настройками приватности Roblox — видно только то,
                    что надето на аватаре выше.
                  </p>
                ) : (
                  collectibles.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {collectibles.map((item) => (
                        <div key={item.id} className="aspect-square rounded-btn bg-surface overflow-hidden relative" title={item.name}>
                          {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-contain p-1" sizes="80px" />}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      ) : pending ? (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full overflow-hidden bg-black/30 shrink-0">
              {pending.avatarUrl && <Image src={pending.avatarUrl} alt="" fill className="object-cover" sizes="48px" />}
            </div>
            <div>
              <p className="font-medium text-sm">{pending.robloxUsername}</p>
              <a href={pending.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline flex items-center gap-1">
                Открыть профиль <ExternalLink size={11} />
              </a>
            </div>
          </div>

          <ol className="text-sm text-white/60 space-y-2 list-decimal list-inside">
            <li>Зайди в настройки профиля на Roblox и открой раздел «О себе» (описание).</li>
            <li>
              Вставь туда этот код целиком, сохрани:
              <div className="flex items-center gap-2 mt-1.5">
                <code className="flex-1 bg-surface px-3 py-2 rounded-btn text-accent font-mono text-sm">{pending.code}</code>
                <button onClick={copyCode} className="btn-secondary p-2.5">
                  <Copy size={14} />
                </button>
              </div>
            </li>
            <li>Вернись сюда и нажми «Проверить» — код после этого можно убрать из описания.</li>
          </ol>

          <div className="flex gap-2">
            <button onClick={handleConfirm} disabled={confirming} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {confirming ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Проверить
            </button>
            <button onClick={() => setPending(null)} className="btn-secondary px-4 py-2.5 text-sm">
              <X size={15} />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleStart} className="card p-5 space-y-3">
          <input
            autoComplete="off"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Твой ник на Roblox"
            className="input-field py-2.5 text-sm"
          />
          <button disabled={starting} className="btn-primary w-full py-2.5 text-sm disabled:opacity-50">
            {starting ? "Ищем..." : "Начать привязку"}
          </button>
        </form>
      )}
    </div>
  );
}
