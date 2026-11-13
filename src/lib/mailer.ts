import tls from "tls";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Отправка почты. Два способа, работает первый настроенный:
 *
 * 1) Обычная почта по SMTP (проще всего — Gmail, регистрироваться нигде не нужно):
 *      SMTP_USER=твоя_почта@gmail.com
 *      SMTP_PASS=пароль приложения Google (16 букв)
 *      SMTP_FROM_NAME=MiliGram            (необязательно)
 *      SMTP_HOST=smtp.gmail.com           (необязательно, по умолчанию Gmail)
 *      SMTP_PORT=465                      (необязательно; только порт с шифрованием 465)
 *    Пароль приложения: аккаунт Google → Безопасность → включить «Двухэтапную аутентификацию» →
 *    https://myaccount.google.com/apppasswords → создать пароль → скопировать (пробелы убрать).
 *    Лимит Gmail — около 500 писем в сутки.
 *
 * 2) Firebase: MAIL_VIA_FIREBASE=1 — письмо кладётся в коллекцию "mail", а расширение Firebase
 *    "Trigger Email from Firestore" (Extensions → установить, тариф Blaze) отправляет его через SMTP,
 *    который ты укажешь при установке расширения. Без установленного расширения письма не уйдут!
 *
 * 3) SendGrid (как раньше): SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME.
 */
export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  if (/[\r\n<>]/.test(to)) throw new Error("Некорректный адрес получателя");

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpUser && smtpPass) {
    await smtpSend({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 465,
      user: smtpUser,
      pass: smtpPass.replace(/\s+/g, ""),
      fromName: process.env.SMTP_FROM_NAME || "MiliGram",
      to,
      subject,
      html,
    });
    return;
  }

  if (process.env.MAIL_VIA_FIREBASE === "1") {
    await adminDb().collection("mail").add({ to, message: { subject, html }, createdAt: Date.now() });
    return;
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || "MiliGram";
  if (!apiKey || !fromEmail) {
    throw new Error("Почта не настроена — задай SMTP_USER и SMTP_PASS (или MAIL_VIA_FIREBASE=1, или SENDGRID_API_KEY и SENDGRID_FROM_EMAIL) в переменных окружения");
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("SendGrid send error:", res.status, errBody);
    throw new Error("Не удалось отправить письмо через SendGrid");
  }
}

interface SmtpOpts { host: string; port: number; user: string; pass: string; fromName: string; to: string; subject: string; html: string }

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const mimeWord = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

/** Небольшой SMTP-клиент на встроенном tls (порт 465, шифрование сразу): без сторонних пакетов. */
function smtpSend(o: SmtpOpts): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const sock = tls.connect({ host: o.host, port: o.port, servername: o.host });
    let buf = "";
    let waiting: ((r: { code: number; text: string }) => void) | null = null;
    let lines: string[] = [];
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      if (err) reject(err); else resolve();
    };
    sock.setTimeout(20000, () => finish(new Error("SMTP: таймаут соединения")));
    sock.on("error", (e) => finish(new Error(`SMTP: ${e.message}`)));
    sock.on("close", () => finish(new Error("SMTP: соединение закрыто")));
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        lines.push(line);
        if (/^\d{3} /.test(line) && waiting) {
          const w = waiting;
          waiting = null;
          const text = lines.join("\n");
          lines = [];
          w({ code: Number(line.slice(0, 3)), text });
        }
      }
    });
    const read = () => new Promise<{ code: number; text: string }>((res) => { waiting = res; });
    const cmd = async (line: string, expect: number) => {
      const p = read();
      sock.write(`${line}\r\n`);
      const r = await p;
      if (r.code !== expect) throw new Error(`SMTP ${r.code}: ${r.text.replace(/\s+/g, " ").slice(0, 200)}`);
    };

    (async () => {
      const greet = await read();
      if (greet.code !== 220) throw new Error(`SMTP ${greet.code}: ${greet.text.slice(0, 200)}`);
      await cmd("EHLO miligram", 250);
      await cmd("AUTH LOGIN", 334);
      await cmd(b64(o.user), 334);
      await cmd(b64(o.pass), 235);
      await cmd(`MAIL FROM:<${o.user}>`, 250);
      await cmd(`RCPT TO:<${o.to}>`, 250);
      await cmd("DATA", 354);
      const body = (b64(o.html).match(/.{1,76}/g) ?? []).join("\r\n");
      const msg = [
        `From: ${mimeWord(o.fromName)} <${o.user}>`,
        `To: <${o.to}>`,
        `Subject: ${mimeWord(o.subject.replace(/[\r\n]+/g, " "))}`,
        `Date: ${new Date().toUTCString()}`,
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        body,
      ].join("\r\n");
      await cmd(`${msg}\r\n.`, 250);
      sock.write("QUIT\r\n");
      finish();
    })().catch((e) => {
      console.error("SMTP send error:", e?.message || e);
      finish(new Error(String(e?.message || e).startsWith("SMTP") ? "Не удалось отправить письмо по SMTP (проверь SMTP_USER и пароль приложения)" : "Не удалось отправить письмо"));
    });
  });
}
