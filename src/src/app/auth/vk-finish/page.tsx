"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";

function VkFinishInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { loginWithCustomToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setError("Не хватает кода для входа.");
      return;
    }

    fetch("/api/auth/vk-finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не удалось войти");
        await loginWithCustomToken(data.token);
        router.replace("/profile");
      })
      .catch((err) => setError(err.message || "Не удалось войти через VK"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      {error ? (
        <>
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => router.replace("/auth/login")} className="btn-secondary px-5 py-2.5 text-sm">
            Вернуться ко входу
          </button>
        </>
      ) : (
        <p className="text-white/40">Входим через VK...</p>
      )}
    </div>
  );
}

export default function VkFinishPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-24 text-center text-white/40">Загрузка...</div>}>
      <VkFinishInner />
    </Suspense>
  );
}
