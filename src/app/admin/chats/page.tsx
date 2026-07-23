"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Send, CheckCircle2, Megaphone, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { getAllTickets, addTicketMessage, setTicketStatus } from "@/lib/tickets";
import { getNewsPosts, createNewsPost, deleteNewsPost } from "@/lib/newsChannel";
import { SupportTicket, NewsPost, NewsButton } from "@/types";
import { useToast } from "@/lib/toastContext";
import { ImageUploadField } from "@/components/ImageUploadField";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";
import Image from "next/image";

const STATUS_LABEL: Record<SupportTicket["status"], { text: string; color: string }> = {
  open: { text: "Ожидает ответа", color: "#ff9800" },
  answered: { text: "Отвечено", color: "#4caf50" },
  closed: { text: "Закрыто", color: "#9aa3b2" },
};

function SupportTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | SupportTicket["status"]>("open");
  const { toast } = useToast();

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setTickets(await getAllTickets());
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на чтение. Проверь, что твой UID указан в firestore.rules как админ.");
      }
    } finally {
      setLoading(false);
    }
  }

  const active = tickets.find((t) => t.id === activeId) ?? null;
  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      await addTicketMessage(active.id, "admin", reply);
      const updatedMsg = { from: "admin" as const, text: reply, createdAt: Date.now() };
      setTickets((list) =>
        list.map((t) => (t.id === active.id ? { ...t, messages: [...t.messages, updatedMsg], status: "answered" } : t))
      );
      setReply("");
    } catch {
      toast("error", "Не удалось отправить ответ");
    } finally {
      setSending(false);
    }
  }

  async function handleClose(id: string) {
    await setTicketStatus(id, "closed");
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, status: "closed" } : t)));
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(["open", "answered", "closed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-btn text-xs font-medium ${
              filter === f ? "bg-accent text-black" : "bg-surface text-white/50"
            }`}
          >
            {f === "all" ? "Все" : STATUS_LABEL[f].text}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="card p-2 max-h-[600px] overflow-y-auto">
          {loading ? (
            <p className="text-center text-white/40 text-sm py-6">Загрузка...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-white/40 text-sm py-6">Обращений нет</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left p-3 rounded-btn mb-1 transition-colors ${
                  activeId === t.id ? "bg-accent/15" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_LABEL[t.status].color }} />
                </div>
                <p className="text-xs text-white/40 truncate">{t.userName} · {t.userEmail}</p>
              </button>
            ))
          )}
        </div>

        <div className="card p-5">
          {!active ? (
            <div className="text-center text-white/30 py-20">
              <MessageSquare className="mx-auto mb-2" size={28} />
              Выбери обращение слева
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-bold">{active.subject}</p>
                  <p className="text-xs text-white/40">{active.userName} · {active.userEmail}</p>
                </div>
                {active.status !== "closed" && (
                  <button onClick={() => handleClose(active.id)} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> Закрыть тикет
                  </button>
                )}
              </div>

              <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                {active.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "admin" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-btn px-3 py-2 text-sm ${
                        m.from === "admin" ? "bg-accent/15 text-white" : "bg-surface text-white/80"
                      }`}
                    >
                      <p className="text-[10px] text-white/30 mb-0.5">{m.from === "admin" ? "Ты (админ)" : active.userName}</p>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>

              {active.status !== "closed" && (
                <form onSubmit={handleReply} className="flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Ответить пользователю..."
                    className="input-field py-2.5 text-sm flex-1"
                  />
                  <button disabled={sending || !reply.trim()} className="btn-primary px-4 disabled:opacity-50">
                    <Send size={16} />
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_BUTTON: NewsButton = { text: "", link: "" };

function NewsTab() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [buttons, setButtons] = useState<NewsButton[]>([]);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setPosts(await getNewsPosts());
    } catch {
      toast("error", "Не удалось загрузить новости");
    } finally {
      setLoading(false);
    }
  }

  function updateButton(i: number, changes: Partial<NewsButton>) {
    setButtons((list) => list.map((b, idx) => (idx === i ? { ...b, ...changes } : b)));
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      toast("warning", "Введите текст поста");
      return;
    }
    setPosting(true);
    try {
      const cleanButtons = buttons.filter((b) => b.text.trim() && b.link.trim());
      await createNewsPost({ text: text.trim(), image: image || null, buttons: cleanButtons });
      toast("success", "Пост опубликован в канале");
      setText("");
      setImage("");
      setButtons([]);
      setShowForm(false);
      refresh();
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Не удалось опубликовать пост");
      }
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить этот пост из канала?")) return;
    await deleteNewsPost(id);
    setPosts((list) => list.filter((p) => p.id !== id));
    toast("success", "Пост удалён");
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={() => setShowForm((v) => !v)} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        <Plus size={16} /> Новый пост в канал
      </button>

      {showForm && (
        <form onSubmit={handlePost} className="card p-5 space-y-4">
          <textarea
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Текст поста..."
            rows={4}
            className="input-field py-2.5 text-sm"
          />
          <ImageUploadField value={image} onChange={setImage} folder="news" label="Изображение (необязательно)" size={72} />

          <div className="space-y-2">
            <p className="text-xs text-white/40">Кнопки со ссылками (необязательно)</p>
            {buttons.map((b, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={b.text}
                  onChange={(e) => updateButton(i, { text: e.target.value })}
                  placeholder="Текст кнопки"
                  className="input-field py-2 text-sm flex-1"
                />
                <input
                  value={b.link}
                  onChange={(e) => updateButton(i, { link: e.target.value })}
                  placeholder="https://..."
                  className="input-field py-2 text-sm flex-1"
                />
                <button type="button" onClick={() => setButtons((list) => list.filter((_, idx) => idx !== i))} className="p-2 text-red-400 hover:bg-red-400/10 rounded-md shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {buttons.length < 5 && (
              <button
                type="button"
                onClick={() => setButtons((list) => [...list, { ...EMPTY_BUTTON }])}
                className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <LinkIcon size={13} /> Добавить кнопку
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <button disabled={posting} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
              {posting ? "Публикуем..." : "Опубликовать"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2.5 text-sm">
              Отмена
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="card p-6 text-center text-white/40 text-sm">Загрузка...</div>
        ) : posts.length === 0 ? (
          <div className="card p-6 text-center text-white/40 text-sm">Постов пока нет</div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {isValidImageSrc(post.image) && (
                    <div className="relative w-full h-32 rounded-btn overflow-hidden bg-black/30 mb-2">
                      <Image src={safeImageSrc(post.image)} alt="" fill className="object-cover" sizes="480px" />
                    </div>
                  )}
                  <p className="text-sm text-white/80 whitespace-pre-wrap">{post.text}</p>
                  {post.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {post.buttons.map((b, i) => (
                        <span key={i} className="text-[10px] px-2 py-1 rounded-md bg-surface text-white/50">
                          {b.text} → {b.link}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-white/30 mt-2">{new Date(post.createdAt).toLocaleString("ru-RU")}</p>
                </div>
                <button onClick={() => handleDelete(post.id)} className="p-1.5 rounded-md hover:bg-white/10 text-red-400 shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminChatsPage() {
  const [tab, setTab] = useState<"support" | "news">("support");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Чаты</h1>
      <div className="flex gap-2">
        <button
          onClick={() => setTab("support")}
          className={`px-4 py-2 rounded-btn text-sm font-medium flex items-center gap-2 ${tab === "support" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
        >
          <MessageSquare size={15} /> Поддержка
        </button>
        <button
          onClick={() => setTab("news")}
          className={`px-4 py-2 rounded-btn text-sm font-medium flex items-center gap-2 ${tab === "news" ? "bg-accent text-black" : "bg-surface text-white/50"}`}
        >
          <Megaphone size={15} /> Velox Trade Новости
        </button>
      </div>
      {tab === "support" ? <SupportTab /> : <NewsTab />}
    </div>
  );
}
