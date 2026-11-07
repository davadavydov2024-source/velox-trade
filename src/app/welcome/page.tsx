import Link from "next/link";
import { Apple, ArrowRight, Check, Download, Gift, Globe, Megaphone, MessageCircle, Mic, Monitor, Plus, Smartphone, Sparkles } from "lucide-react";
import { LandingRedirect } from "@/components/landing/LandingRedirect";
import { APP_PATH, getLatestRelease } from "@/lib/messenger/releases";
import "@/components/landing/landing.css";

export const revalidate = 600;

const FEATURES = [
  { icon: MessageCircle, title: "Чаты и группы", text: "Личные переписки, группы, стикеры, GIF и опросы." },
  { icon: Mic, title: "Голосовые и кружки", text: "Голосовые сообщения и видеокружки — записал и отправил." },
  { icon: Megaphone, title: "Каналы", text: "Посты для подписчиков, реакции и розыгрыши." },
  { icon: Gift, title: "Подарки и оформление", text: "Подарки, рамки, статусы и цвет ника — чтобы выделяться." },
];

const FAQ = [
  { q: "Это бесплатно?", a: "Да, MiliGram бесплатный. Платными могут быть только необязательные украшения — подарки и оформление, они не нужны для общения." },
  { q: "Как зарегистрироваться?", a: "Нужны почта и пароль. В конце нажмёшь «Старт» в нашем Telegram-боте — так мы убеждаемся, что ты не бот. Номер телефона не нужен." },
  { q: "Почему телефон предупреждает при установке APK?", a: "Android так предупреждает о любом приложении не из Google Play. Файл скачивается с нашего сервера — разреши установку, и дальше приложение будет обновляться само." },
  { q: "Переписка общая на всех устройствах?", a: "Да. Войди в один аккаунт в браузере, на Windows и на телефоне — сообщения и чаты будут везде одинаковые и приходить сразу." },
];

export default async function WelcomePage() {
  const rel = await getLatestRelease();
  const note = [
    rel?.windows ? `Windows — версия ${rel.version} • ${rel.windows.sizeMb} МБ` : "",
    rel?.android ? `Android — ${rel.android.sizeMb} МБ` : "",
  ].filter(Boolean).join("  ·  ");

  return (
    <div className="sl-land">
      <LandingRedirect to={APP_PATH} />
      <div className="sl-glow" aria-hidden />

      <header className="sl-nav">
        <Link href="/" className="sl-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/miligram/icon-512.png" alt="" width={34} height={34} />
          <span>MiliGram</span>
        </Link>
        <Link href={APP_PATH} className="sl-btn sl-btn-blue sl-btn-sm">Открыть MiliGram</Link>
      </header>

      <main>
        <section className="sl-hero">
          <div className="sl-hero-text">
            <h1 className="sl-h1">
              Чаты, каналы <br />
              <span>и подарки</span> <br />
              в одном приложении
            </h1>
            <p className="sl-lead">Переписки, группы и каналы, голосовые и видеокружки, стикеры и подарки. Работает прямо в браузере — а если хочется отдельное окно, есть приложение.</p>
            <div className="sl-cta">
              <Link href={APP_PATH} className="sl-btn sl-btn-blue"><Check size={18} /> Открыть в браузере</Link>
              {rel?.windows ? (
                <a href={rel.windows.url} className="sl-btn sl-btn-ghost"><Monitor size={18} /> Windows</a>
              ) : (
                <span className="sl-btn sl-btn-ghost sl-soon"><Monitor size={18} /> Windows · скоро</span>
              )}
              {rel?.android ? (
                <a href={rel.android.url} className="sl-btn sl-btn-ghost"><Smartphone size={18} /> Android</a>
              ) : (
                <span className="sl-btn sl-btn-ghost sl-soon"><Smartphone size={18} /> Android · скоро</span>
              )}
            </div>
            <p className="sl-note">Бесплатно.{note ? ` ${note}` : ""}</p>
          </div>

          <div className="sl-phone" aria-hidden>
            <div className="sl-phone-bar"><span className="sl-ava" /><div><b>MiliGram</b><small>в сети</small></div></div>
            <div className="sl-chat">
              <div className="sl-msg sl-in">Привет! Видел новые подарки? 🎁</div>
              <div className="sl-msg sl-out">Да, уже выбираю</div>
              <div className="sl-msg sl-in sl-typing"><i /><i /><i /></div>
            </div>
            <div className="sl-compose"><span>Сообщение</span><em><ArrowRight size={18} style={{ transform: "rotate(-90deg)" }} /></em></div>
          </div>
        </section>

        <section className="sl-section">
          <h2 className="sl-h2">Что умеет MiliGram</h2>
          <p className="sl-sub">Всё, что нужно для общения, — в одном месте.</p>
          <div className="sl-grid sl-grid-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="sl-card">
                <span className="sl-ico"><f.icon size={18} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="sl-section" id="platforms">
          <h2 className="sl-h2">MiliGram везде, где вы</h2>
          <p className="sl-sub">Одна учётная запись и общая история сообщений на всех устройствах.</p>
          <div className="sl-grid sl-grid-3">
            <Link href={APP_PATH} className="sl-card sl-card-link">
              <span className="sl-ico"><Globe size={18} /></span>
              <h3>В браузере</h3>
              <p>Ничего не нужно устанавливать. Работает на любом компьютере и телефоне.</p>
              <span className="sl-link">Открыть <ArrowRight size={14} /></span>
            </Link>
            {rel?.windows ? (
              <a href={rel.windows.url} className="sl-card sl-card-link">
                <span className="sl-ico"><Monitor size={18} /></span>
                <h3>Для Windows</h3>
                <p>Отдельное окно, уведомления в трее. Обновляется само.</p>
                <span className="sl-link">Скачать установщик <Download size={14} /></span>
              </a>
            ) : (
              <div className="sl-card sl-soon"><span className="sl-ico"><Monitor size={18} /></span><h3>Для Windows</h3><p>Отдельное окно, уведомления в трее. Скоро.</p></div>
            )}
            {rel?.android ? (
              <a href={rel.android.url} className="sl-card sl-card-link">
                <span className="sl-ico"><Smartphone size={18} /></span>
                <h3>Для Android</h3>
                <p>Приложение с уведомлениями. Ставится файлом — это нормально.</p>
                <span className="sl-link">Скачать APK <Download size={14} /></span>
              </a>
            ) : (
              <div className="sl-card sl-soon"><span className="sl-ico"><Smartphone size={18} /></span><h3>Для Android</h3><p>Приложение с уведомлениями. Скоро.</p></div>
            )}
          </div>
          <p className="sl-note" style={{ textAlign: "center", marginTop: 14 }}><Apple size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> На iPhone и Mac: открой MiliGram в браузере и выбери «На экран «Домой»».</p>
        </section>

        <section className="sl-section sl-faq">
          <h2 className="sl-h2">Вопросы</h2>
          <div className="sl-faq-list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}<Plus size={16} className="sl-plus" /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="sl-section">
          <div className="sl-final">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/miligram/icon-512.png" alt="" width={56} height={56} />
            <h2 className="sl-h2">Заходи в MiliGram</h2>
            <p className="sl-sub">Открой в браузере за секунду — ничего ставить не нужно.</p>
            <Link href={APP_PATH} className="sl-btn sl-btn-blue"><Sparkles size={17} /> Открыть в браузере</Link>
          </div>
        </section>
      </main>

      <footer className="sl-foot">
        <div><Link href="/terms">Пользовательское соглашение</Link><Link href="/privacy">Политика конфиденциальности</Link><Link href="/support">Поддержка</Link></div>
        <span>© 2026 MiliGram</span>
      </footer>
    </div>
  );
}
