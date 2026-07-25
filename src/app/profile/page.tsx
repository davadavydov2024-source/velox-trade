"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { Wallet, Mail, CheckCircle2, AlertCircle, User, Save } from "lucide-react";
import Link from "next/link";
import { updateProfileInfo } from "@/lib/users";
import { claimUsername, isUsernameAvailable, isValidUsernameFormat } from "@/lib/usernames";
import { useToast } from "@/lib/toastContext";
import { isValidImageSrc } from "@/lib/safeImage";
import { NAME_CHANGE_COOLDOWN_MS } from "@/types";
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

  if (!profile || !user) return null;

  const nameCooldown = cooldownLeft(profile.lastNameChangeAt);
  const avatarCooldown = cooldownLeft(profile.lastAvatarChangeAt);

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
        <h1 className="text-xl font-bold mb-4">Личный кабинет</h1>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="glass rounded-card p-4 flex items-center gap-3">
            <Wallet className="text-accent" size={22} />
            <div>
              <p className="text-xs text-white/40">Баланс</p>
              <p className="text-xl font-bold">{profile.balance.toFixed(2)} ₽</p>
            </div>
          </div>
          <div className="glass rounded-card p-4 flex items-center gap-3">
            <Mail className="text-accent" size={22} />
            <div>
              <p className="text-xs text-white/40">Email</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                {profile.email}
                {profile.emailVerified ? (
                  <CheckCircle2 size={14} className="text-green-400" />
                ) : (
                  <AlertCircle size={14} className="text-yellow-400" />
                )}
              </p>
            </div>
          </div>
        </div>
        {!profile.emailVerified && (
          <p className="text-xs text-yellow-400/80 mt-3">
            Email не подтверждён. Проверьте почту или запросите письмо повторно в разделе «Безопасность».
          </p>
        )}
        <Link href="/profile/topup" className="btn-primary inline-block mt-5 px-5 py-2.5 text-sm">
          Пополнить баланс
        </Link>
      </div>

      <form onSubmit={handleSaveProfile} className="card p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <User size={18} className="text-accent" /> Публичный профиль
        </h2>
        {profile.username && (
          <Link href={`/seller/${profile.username}`} className="text-xs text-accent hover:underline">
            Посмотреть, как видят твой профиль другие →
          </Link>
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

        <button disabled={saving} className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
          <Save size={15} /> {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </form>
    </div>
  );
}
