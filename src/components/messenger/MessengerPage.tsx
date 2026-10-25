"use client";

import { Suspense } from "react";
import { MessengerApp } from "./MessengerApp";

// MessengerApp сам читает ?chat=, ?join=, ?stickers= через useSearchParams, поэтому пропсы не нужны.
export default function MessengerPage() {
  return (
    <Suspense fallback={null}>
      <MessengerApp />
    </Suspense>
  );
}
