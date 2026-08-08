"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { Wallet, ShieldCheck, User, Save, Copy, ShoppingBag, Star, CalendarDays, Mail, AlertCircle } from "lucide-react";
import { updateProfileInfo, getOrdersForUser } from "@/lib/users";
import { claimUsername, isUsernameAvailable, isValidUsernameFormat } from "@/lib/usernames";
import { useToast } from "@/lib/toastContext";
import { isValidImageSrc, safeImageSrc } from "@/lib/safeImage";
import { NAME_CHANGE_COOLDOWN_MS, BADGE_COLOR, BADGE_LABEL, CHECKMARK_BADGES } from "@/types";
import { ImageUploadField } from "@/components/ImageUploadField";

function cooldownLeft(lastChangeAt?: number): number {
  if (!lastChangeAt) return 0;
  return Math.max(0, lastChangeAt + NAME_CHANGE_COOLDOWN_MS - Date.now());
}

function formatDays(ms: number): string {
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}`;
}

export default function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.photoURL ?? "");
  const [saving, setSaving] = useState(false);
  const [purchaseCount, setPurchaseCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getOrdersForUser(user.uid)
      .then((orders) => setPurchaseCount(orders.filter((o) => o.status === "confirmed").length))
      .catch(() => setPurchaseCount(null));
  }, [user]);

  if (!profile || !user) return null;

  const nameCooldown = cooldownLeft(profile.lastNameChangeAt);
  const avatarCooldown = cooldownLeft(profile.lastAvatarChangeAt);
  const avgRating = profile.ratingCount ? (profile.ratingSum ?? 0) / profile.ratingCount : null;
  const checkmarks = profile.badges.filter((b) => CHECKMARK_BADGES.includes(b));
  const otherBadges = profile.badges.filter((b) => !CHECKMARK_BADGES.includes(b));
  const memberSince = new Date(profile.createdAt).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const usernameChanged = username.trim().toLowerCase() !== (profile!.username ?? "");
      if (usernameChanged && username.trim()) {
        if (!isValidUsernameFormat(username)) {
          toast("warning", "Юзернейм: 3-20 символов, только латиница, цифры и подчёркивание");
          setSaving(false);
          return;
        }
        const available = await isUsernameAvailable(username);
        if (!available) {
          toast("warning", "Этот юзернейм уже занят");
          setSaving(false);
          return;
        }
      }

      const avatarChanged = avatarUrl !== (profile!.photoURL ?? "");
      if (avatarChanged && avatarUrl && !isValidImageSrc(avatarUrl)) {
        toast("warning", "Ссылка на аватар должна начинаться с http:// или https://");
        setSaving(false);
        return;
      }

      // Сначала резервируем новый юзернейм (и освобождаем старый), потом пишем сам профиль —
      // если резервирование не удастся (например, кто-то успел занять его первым), профиль не тронется.
      if (usernameChanged && username.trim()) {
        await claimUsername(user!.uid, username.trim(), profile!.username);
      }

      await updateProfileInfo(user!.uid, profile!, {
        displayName: name.trim() !== profile!.displayName ? name.trim() : undefined,
        photoURL: avatarChanged ? avatarUrl.trim() || null : undefined,
        bio,
        username: usernameChanged && username.trim() ? username.trim().toLowerCase() : undefined,
      });

      await refreshProfile();
      toast("success", "Профиль обновлён");
    } catch (err: any) {
      if (err?.code === "name-cooldown" || err?.code === "avatar-cooldown") {
        toast("error", err.message);
      } else if (err?.code === "permission-denied") {
        toast("error", "Нет доступа к базе данных. Проверь правила Firestore.");
      } else {
        toast("error", "Не удалось сохранить изменения");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-black/30 shrink-0 ring-2 ring-accent/30">
            <Image src={safeImageSrc(profile.photoURL, "/placeholder.svg")} alt={profile.displayName} fill className="object-cover" sizes="80px" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-xl font-bold">{profile.displayName}</h1>
              {checkmarks.map((b) => (
                <ShieldCheck key={b} size={17} style={{ color: BADGE_COLOR[b] }} aria-label={BADGE_LABEL[b]} />
              ))}
            </div>
            <p className="text-white/40 text-sm mb-1.5">{profile.username ? `@${profile.username}` : "Юзернейм не задан"}</p>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className="flex items-center gap-1 text-xs text-white/40">
                <CalendarDays size={13} /> На сайте с {memberSince}
              </span>
              {otherBadges.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {otherBadges.map((b) => (
                    <span
                      key={b}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${BADGE_COLOR[b]}22`, color: BADGE_COLOR[b] }}
                    >
                      {BADGE_LABEL[b]}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {profile.username && (
              <div className="flex items-center gap-3 flex-wrap">
                <Link href={`/seller/${profile.username}`} className="text-xs text-accent hover:underline">
                  Как видят другие →
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    const link = `${window.location.origin}/seller/${profile.username}`;
                    if (navigator.share) {
                      try {
                        await navigator.share({ title: "Мой профиль", url: link });
                      } catch {
                        // Пользователь закрыл системное окно "Поделиться" — это не ошибка
                      }
                    } else {
                      navigator.clipboard.writeText(link);
                      toast("success", "Ссылка на профиль скопирована");
                    }
                  }}
                  className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1"
                >
                  <Copy size={12} /> Поделиться профилем
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="glass rounded-card p-3 text-center">
            <Wallet size={16} className="text-accent mx-auto mb-1" />
            <p className="text-base font-bold">{profile.balance.toFixed(0)} ₽</p>
            <p className="text-[10px] text-white/40">Баланс</p>
          </div>
          <div className="glass rounded-card p-3 text-center">
            <ShoppingBag size={16} className="text-accent mx-auto mb-1" />
            <p className="text-base font-bold">{purchaseCount ?? "—"}</p>
            <p className="text-[10px] text-white/40">Покупок</p>
          </div>
          <div className="glass rounded-card p-3 text-center">
            <Star size={16} className="text-accent mx-auto mb-1" />
            <p className="text-base font-bold">{avgRating !== null ? avgRating.toFixed(1) : "—"}</p>
            <p className="text-[10px] text-white/40">Рейтинг {profile.ratingCount ? `(${profile.ratingCount})` : ""}</p>
          </div>
        </div>

        {!profile.emailVerified && (
          <p className="text-xs text-yellow-400/80 flex items-center gap-1.5 mt-4">
            <AlertCircle size={13} /> Email {profile.email} не подтверждён — проверьте почту в разделе «Безопасность».
          </p>
        )}

        <Link href="/profile/topup" className="btn-primary inline-block mt-5 px-5 py-2.5 text-sm">
          Пополнить баланс
        </Link>
      </div>

      <form onSubmit={handleSaveProfile} className="card p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <User size={18} className="text-accent" /> Редактировать профиль
        </h2>
        {!profile.username && (
          <p className="text-xs text-white/30">Придумай имя пользователя ниже, чтобы получить ссылку на свой профиль, которой можно делиться.</p>
        )}

        <div>
          <ImageUploadField
            value={avatarUrl ?? ""}
            onChange={setAvatarUrl}
            folder="avatars"
            label="Аватар"
            shape="round"
            size={80}
            disabled={avatarCooldown > 0}
          />
          {avatarCooldown > 0 ? (
            <p className="text-[11px] text-yellow-400/70 mt-1.5">Следующая смена доступна через {formatDays(avatarCooldown)}</p>
          ) : (
            <p className="text-[11px] text-white/30 mt-1.5">Менять можно раз в 7 дней</p>
          )}
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block">Ник</label>
          <input
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={nameCooldown > 0}
            className="input-field py-2.5 disabled:opacity-40"
          />
          {nameCooldown > 0 && (
            <p className="text-[11px] text-yellow-400/70 mt-1">Следующая смена доступна через {formatDays(nameCooldown)}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block">Юзернейм (для ссылки на профиль продавца)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">@</span>
            <input
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="my_nickname"
              className="input-field py-2.5 pl-7"
            />
          </div>
          <p className="text-[11px] text-white/30 mt-1">3-20 символов: латиница, цифры, подчёркивание. Без недельного лимита.</p>
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block">О себе (необязательно)</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} className="input-field py-2.5" />
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block flex items-center gap-1.5">
            <Mail size={12} /> Email
          </label>
          <p className="text-sm text-white/60">{profile.email}</p>
        </div>

        <button disabled={saving} className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
          <Save size={15} /> {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </form>
    </div>
  );
}
