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
import { useLanguage } from "@/lib/languageStore";
import { Share2, Copy } from "lucide-react";
import { tf, t as translate, Language } from "@/lib/i18n";

function cooldownLeft(lastChangeAt?: number): number {
  if (!lastChangeAt) return 0;
  return Math.max(0, lastChangeAt + NAME_CHANGE_COOLDOWN_MS - Date.now());
}

function formatDays(lang: Language, ms: number): string {
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  const word = days === 1 ? translate(lang, "profile_day_1") : days < 5 ? translate(lang, "profile_day_few") : translate(lang, "profile_day_many");
  return `${days} ${word}`;
}

export default function ProfilePage() {
  const { t, language } = useLanguage();
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
          toast("warning", t("profile_toast_username_format"));
          setSaving(false);
          return;
        }
        const available = await isUsernameAvailable(username);
        if (!available) {
          toast("warning", t("profile_toast_username_taken"));
          setSaving(false);
          return;
        }
      }

      const avatarChanged = avatarUrl !== (profile!.photoURL ?? "");
      if (avatarChanged && avatarUrl && !isValidImageSrc(avatarUrl)) {
        toast("warning", t("profile_toast_avatar_url"));
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
      toast("success", t("profile_toast_saved"));
    } catch (err: any) {
      if (err?.code === "name-cooldown" || err?.code === "avatar-cooldown") {
        toast("error", err.message);
      } else if (err?.code === "permission-denied") {
        toast("error", t("profile_toast_no_permission"));
      } else {
        toast("error", t("profile_toast_save_failed"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="text-xl font-bold mb-4">{t("profile_dashboard_title")}</h1>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="glass rounded-card p-4 flex items-center gap-3">
            <Wallet className="text-accent" size={22} />
            <div>
              <p className="text-xs text-white/40">{t("profile_balance")}</p>
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
          <p className="text-xs text-yellow-400/80 mt-3">{t("profile_email_not_verified")}</p>
        )}
        <Link href="/profile/topup" className="btn-primary inline-block mt-5 px-5 py-2.5 text-sm">
          {t("profile_topup_link")}
        </Link>
      </div>

      {profile.username && (
        <div className="card p-6">
          <h2 className="font-bold flex items-center gap-2 mb-1">
            <Share2 size={18} className="text-accent" /> {t("profile_share_title")}
          </h2>
          <p className="text-sm text-white/40 mb-3">{t("profile_share_hint")}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={typeof window !== "undefined" ? `${window.location.origin}/seller/${profile.username}` : `/seller/${profile.username}`}
              onFocus={(e) => e.target.select()}
              className="input-field py-2.5 text-sm flex-1"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const url = `${window.location.origin}/seller/${profile.username}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    toast("success", t("profile_share_copied"));
                  } catch {
                    toast("error", t("profile_share_copied"));
                  }
                }}
                className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <Copy size={15} /> {t("profile_share_copy")}
              </button>
              {typeof navigator !== "undefined" && !!navigator.share && (
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/seller/${profile.username}`;
                    navigator.share({ title: profile.displayName, url }).catch(() => {});
                  }}
                  className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Share2 size={15} /> {t("profile_share_share")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="card p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <User size={18} className="text-accent" /> {t("profile_public_title")}
        </h2>
        {profile.username && (
          <Link href={`/seller/${profile.username}`} className="text-xs text-accent hover:underline">
            {t("profile_view_public")}
          </Link>
        )}

        <div>
          <ImageUploadField
            value={avatarUrl ?? ""}
            onChange={setAvatarUrl}
            folder="avatars"
            label={t("profile_avatar_label")}
            shape="round"
            size={80}
            disabled={avatarCooldown > 0}
          />
          {avatarCooldown > 0 ? (
            <p className="text-[11px] text-yellow-400/70 mt-1.5">{tf(language, "profile_avatar_next_change", { days: formatDays(language, avatarCooldown) })}</p>
          ) : (
            <p className="text-[11px] text-white/30 mt-1.5">{t("profile_avatar_change_hint")}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block">{t("profile_nickname_label")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={nameCooldown > 0}
            className="input-field py-2.5 disabled:opacity-40"
          />
          {nameCooldown > 0 && (
            <p className="text-[11px] text-yellow-400/70 mt-1">{tf(language, "profile_nickname_next_change", { days: formatDays(language, nameCooldown) })}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block">{t("profile_username_label")}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder={t("profile_username_placeholder")}
              className="input-field py-2.5 pl-7"
            />
          </div>
          <p className="text-[11px] text-white/30 mt-1">{t("profile_username_hint")}</p>
        </div>

        <div>
          <label className="text-xs text-white/40 mb-1 block">{t("profile_bio_label")}</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} className="input-field py-2.5" />
        </div>

        <button disabled={saving} className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
          <Save size={15} /> {saving ? t("profile_saving") : t("common_save")}
        </button>
      </form>
    </div>
  );
}
