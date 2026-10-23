"use client";

import { Suspense } from "react";
import { Onboarding } from "@/components/messenger/Onboarding";

export default function MessengerStartPage() {
  return (
    <Suspense fallback={null}>
      <Onboarding />
    </Suspense>
  );
}
