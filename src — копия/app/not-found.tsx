"use client";

import { useEffect, useState } from "react";
import { getSiteScreen } from "@/lib/siteScreens";
import { SiteScreen } from "@/types";
import { SiteScreenView } from "@/components/SiteScreenView";

const DEFAULT_SCREEN: SiteScreen = {
  id: "notfound",
  enabled: true,
  image: "",
  title: "Такого предмета не существует 🥷",
  description: "Похоже, страница потерялась — возможно, товар уже продали, или ссылка устарела.",
  buttons: [
    { text: "На главную", link: "/" },
    { text: "Открыть каталог", link: "/catalog" },
  ],
  updatedAt: 0,
};

export default function NotFound() {
  const [screen, setScreen] = useState<SiteScreen>(DEFAULT_SCREEN);

  useEffect(() => {
    getSiteScreen("notfound").then((s) => {
      if (s && s.enabled) setScreen(s);
    });
  }, []);

  return <SiteScreenView screen={screen} />;
}
