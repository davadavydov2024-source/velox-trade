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
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { MascotProvider } from "@/lib/mascotContext";
import { MascotCelebration } from "@/components/MascotCelebration";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <UserThemeSync />
      <AuthProvider>
        <UserLanguageSync />
        <ForceReloadListener />
        <ToastProvider>
          <MascotProvider>
            <SessionManager />
            <PresenceSync />
            <FavoritesSync />
            <CartSync />
            <EventBanner />
            <GlobalMessageListener />
            <MascotCelebration />
            <BanGate>
              <MaintenanceGate>{children}</MaintenanceGate>
            </BanGate>
          </MascotProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
