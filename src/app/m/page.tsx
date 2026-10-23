"use client";

import { Suspense } from "react";
import { MessengerApp } from "@/components/messenger/MessengerApp";

export default function MessengerPage() {
  return (
    <Suspense fallback={null}>
      <MessengerApp />
    </Suspense>
  );
}
