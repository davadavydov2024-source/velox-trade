"use client";

import { useEffect, useState } from "react";
import { Send, Megaphone, Mail, Plus, Trash2, Edit3, Power, FlaskConical, MessageCircle } from "lucide-react";
import { getAllUsers } from "@/lib/users";
import { sendBroadcastEmail, sendEmail } from "@/lib/emailjs";
import { getAds, createAd, updateAd, deleteAd } from "@/lib/ads";
import { Ad } from "@/types";
import { useToast } from "@/lib/toastContext";
import { useAuth } from "@/lib/authContext";
import { ImageUploadField } from "@/components/ImageUploadField";

const EMPTY_AD: Omit<Ad, "id" | "createdAt"> = {
  title: "",
  description: "",
  image: "",
  color: "#ff9800",
  buttonText: "",
  buttonLink: "",
  endsAt: null,
  priority: 0,
  active: true,
};

export default function AdminAdsPage() {
  const [tab, setTab] = useState<"ads" | "broadcast" | "telegram">("broadcast");
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const [testSending, setTestSending] = useState(false);

  // --- email broadcast state ---
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [buttonLink, setButtonLink] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // --- telegram broadcast state ---
  const [tgText, setTgText] = useState("");
  const [tgPhotoUrl, setTgPhotoUrl] = useState("");
  const [tgButtonText, setTgButtonText] = useState("");
  const [tgButtonLink, setTgButtonLink] = useState("");
  const [tgSending, setTgSending] = useState(false);

  // --- ads state ---
  const [ads, setAds] = useState<Ad[]>([]);
  const [adsLoading, setAdsLoading] = useState(true);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [form, setForm] = useState(EMPTY_AD);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (tab === "ads") refreshAds();
  }, [tab]);

  async function refreshAds() {
    setAdsLoading(true);
    try {
      setAds(await getAds());
    } catch {
      toast("error", "Не удалось загрузить рекламу");
    } finally {
      setAdsLoading(false);
    }
  }

  function openCreateAd() {
    setEditing(null);
    setForm(EMPTY_AD);
    setShowForm(true);
  }

  function openEditAd(ad: Ad) {
    setEditing(ad);
    setForm({ ...ad });
    setShowForm(true);
  }

  async function handleSaveAd(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await updateAd(editing.id, form);
        toast("success", "Реклама обновлена");
      } else {
        await createAd(form);
        toast("success", "Реклама создана");
      }
      setShowForm(false);
      refreshAds();
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Ошибка сохранения рекламы");
      }
      console.error(err);
    }
  }

  async function handleDeleteAd(ad: Ad) {
    if (!confirm(`Удалить рекламу «${ad.title}»?`)) return;
    await deleteAd(ad.id);
    setAds((list) => list.filter((x) => x.id !== ad.id));
    toast("success", "Реклама удалена");
  }

  async function handleToggleActive(ad: Ad) {
    await updateAd(ad.id, { active: !ad.active });
    setAds((list) => list.map((x) => (x.id === ad.id ? { ...x, active: !x.active } : x)));
  }

  async function handleSendTest() {
    if (!profile?.email) return;
    setTestSending(true);
    try {
      await sendEmail({
        to_email: profile.email,
        to_name: profile.displayName,
        subject: "Тестовое письмо — Velox Trade",
        message: "Если ты видишь это письмо — EmailJS настроен верно и рассылка будет работать.",
      });
      toast("success", `Тестовое письмо отправлено на ${profile.email}. Проверь папку «Входящие» и «Спам».`);
    } catch (err: any) {
      console.error("Тестовое письмо EmailJS не отправилось:", err);
      const status = err?.status;
      if (status === 403 || status === 401) {
        toast("error", "EmailJS отклонил запрос (403/401). Проверь Public Key и разрешённые домены (Allowed origins) в настройках EmailJS.");
      } else if (status === 400) {
        toast("error", "EmailJS вернул ошибку 400 — вероятно, не совпадают названия переменных в шаблоне. Смотри консоль (F12).");
      } else {
        toast("error", "Не удалось отправить тестовое письмо. Подробности — в консоли браузера (F12).");
      }
    } finally {
      setTestSending(false);
    }
  }

  async function handleSendTelegramBroadcast() {
    if (!tgText.trim()) {
      toast("warning", "Введите текст сообщения");
      return;
    }
    if (!user) return;
    setTgSending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/telegram-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ text: tgText, photoUrl: tgPhotoUrl || undefined, buttonText: tgButtonText || undefined, buttonLink: tgButtonLink || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Не удалось отправить рассылку в Telegram");
        return;
      }
      if (data.total === 0) {
        toast("warning", "Пока ни один пользователь не привязал Telegram — рассылать некому.");
      } else if (data.failed === 0) {
        toast("success", `Отправлено ${data.sent} из ${data.total} привязанных пользователей`);
      } else {
        toast("warning", `Отправлено ${data.sent} из ${data.total}. ${data.failed} не доставлено.`);
      }
      setTgText("");
      setTgPhotoUrl("");
      setTgButtonText("");
      setTgButtonLink("");
    } catch {
      toast("error", "Не удалось связаться с сервером");
    } finally {
      setTgSending(false);
    }
  }

  async function handleSendBroadcast() {
    if (!title || !text) {
      toast("warning", "Заполните заголовок и текст рассылки");
      return;
    }
    setSending(true);
    let failCount = 0;
    let lastError: any = null;
    try {
      const users = await getAllUsers();
      setProgress({ done: 0, total: users.length });
      // EmailJS отправляет по одному письму за раз — для большой базы это может занять время.
      // Небольшая пауза между письмами снижает риск упереться в лимит запросов в секунду у EmailJS.
      // Для production-нагрузки лучше перенести рассылку на серверный SDK (Resend/SendGrid) через Cloud Function.
      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        try {
          await sendBroadcastEmail(u.email, title, text, buttonText, buttonLink);
        } catch (err) {
          failCount++;
          lastError = err;
          console.error(`Не удалось отправить письмо на ${u.email}:`, err);
        }
        setProgress({ done: i + 1, total: users.length });
        if (i < users.length - 1) await new Promise((r) => setTimeout(r, 250));
      }
      if (failCount === 0) {
        toast("success", `Рассылка отправлена ${users.length} пользователям`);
      } else if (failCount === users.length) {
        toast("error", "Ни одно письмо не отправлено. Проверь настройки EmailJS (см. раздел про почту в README).");
        console.error("Последняя ошибка EmailJS:", lastError);
      } else {
        toast("warning", `Отправлено ${users.length - failCount} из ${users.length}. ${failCount} писем не ушли — смотри консоль браузера (F12).`);
      }
      setTitle("");
      setText("");
      setButtonText("");
      setButtonLink("");
    } catch (err) {
      toast("error", "Ошибка при отправке рассылки. Проверь настройки EmailJS в .env.local.");
      console.error(err);
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Реклама и рассылка</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("ads")}
          className={`px-4 py-2 rounded-btn text-sm font-medium flex items-center gap-2 ${
            tab === "ads" ? "bg-accent text-black" : "bg-surface text-white/60"
          }`}
        >
          <Megaphone size={15} /> Реклама
        </button>
        <button
          onClick={() => setTab("broadcast")}
          className={`px-4 py-2 rounded-btn text-sm font-medium flex items-center gap-2 ${
            tab === "broadcast" ? "bg-accent text-black" : "bg-surface text-white/60"
          }`}
        >
          <Mail size={15} /> Email-рассылка
        </button>
        <button
          onClick={() => setTab("telegram")}
          className={`px-4 py-2 rounded-btn text-sm font-medium flex items-center gap-2 ${
            tab === "telegram" ? "bg-accent text-black" : "bg-surface text-white/60"
          }`}
        >
          <MessageCircle size={15} /> Telegram-рассылка
        </button>
      </div>

      {tab === "telegram" ? (
        <div className="card p-5 space-y-4 max-w-xl">
          <p className="text-xs text-white/40">
            Уйдёт всем пользователям, которые привязали Telegram (Профиль → Безопасность). Требует настроенного
            TELEGRAM_BOT_TOKEN и Firebase Admin SDK на сервере (см. README, раздел про вход через Telegram).
          </p>
          <ImageUploadField value={tgPhotoUrl} onChange={setTgPhotoUrl} folder="broadcasts" label="Фото (необязательно)" size={80} />
          <textarea
            value={tgText}
            onChange={(e) => setTgText(e.target.value)}
            placeholder="Текст сообщения для рассылки в Telegram..."
            rows={5}
            className="input-field py-2.5"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={tgButtonText}
              onChange={(e) => setTgButtonText(e.target.value)}
              placeholder="Текст кнопки (необязательно)"
              className="input-field py-2.5"
            />
            <input
              value={tgButtonLink}
              onChange={(e) => setTgButtonLink(e.target.value)}
              placeholder="Ссылка кнопки"
              className="input-field py-2.5"
            />
          </div>
          <button
            onClick={handleSendTelegramBroadcast}
            disabled={tgSending}
            className="btn-primary px-6 py-3 flex items-center gap-2 disabled:opacity-50"
          >
            <Send size={16} /> {tgSending ? "Отправка..." : "Отправить в Telegram всем"}
          </button>
        </div>
      ) : tab === "broadcast" ? (
        <div className="space-y-4 max-w-xl">
          <div className="card p-4 flex items-center justify-between gap-3 border border-accent/20 bg-accent/5">
            <div>
              <p className="text-sm font-medium">Проверить, что EmailJS вообще работает</p>
              <p className="text-xs text-white/40">Пришлёт тестовое письмо на твой email ({profile?.email})</p>
            </div>
            <button onClick={handleSendTest} disabled={testSending} className="btn-secondary px-4 py-2 text-sm flex items-center gap-2 shrink-0 disabled:opacity-50">
              <FlaskConical size={15} /> {testSending ? "Отправка..." : "Тест"}
            </button>
          </div>

          <div className="card p-5 space-y-4">
            <p className="text-xs text-white/40">
              Письмо уйдёт всем зарегистрированным пользователям через EmailJS, используя шаблон template_qo1n6m8.
              Если письма не доходят даже после «Отправить всем» без ошибок — сначала нажми «Тест» выше и посмотри
              консоль браузера (F12 → Console), там EmailJS покажет точную причину.
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Заголовок"
              className="input-field py-2.5"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Текст сообщения для рассылки..."
              rows={5}
              className="input-field py-2.5"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="Текст кнопки (необязательно)"
                className="input-field py-2.5"
              />
              <input
                value={buttonLink}
                onChange={(e) => setButtonLink(e.target.value)}
                placeholder="Ссылка кнопки"
                className="input-field py-2.5"
              />
            </div>
            <button
              onClick={handleSendBroadcast}
              disabled={sending}
              className="btn-primary px-6 py-3 flex items-center gap-2 disabled:opacity-50"
            >
              <Send size={16} /> {sending ? `Отправка ${progress?.done ?? 0}/${progress?.total ?? "?"}...` : "Отправить всем"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={openCreateAd} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
            <Plus size={16} /> Создать рекламу
          </button>

          {showForm && (
            <form onSubmit={handleSaveAd} className="card p-5 grid sm:grid-cols-2 gap-4">
              <input
                required
                placeholder="Заголовок"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="input-field py-2.5"
              />
              <div>
                <ImageUploadField value={form.image} onChange={(url) => setForm({ ...form, image: url })} folder="ads" label="Изображение (необязательно)" size={64} />
              </div>
              <textarea
                placeholder="Описание"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-field py-2.5 sm:col-span-2"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-white/40 shrink-0">Цвет</label>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-10 w-16 rounded-btn bg-surface border border-border"
                />
              </div>
              <input
                type="number"
                placeholder="Приоритет (чем выше — тем выше в списке)"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="input-field py-2.5"
              />
              <input
                placeholder="Текст кнопки"
                value={form.buttonText}
                onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                className="input-field py-2.5"
              />
              <input
                placeholder="Ссылка кнопки"
                value={form.buttonLink}
                onChange={(e) => setForm({ ...form, buttonLink: e.target.value })}
                className="input-field py-2.5"
              />
              <input
                type="date"
                value={form.endsAt ? new Date(form.endsAt).toISOString().slice(0, 10) : ""}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value ? new Date(e.target.value).getTime() : null })}
                className="input-field py-2.5"
              />
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Активна
              </label>
              <div className="sm:col-span-2 flex gap-3">
                <button className="btn-primary px-5 py-2.5 text-sm">{editing ? "Сохранить" : "Создать"}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2.5 text-sm">
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 border-b border-border">
                  <th className="p-3">Заголовок</th>
                  <th className="p-3">Приоритет</th>
                  <th className="p-3">Окончание</th>
                  <th className="p-3">Статус</th>
                  <th className="p-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {adsLoading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-white/40">
                      Загрузка...
                    </td>
                  </tr>
                ) : ads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-white/40">
                      Реклама ещё не создана
                    </td>
                  </tr>
                ) : (
                  ads.map((ad) => (
                    <tr key={ad.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                      <td className="p-3 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ad.color }} />
                        {ad.title}
                      </td>
                      <td className="p-3 text-white/50">{ad.priority}</td>
                      <td className="p-3 text-white/50">
                        {ad.endsAt ? new Date(ad.endsAt).toLocaleDateString("ru-RU") : "Бессрочно"}
                      </td>
                      <td className="p-3">
                        {ad.active ? (
                          <span className="text-green-400 text-xs font-semibold">Активна</span>
                        ) : (
                          <span className="text-white/30 text-xs font-semibold">Выключена</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleToggleActive(ad)} className="p-1.5 rounded-md hover:bg-white/10 text-white/60" title="Вкл/выкл">
                            <Power size={15} />
                          </button>
                          <button onClick={() => openEditAd(ad)} className="p-1.5 rounded-md hover:bg-white/10 text-white/60">
                            <Edit3 size={15} />
                          </button>
                          <button onClick={() => handleDeleteAd(ad)} className="p-1.5 rounded-md hover:bg-white/10 text-red-400">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

