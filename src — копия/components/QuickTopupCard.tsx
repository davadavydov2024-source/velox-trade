import Link from "next/link";
import { QrCode, ExternalLink, Smartphone, Wallet } from "lucide-react";

const METHODS = [
  { icon: QrCode, label: "QR-код" },
  { icon: ExternalLink, label: "Playerok" },
  { icon: ExternalLink, label: "FunPay" },
  { icon: Smartphone, label: "По телефону" },
];

export function QuickTopupCard() {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Wallet size={16} className="text-accent" />
        <p className="text-sm font-semibold">Пополнить баланс</p>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {METHODS.map((m) => (
          <div key={m.label} className="flex flex-col items-center gap-1 bg-white/5 rounded-btn py-2.5">
            <m.icon size={15} className="text-white/50" />
            <span className="text-[9px] text-white/40 text-center leading-tight">{m.label}</span>
          </div>
        ))}
      </div>
      <Link href="/profile/topup" className="btn-primary w-full py-2.5 text-sm text-center block">
        Пополнить →
      </Link>
    </div>
  );
}
