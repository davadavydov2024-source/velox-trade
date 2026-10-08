"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { ensureUserProfile, getUserProfile, syncEmailVerified } from "./users";
import { UserProfile } from "@/types";
import {
  ACTIVE_KEY,
  PRIMARY_SLOT,
  getLoadedSlotId,
  getSavedAccounts,
  isIntentionalSignOut,
  removeSavedAccountBySlot,
  resetIntentionalSignOut,
  setActiveSlotId,
  setSwitchNotice,
  upsertSavedAccount,
} from "./accountSlots";
import { removeAccount } from "./multiAccount";

/** Бан считается действующим, если banned=true и (until не задан/"forever", либо ещё не истёк). */
export function isEffectivelyBanned(profile: UserProfile | null): boolean {
  if (!profile?.banned) return false;
  if (!profile.banUntil || profile.banUntil === "forever") return true;
  return profile.banUntil > Date.now();
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
  login: (email: string, password: string) => Promise<void>;
  loginWithCustomToken: (token: string) => Promise<void>;
  register: (email: string, password: string, name: string, language?: "ru" | "en" | "zh", age?: number) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /** Держим запись в переключателе актуальной: ник и аватар берём из профиля на сайте (его человек
   * меняет в /profile), а не из Firebase Auth — там они остаются теми, с которыми регистрировались. */
  function syncSavedAccount(u: User, p: UserProfile | null) {
    upsertSavedAccount({
      slotId: getLoadedSlotId(),
      uid: u.uid,
      email: u.email ?? p?.email ?? "",
      displayName: p?.displayName || u.displayName || u.email || "Игрок",
      photoURL: p?.photoURL ?? u.photoURL ?? undefined,
    });
  }

  /** Сессия этого слота умерла сама (токен отозван, пароль сменили, аккаунт удалён): убираем слот из
   * списка и переходим на другой аккаунт, а не оставляем человека «разлогиненным» без объяснений. */
  function handleLostSession() {
    if (isIntentionalSignOut()) return;
    const slot = getLoadedSlotId();
    if (!getSavedAccounts().some((a) => a.slotId === slot)) return; // обычный гость — ничего не потеряно
    removeSavedAccountBySlot(slot);
    const next = getSavedAccounts()[0];
    if (next) {
      setSwitchNotice(`Сессия предыдущего аккаунта истекла — открыт «${next.displayName}»`);
      setActiveSlotId(next.slotId);
      window.location.replace("/profile");
    } else if (slot !== PRIMARY_SLOT) {
      setActiveSlotId(PRIMARY_SLOT);
      window.location.replace("/auth/login");
    }
  }

  // Активный аккаунт общий на весь браузер: если его сменили в другой вкладке, эта вкладка тоже
  // перезагружается на него — иначе здесь продолжали бы работать под старым аккаунтом, а
  // переключатель показывал бы новый.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== ACTIVE_KEY) return;
      const now = e.newValue || PRIMARY_SLOT;
      if (now !== getLoadedSlotId()) window.location.reload();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function refreshProfile() {
    if (!auth.currentUser) {
      setProfile(null);
      return null;
    }
    try {
      await auth.currentUser.reload();
      await syncEmailVerified(auth.currentUser.uid, auth.currentUser.emailVerified);
    } catch {
      // Не критично — просто покажем то, что уже знаем
    }
    const p = await getUserProfile(auth.currentUser.uid);
    setProfile(p);
    if (p) syncSavedAccount(auth.currentUser, p);
    return p;
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        resetIntentionalSignOut(); // новый вход — снова следим за потерей сессии
        try {
          await u.reload();
        } catch {
          // офлайн или сеть недоступна — просто продолжаем с тем, что уже знаем
        }
        const p = await ensureUserProfile(u.uid, u.email ?? "", u.displayName ?? u.email ?? "Игрок", u.photoURL ?? undefined);
        if (u.emailVerified && !p.emailVerified) {
          await syncEmailVerified(u.uid, true);
          p.emailVerified = true;
        }
        setProfile(p);
        // Держим список аккаунтов в переключателе актуальным — чем бы человек ни вошёл
        // (обычным логином на "primary" или переключением на добавленный аккаунт).
        syncSavedAccount(u, p);
      } else {
        setProfile(null);
        handleLostSession();
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function loginWithCustomToken(token: string) {
    await signInWithCustomToken(auth, token);
  }

  async function register(email: string, password: string, name: string, language?: "ru" | "en" | "zh", age?: number) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // Firebase Auth сам шлёт письмо со ссылкой подтверждения — работает из коробки, без SMTP/
    // сторонних сервисов, потому что это встроенная функция самого Firebase (использует его
    // собственную отправку, не связанную с нашими SMTP_*/RESEND_*/BREVO_* попытками выше).
    // Пока пользователь не перейдёт по ссылке — emailVerified остаётся false (см. syncEmailVerified
    // в users.ts, который подхватывает это значение при каждом входе).
    await sendEmailVerification(cred.user);
    await ensureUserProfile(cred.user.uid, email, name, undefined, language, age);
  }

  async function loginWithGoogle() {
    await signInWithPopup(auth, googleProvider);
  }

  async function logout() {
    // Выходим из ТЕКУЩЕГО аккаунта и убираем его из списка переключателя (раньше он оставался там
    // «призраком»: клик по нему открывал разлогиненный сайт). Если есть другие аккаунты — сразу
    // переключаемся на следующий.
    await removeAccount(getLoadedSlotId());
  }

  async function resetPassword(email: string) {
    // Firebase сам генерирует ссылку и шлёт письмо со своего сервера — не нужен ни серверный
    // роут с Admin SDK, ни сторонний EmailJS. Шаблон письма можно настроить в
    // Firebase Console → Authentication → Templates → Password reset.
    await sendPasswordResetEmail(auth, email);
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, refreshProfile, login, loginWithCustomToken, register, loginWithGoogle, logout, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth должен использоваться внутри <AuthProvider>");
  return ctx;
}
