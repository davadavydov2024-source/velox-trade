"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, MessageSquare, Send, Plus } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createTicket, getUserTickets, addTicketMessage } from "@/lib/tickets";
import { sendSupportAutoReply } from "@/lib/emailjs";
import { SupportTicket } from "@/types";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

const FAQ = [
  { q: "Как пополнить баланс?", a: "Перейдите в личный кабинет → Пополнение баланса, создайте заявку и дождитесь, пока администратор её одобрит." },
  { q: "Как быстро приходит товар?", a: "Обычно доставка занимает от нескольких минут до пары часов после оплаты заказа." },
  { q: "Что делать, если товар не пришёл?", a: "Создайте обращение ниже с номером заказа — мы разберёмся в течение суток." },
  { q: "Можно ли вернуть деньги?", a: "Да, если товар не был выдан. Создайте обращение ниже, приложив номер заказа." },
];

const STATUS_LABEL: Record<SupportTicket["status"], { text: string; color: string }> = {
  open: { text: "Ожидает ответа", color: "#ff9800" },
  answered: { text: "Отвечено", color: "#4caf50" },
  closed: { text: "Закрыто", color: "#9aa3b2" },
};

/**
 * Панель «Поддержка» — тот же экран, что раньше был на отдельной странице /support:
 * Telegram-бот, мои обращения (тикеты) и FAQ. Теперь встроена как один из чатов в /chats.
 */
export function SupportPanel() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoadingTickets(false);
      return;
    }
    getUserTickets(user.uid)
      .then(setTickets)
      .catch((err) => {
        console.error("Не удалось загрузить обращения:", err);
        toast("error", "Не удалось загрузить обращения. Подробности — в консоли браузера (F12).");
        setTickets([]);
      })
      .finally(() => setLoadingTickets(false));
  }, [user]);

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) {
      toast("warning", "Войдите в аккаунт, чтобы создать обращение");
      return;
    }
    setSubmitting(true);
    try {
      await createTicket({
        userId: user.uid,
        userName: profile.displayName,
        userEmail: profile.email,
        subject,
        message,
      });
      sendSupportAutoReply(profile.email, profile.displayName, subject).catch((err) => {
        console.error("Не удалось отправить автоответ:", err);
      });
      toast("success", "Обращение создано. Мы ответим в ближайшее время.");
      setSubject("");
      setMessage("");
      setShowNewForm(false);
      const updated = await getUserTickets(user.uid);
      setTickets(updated);
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет доступа к базе данных. Проверь, что правила Firestore опубликованы.");
      } else {
        toast("error", "Не удалось создать обращение");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTicket || !reply.trim()) return;
    setSubmitting(true);
    try {
      await addTicketMessage(activeTicket.id, "user", reply);
      const updated = { ...activeTicket, messages: [...activeTicket.messages, { from: "user" as const, text: reply, createdAt: Date.now() }] };
      setActiveTicket(updated);
      setTickets((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      setReply("");
    } catch {
      toast("error", "Не удалось отправить сообщение");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="card p-5 mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Написать в Telegram-бота</p>
          <p className="text-sm text-white/40">Быстрый способ получить ответ или обсудить пополнение</p>
        </div>
        <a
          href={`https://t.me/${TELEGRAM_BOT}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm shrink-0"
        >
          Открыть бота <ExternalLink size={14} />
        </a>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MessageSquare size={18} className="text-accent" /> Мои обращения
          </h2>
          {user && (
            <button onClick={() => setShowNewForm((v) => !v)} className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
              <Plus size={14} /> Новое обращение
            </button>
          )}
        </div>

        {!user ? (
          <div className="card p-6 text-center text-white/40 text-sm">
            <Link href="/auth/login" className="text-accent hover:underline">
              Войдите в аккаунт
            </Link>
            , чтобы создавать обращения и видеть ответы поддержки.
          </div>
        ) : (
          <>
            {showNewForm && (
              <form onSubmit={handleCreateTicket} className="card p-5 space-y-3 mb-4">
                <input
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Тема обращения"
                  className="input-field py-2.5 text-sm"
                />
                <textarea
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Опиши проблему подробно..."
                  rows={4}
                  className="input-field py-2.5 text-sm"
                />
                <button disabled={submitting} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
                  {submitting ? "Отправляем..." : "Отправить"}
                </button>
              </form>
            )}

            {loadingTickets ? (
              <div className="card p-6 text-center text-white/40 text-sm">Загрузка...</div>
            ) : tickets.length === 0 ? (
              <div className="card p-6 text-center text-white/40 text-sm">У тебя пока нет обращений.</div>
            ) : activeTicket ? (
              <div className="card p-5">
                <button onClick={() => setActiveTicket(null)} className="text-xs text-white/40 hover:text-white/70 mb-3">
                  ← Ко всем обращениям
                </button>
                <div className="flex items-center justify-between mb-4">
                  <p className="font-medium">{activeTicket.subject}</p>
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-md"
                    style={{ background: `${STATUS_LABEL[activeTicket.status].color}22`, color: STATUS_LABEL[activeTicket.status].color }}
                  >
                    {STATUS_LABEL[activeTicket.status].text}
                  </span>
                </div>
                <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                  {activeTicket.messages.map((m, i) => (
                    <div key={i} className={`flex ${m.from === "admin" ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[80%] rounded-btn px-3 py-2 text-sm ${
                          m.from === "admin" ? "bg-accent/15 text-white" : "bg-surface text-white/80"
                        }`}
                      >
                        <p className="text-[10px] text-white/30 mb-0.5">{m.from === "admin" ? "Поддержка" : "Вы"}</p>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
                {activeTicket.status !== "closed" && (
                  <form onSubmit={handleReply} className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Написать сообщение..."
                      className="input-field py-2.5 text-sm flex-1"
                    />
                    <button disabled={submitting || !reply.trim()} className="btn-primary px-4 disabled:opacity-50">
                      <Send size={16} />
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTicket(t)}
                    className="card p-4 w-full text-left flex items-center justify-between hover:bg-white/[0.02]"
                  >
                    <div>
                      <p className="font-medium text-sm">{t.subject}</p>
                      <p className="text-xs text-white/40">{new Date(t.updatedAt).toLocaleString("ru-RU")}</p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-md shrink-0"
                      style={{ background: `${STATUS_LABEL[t.status].color}22`, color: STATUS_LABEL[t.status].color }}
                    >
                      {STATUS_LABEL[t.status].text}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <h2 id="faq" className="text-lg font-bold mb-4">
        Частые вопросы
      </h2>
      <div className="space-y-2">
        {FAQ.map((item, i) => (
          <div key={i} className="card overflow-hidden">
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <span className="font-medium text-sm">{item.q}</span>
              <ChevronDown
                size={18}
                className={`text-white/40 transition-transform ${openFaq === i ? "rotate-180" : ""}`}
              />
            </button>
            {openFaq === i && <div className="px-4 pb-4 text-sm text-white/50">{item.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
