import Link from "next/link";
import { UserPlus, Wallet, ShoppingCart, Tag, Disc3, MessageSquare, CheckCircle2, ArrowRight } from "lucide-react";

const STEPS = [
  {
    icon: UserPlus,
    color: "#4a6cf7",
    title: "1. Зарегистрируйся",
    text: "Нажми «Войти» и создай аккаунт по email — это займёт меньше минуты. Можно также привязать Telegram, чтобы получать уведомления о заказах и сообщениях прямо в бота.",
    cta: { href: "/auth/register", label: "Создать аккаунт" },
  },
  {
    icon: Wallet,
    color: "#22c55e",
    title: "2. Пополни баланс",
    text: "В личном кабинете выбери «Пополнить» — картой, СБП или другим доступным способом. Деньги зачисляются на внутренний баланс, которым удобно расплачиваться за предметы.",
    cta: { href: "/profile/topup", label: "Пополнить баланс" },
  },
  {
    icon: ShoppingCart,
    color: "#ff9800",
    title: "3. Купи предмет",
    text: "Выбери игру в каталоге, найди нужный предмет, добавь в корзину и оформи заказ. После оплаты открывается чат с продавцом — там же можно подтвердить получение или открыть спор, если что-то пошло не так.",
    cta: { href: "/catalog", label: "Открыть каталог" },
  },
  {
    icon: Tag,
    color: "#e879f9",
    title: "4. Продай свой предмет",
    text: "Заполни форму «Продать»: название, игра, желаемая цена и фото предмета. Заявка уходит администратору — после проверки предмет появится в каталоге и на него можно будет получать заказы.",
    cta: { href: "/profile/sell", label: "Продать предмет" },
  },
  {
    icon: Disc3,
    color: "#38bdf8",
    title: "5. Крути колесо фортуны",
    text: "Раз в 24 часа можно бесплатно крутить колесо и выигрывать случайные предметы или бонусы на баланс.",
    cta: { href: "/profile/wheel", label: "Колесо фортуны" },
  },
  {
    icon: MessageSquare,
    color: "#f87171",
    title: "6. Если нужна помощь",
    text: "Все переписки — по заказам и с поддержкой — собраны в разделе «Чаты». Там же можно открыть обращение в поддержку, если возникла любая проблема.",
    cta: { href: "/chats", label: "Открыть чаты" },
  },
];

export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold mb-2">Как пользоваться Velox Trade</h1>
        <p className="text-white/50">Коротко о том, как купить, продать и не потеряться на сайте</p>
      </div>

      <div className="space-y-4">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="card p-5 flex gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${step.color}22`, color: step.color }}
              >
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold mb-1.5">{step.title}</h2>
                <p className="text-sm text-white/60 mb-3 leading-relaxed">{step.text}</p>
                <Link href={step.cta.href} className="inline-flex items-center gap-1.5 text-accent text-sm font-medium hover:underline">
                  {step.cta.label} <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-5 mt-6 flex items-start gap-3 bg-accent/5 border-accent/20">
        <CheckCircle2 size={20} className="text-accent shrink-0 mt-0.5" />
        <p className="text-sm text-white/60">
          Все сделки защищены: деньги списываются с покупателя только при оформлении заказа, а если с товаром
          что-то не так — можно открыть спор прямо в чате по заказу, и администратор разберётся.
        </p>
      </div>
    </div>
  );
}
