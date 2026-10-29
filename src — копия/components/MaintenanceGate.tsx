"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSiteScreen } from "@/lib/siteScreens";
import { SiteScreen } from "@/types";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";
import { SiteScreenView } from "@/components/SiteScreenView";

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const [screen, setScreen] = useState<SiteScreen | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getSiteScreen("global")
      .then(setScreen)
      .finally(() => setChecked(true));
  }, []);

  // Пока не проверили — просто показываем сайт как обычно, чтобы не мигать пустым экраном.
  if (!checked) return <>{children}</>;

  const isAdmin = isAdminUid(user?.uid) || profile?.badges?.includes("admin");
  const bypass = pathname.startsWith("/admin") || isAdmin;

  if (screen?.enabled && !bypass) {
    return <SiteScreenView screen={screen} />;
  }

  return <>{children}</>;
}
