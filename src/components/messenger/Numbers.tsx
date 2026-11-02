"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Copy, Eye, EyeOff, Hash, Send } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { NUMBER_TIERS, analyzeNumber, formatNumber, type NumberTier } from "@/lib/messenger/numbers";
import { mApi, MApiError } from "./api";
import { Sheet, Spinner } from "./ui";
import { RecipientList } from "./Gifts";

type MyNumber = { digits: string; createdAt: number; tier: NumberTier };

/** Метка уровня редкости рядом с номером (у обычных номеров не показывается). */
export function NumberTierChip({ digits }: { digits: string }) {
  const { tier } = analyzeNumber(digits);
  if (tier === "common") return null;
  const c = NUMBER_TIERS[tier];
  return <span className="text-[12px] font-medium px-1.5 py-0.5 rounded-md shrink-0" style={{ background: `color-mix(in srgb, ${c.color} 18%, transparent)`, color: c.color }}>{c.label}</span>;
}

function Row({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3 text-left active:bg-white/5">
      <span className="shrink-0 w-6 flex justify-center" style={{ color: "var(--mx-accent)" }}>{icon}</span>
      <span className="flex-1 text-[16px]">{label}</span>
      {hint && <span className="mx-muted text-[13px]">{hint}</span>}
      <ChevronRight size={16} className="mx-muted" />
    </button>
  );
}

/** «Мои номера»: список, показать в профиле / убрать, скопировать, передать другому человеку. */
export function NumbersSheet({ open, onClose, me }: { open: boolean; onClose: () => void; me: string }) {
  const { toast } = useToast();
  const [list, setList] = useState<MyNumber[] | null>(null);
  const [attached, setAttached] = useState<string | null>(null);
  const [sel, setSel] = useState<MyNumber | null>(null);
  const [giveOpen, setGiveOpen] = useState(false);
  const [giveTo, setGiveTo] = useState<{ uid: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    mApi<{ numbers: MyNumber[]; attached: string | null }>("numbers").then((d) => { setList(d.numbers); setAttached(d.attached); }).catch(() => setList([]));
  }, []);
  useEffect(() => { if (open) { setList(null); load(); } }, [open, load]);

  const run = async (body: Record<string, unknown>, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await mApi("numbers", body); toast("success", ok); setSel(null); setGiveOpen(false); setGiveTo(null); load(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); } finally { setBusy(false); }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Мои номера" full>
        <div className="px-4 pb-8">
          <p className="mx-muted text-[14px] mb-3">Номер вида +888 можно показать в профиле, как телефон в Telegram, и передать другому человеку. Редкие номера выдаёт администрация.</p>
          {list === null ? <div className="flex justify-center py-10"><Spinner /></div> : list.length === 0 ? (
            <div className="text-center py-12 px-6"><Hash size={36} className="mx-auto mx-muted mb-3" /><p className="text-[16px] font-semibold">Номеров пока нет</p></div>
          ) : (
            <div className="mx-card">
              {list.map((n) => (
                <button key={n.digits} onClick={() => setSel(n)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[18px] font-semibold tabular-nums tracking-wide" style={{ color: n.tier === "common" ? undefined : NUMBER_TIERS[n.tier].color }}>{formatNumber(n.digits)}</span>
                    <span className="block text-[13px] mx-muted mt-0.5">{attached === n.digits ? "Показан в профиле" : analyzeNumber(n.digits).reason || "Номер"}</span>
                  </span>
                  <NumberTierChip digits={n.digits} />
                  {attached === n.digits && <Check size={18} style={{ color: "var(--mx-accent)" }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? formatNumber(sel.digits) : ""} zIndex={70}>
        {sel && (
          <div className="px-4 pb-8">
            <div className="mx-card">
              {attached === sel.digits
                ? <Row icon={<EyeOff size={20} />} label="Убрать из профиля" onClick={() => run({ action: "detach" }, "Номер убран из профиля")} />
                : <Row icon={<Eye size={20} />} label="Показать в профиле" onClick={() => run({ action: "attach", digits: sel.digits }, "Номер показан в профиле")} />}
              <Row icon={<Copy size={20} />} label="Скопировать" onClick={() => navigator.clipboard?.writeText(formatNumber(sel.digits)).then(() => toast("success", "Скопировано")).catch(() => {})} />
              <Row icon={<Send size={20} />} label="Передать" hint="другому человеку" onClick={() => { setGiveTo(null); setGiveOpen(true); }} />
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={giveOpen && !!sel} onClose={() => { setGiveOpen(false); setGiveTo(null); }} title={giveTo ? "Подтверждение" : "Кому передать?"} full zIndex={75}>
        {sel && (giveTo ? (
          <div className="px-5 pb-8 flex flex-col items-center text-center">
            <p className="text-[26px] font-bold tabular-nums mt-4" style={{ color: sel.tier === "common" ? undefined : NUMBER_TIERS[sel.tier].color }}>{formatNumber(sel.digits)}</p>
            <p className="text-[17px] font-semibold mt-3">Передать номер пользователю {giveTo.name}?</p>
            <p className="mx-muted text-[13px] mt-1">Номер перейдёт к нему насовсем. Вернуть его можно только если он сам передаст его обратно.</p>
            <button className="mx-btn w-full mt-5" disabled={busy} onClick={() => run({ action: "transfer", digits: sel.digits, toUid: giveTo.uid }, `Номер передан: ${giveTo.name}`)}>{busy ? <Spinner size={18} /> : "Передать"}</button>
            <button className="mx-btn-ghost w-full mt-1 py-2" onClick={() => setGiveTo(null)}>Выбрать другого</button>
          </div>
        ) : (
          <RecipientList me={me} exclude={[me]} onPick={setGiveTo} />
        ))}
      </Sheet>
    </>
  );
}
