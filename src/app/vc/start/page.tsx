"use client";

import { Suspense } from "react";
import { Onboarding } from "@/components/vchat/Onboarding";

export default function MessengerStartPage() {
  return (
    <Suspense fallback={null}>
      <Onboarding />
    </Suspense>
  );
}
