"use client";

import { Suspense } from "react";
import { MessengerApp } from "@/components/vchat/MessengerApp";

export default function MessengerPage() {
  return (
    <Suspense fallback={null}>
      <MessengerApp />
    </Suspense>
  );
}
