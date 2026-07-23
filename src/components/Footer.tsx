import Link from "next/link";
import { Swords } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 font-bold mb-3">
            <Swords className="text-accent" size={20} />
            VELOX TRADE
          </div>
          <p className="text-white/40">Маркетплейс игровых предметов для Roblox.</p>
        </div>
        <div>
          <p className="text-white/40 mb-3">Магазин</p>
          <div className="flex flex-col gap-2 text-white/70">
            <Link href="/games">Игры</Link>
            <Link href="/catalog">Каталог</Link>
            <Link href="/catalog?new=1">Новинки</Link>
          </div>
        </div>
        <div>
          <p className="text-white/40 mb-3">Поддержка</p>
          <div className="flex flex-col gap-2 text-white/70">
            <Link href="/chats?tab=support">Центр поддержки</Link>
            <Link href="/chats?tab=support#faq">FAQ</Link>
          </div>
        </div>
        <div>
          <p className="text-white/40 mb-3">Аккаунт</p>
          <div className="flex flex-col gap-2 text-white/70">
            <Link href="/profile">Личный кабинет</Link>
            <Link href="/profile/topup">Пополнить баланс</Link>
          </div>
        </div>
      </div>
      <div className="text-center text-white/30 text-xs py-4 border-t border-border">
        © {new Date().getFullYear()} Velox Trade. Все права защищены.
      </div>
    </footer>
  );
}
