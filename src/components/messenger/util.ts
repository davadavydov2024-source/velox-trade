import { MAccount, MChat, MMsgKind } from "./mtypes";

export const dmChatId = (a: string, b: string) => [a, b].sort().join("_");

export const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🙏"];

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Время в строке списка чатов: сегодня — часы, вчера — "Вчера", неделя — день недели, дальше — дата. */
export function formatListTime(ts: number, now = Date.now()): string {
  if (!ts) return "";
  if (sameDay(ts, now)) return formatTime(ts);
  if (sameDay(ts, now - 86_400_000)) return "Вчера";
  if (now - ts < 6 * 86_400_000) return new Date(ts).toLocaleDateString("ru-RU", { weekday: "short" });
  return new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function dayLabel(ts: number, now = Date.now()): string {
  if (sameDay(ts, now)) return "Сегодня";
  if (sameDay(ts, now - 86_400_000)) return "Вчера";
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString("ru-RU", sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function isOnline(acc: MAccount | null | undefined, now = Date.now()): boolean {
  return !!acc && acc.showLastSeen !== false && !!acc.lastSeenAt && now - acc.lastSeenAt < 2 * 60_000;
}

export function lastSeenText(acc: MAccount | null | undefined, now = Date.now()): string {
  if (!acc) return "";
  if (isOnline(acc, now)) return "в сети";
  if (acc.showLastSeen === false || !acc.lastSeenAt) return "был(а) недавно";
  const diff = now - acc.lastSeenAt;
  if (diff < 60 * 60_000) return `был(а) ${Math.max(1, Math.round(diff / 60_000))} мин. назад`;
  if (sameDay(acc.lastSeenAt, now)) return `был(а) сегодня в ${formatTime(acc.lastSeenAt)}`;
  if (sameDay(acc.lastSeenAt, now - 86_400_000)) return `был(а) вчера в ${formatTime(acc.lastSeenAt)}`;
  return `был(а) ${new Date(acc.lastSeenAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
}

export function kindLabel(kind: MMsgKind): string {
  switch (kind) {
    case "image":
      return "Фото";
    case "voice":
      return "Голосовое сообщение";
    case "videoNote":
      return "Видеосообщение";
    case "file":
      return "Файл";
    default:
      return "";
  }
}

export function previewText(kind: MMsgKind, text?: string): string {
  if (kind === "text" || kind === "system") return text ?? "";
  const label = kind === "image" && isVideoUrl(text) ? "Видео" : kindLabel(kind);
  return kind === "image" && text ? `${label}, ${text}` : label;
}

export function isVideoUrl(url?: string): boolean {
  return !!url && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
}

export function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** uid собеседника в личном чате (для «Избранного» — сам пользователь). */
export function peerUid(chat: MChat, me: string): string {
  return chat.members.find((m) => m !== me) ?? me;
}

export function isSavedMessages(chat: MChat, me: string): boolean {
  return chat.type === "dm" && chat.members.every((m) => m === me);
}

export function chatTitle(chat: MChat, me: string, accounts: Record<string, MAccount | null | undefined>): string {
  if (chat.type !== "dm") return chat.title || (chat.type === "channel" ? "Канал" : "Группа");
  if (isSavedMessages(chat, me)) return "Избранное";
  return accounts[peerUid(chat, me)]?.displayName ?? "Пользователь";
}

export function chatPhoto(chat: MChat, me: string, accounts: Record<string, MAccount | null | undefined>): string | null {
  if (chat.type !== "dm") return chat.photoURL ?? null;
  if (isSavedMessages(chat, me)) return null;
  return accounts[peerUid(chat, me)]?.photoURL ?? null;
}

export function isChatMuted(muted?: boolean, mutedUntil?: number, now = Date.now()): boolean {
  if (!muted) return false;
  return !mutedUntil || mutedUntil > now;
}

/** Палитра для заглушек-аватарок: цвет считается из uid, чтобы был стабильным. */
const GRADIENTS = [
  ["#ff9a5a", "#e8541e"],
  ["#6ec1ff", "#3578e5"],
  ["#7be0a3", "#27a368"],
  ["#d99bff", "#8e4bd8"],
  ["#ffd36b", "#e09b1a"],
  ["#ff8aa8", "#d9406a"],
  ["#7fe3df", "#1fa2a0"],
];
export function gradientFor(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length] as [string, string];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

/** Подбор формата записи, который поддерживает браузер (iOS Safari — mp4/aac, остальные — webm/opus). */
export function pickRecorderMime(kind: "audio" | "video"): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const list =
    kind === "audio"
      ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      : ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return list.find((m) => MediaRecorder.isTypeSupported(m));
}

export function extFromMime(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return "bin";
}

export const EMOJI_GROUPS: { label: string; icon: string; items: string[] }[] = [
  {
    label: "Смайлы",
    icon: "😀",
    items: "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕".split(" "),
  },
  {
    label: "Жесты",
    icon: "👍",
    items: "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 🤝 🙏 ✍️ 💪 🦾 🙌 👏 🫶 🤲 👐 🫰 🫵 🫡".split(" "),
  },
  {
    label: "Сердца",
    icon: "❤️",
    items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 💟 ❣️ 💯 🔥 ✨ ⭐ 🌟 💫 ⚡ 💥 🎉 🎊 🏆 🥇".split(" "),
  },
  {
    label: "Животные",
    icon: "🐶",
    items: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦉 🦄 🐝 🦋 🐢 🐍 🐙 🐬 🐳 🦈".split(" "),
  },
  {
    label: "Еда",
    icon: "🍕",
    items: "🍎 🍌 🍉 🍓 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🥪 🌮 🍣 🍜 🍩 🍪 🎂 🍫 🍿 ☕ 🍺 🍷 🥂".split(" "),
  },
  {
    label: "Разное",
    icon: "🎮",
    items: "🎮 🎧 🎵 🎬 📷 📱 💻 ⌚ 💡 💰 💳 🎁 🔑 🔒 📦 🚀 ✈️ 🚗 🏠 ⚽ 🏀 🎲 🧩 ✅ ❌ ⚠️ ❓ ❗ 💬 👀 🤖 👻".split(" "),
  },
];
