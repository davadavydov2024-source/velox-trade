"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

/** Тем, кто уже вошёл (или открыл установленное приложение), лендинг не нужен — сразу в мессенджер. */
export function LandingRedirect({ to }: { to: string }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone || (!loading && user)) router.replace(to);
  }, [loading, user, router, to]);
  return null;
}
