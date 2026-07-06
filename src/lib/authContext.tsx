"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  sendEmailVerification,
  updateProfile,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { ensureUserProfile, getUserProfile } from "./users";
import { UserProfile } from "@/types";

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
  refreshProfile: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithCustomToken: (token: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshProfile() {
    if (!auth.currentUser) {
      setProfile(null);
      return;
    }
    const p = await getUserProfile(auth.currentUser.uid);
    setProfile(p);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const p = await ensureUserProfile(u.uid, u.email ?? "", u.displayName ?? u.email ?? "Игрок", u.photoURL ?? undefined);
        setProfile(p);
      } else {
        setProfile(null);
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

  async function register(email: string, password: string, name: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
    await ensureUserProfile(cred.user.uid, email, name);
  }

  async function loginWithGoogle() {
    await signInWithPopup(auth, googleProvider);
  }

  async function logout() {
    await fbSignOut(auth);
  }

  async function resetPassword(email: string) {
    const res = await fetch("/api/auth/send-reset-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Не удалось отправить письмо для восстановления пароля");
    }
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
