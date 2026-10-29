"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Старая страница /support теперь живёт внутри единого раздела /chats (пункт «Поддержка»). */
export default function SupportRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/chats?tab=support");
  }, [router]);
  return <div className="max-w-3xl mx-auto px-4 py-24 text-center text-white/40">Переходим в раздел «Чаты»...</div>;
}
