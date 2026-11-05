"use client";

import { useState } from "react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import type { MMessage } from "./mtypes";

/** Кнопки под служебным сообщением «Заявка на вступление»: Принять / Отклонить. После решения статус обновляется у всех админов канала. */
export function JoinRequestActions({ jr }: { jr: NonNullable<MMessage["joinRequest"]> }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"" | "yes" | "no">("");
  const act = async (approve: boolean) => {
    if (busy) return;
    setBusy(approve ? "yes" : "no");
    try {
      await mApi("join-requests", { chatId: jr.chatId, uid: jr.uid, approve });
      toast("success", approve ? `${jr.name} принят(а) в «${jr.title}»` : "Заявка отклонена");
    } catch (e) {
      toast("error", e instanceof MApiError ? e.message : "Не получилось");
    } finally { setBusy(""); }
  };
  if (jr.status !== "pending") {
    return <p className="mt-2 text-[13.5px] font-bold" style={{ color: jr.status === "approved" ? "#34c759" : "var(--mx-muted)" }}>{jr.status === "approved" ? "Заявка принята" : "Заявка отклонена"}</p>;
  }
  return (
    <div className="flex gap-2 mt-2.5">
      <button onClick={() => act(true)} disabled={!!busy} className="flex-1 h-9 rounded-full font-bold text-[14px] disabled:opacity-60" style={{ background: "#34c759", color: "#fff" }}>{busy === "yes" ? "…" : "Принять"}</button>
      <button onClick={() => act(false)} disabled={!!busy} className="flex-1 h-9 rounded-full font-bold text-[14px] disabled:opacity-60" style={{ background: "rgba(127,127,140,0.25)", color: "inherit" }}>{busy === "no" ? "…" : "Отклонить"}</button>
    </div>
  );
}
