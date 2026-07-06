"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/authContext";
import { ToastProvider } from "@/lib/toastContext";
import { ThemeProvider } from "@/lib/themeContext";
import { UserThemeSync } from "@/components/UserThemeSync";
import { BanGate } from "@/components/BanGate";
import { ForceReloadListener } from "@/components/ForceReloadListener";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <UserThemeSync />
      <AuthProvider>
        <ForceReloadListener />
        <ToastProvider>
          <BanGate>{children}</BanGate>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
