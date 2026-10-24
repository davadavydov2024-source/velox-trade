"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MessengerApp from "@/components/messenger/MessengerApp";

function Inner() {
  const sp = useSearchParams();
  return <MessengerApp initialChat={sp.get("chat")} joinParam={sp.get("join")} stickersParam={sp.get("stickers")} />;
}

export default function MessengerPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
