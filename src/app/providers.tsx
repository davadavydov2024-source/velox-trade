"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/authContext";
import { ToastProvider } from "@/lib/toastContext";
import { ThemeProvider } from "@/lib/themeContext";
import { UserThemeSync } from "@/components/UserThemeSync";
import { UserLanguageSync } from "@/components/UserLanguageSync";
import { BanGate } from "@/components/BanGate";
import { ForceReloadListener } from "@/components/ForceReloadListener";
import { SessionManager } from "@/components/SessionManager";
import { EventBanner } from "@/components/EventBanner";
import { PresenceSync } from "@/components/PresenceSync";
import { FavoritesSync } from "@/components/FavoritesSync";
import { GlobalMessageListener } from "@/components/GlobalMessageListener";
import { CartSync } from "@/components/CartSync";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <UserThemeSync />
      <AuthProvider>
        <UserLanguageSync />
        <ForceReloadListener />
        <ToastProvider>
          <SessionManager />
          <PresenceSync />
          <FavoritesSync />
          <CartSync />
          <EventBanner />
          <GlobalMessageListener />
          <BanGate>{children}</BanGate>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
