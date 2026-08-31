"use client";

import { ReactNode, useEffect } from "react";
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
import { IosInstallPrompt } from "@/components/IosInstallPrompt";
import { AndroidInstallPrompt } from "@/components/AndroidInstallPrompt";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { EnableNotificationsPrompt } from "@/components/EnableNotificationsPrompt";
import { TwoFactorGate } from "@/components/TwoFactorGate";
import { initErrorLogging } from "@/lib/errorLogging";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initErrorLogging();
  }, []);

  return (
    <ThemeProvider>
      <UserThemeSync />
      <ServiceWorkerRegistrar />
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
            <IosInstallPrompt />
            <AndroidInstallPrompt />
            <EnableNotificationsPrompt />
            <BanGate>
              <TwoFactorGate>
                <MaintenanceGate>{children}</MaintenanceGate>
              </TwoFactorGate>
            </BanGate>
          </MascotProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
