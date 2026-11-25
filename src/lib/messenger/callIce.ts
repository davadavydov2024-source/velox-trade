import { createHmac } from "crypto";

/**
 * ICE-серверы для звонков. Задаются переменными окружения на Vercel (всё необязательно):
 *  MESSENGER_STUN_URLS   — через запятую, по умолчанию Google и Cloudflare;
 *  MESSENGER_TURN_URLS   — через запятую, напр. "turn:turn.site.ru:3478?transport=udp,turns:turn.site.ru:443?transport=tcp";
 *  MESSENGER_TURN_SECRET — общий секрет coturn (static-auth-secret): выдаём временные логин/пароль на 6 часов;
 *  либо MESSENGER_TURN_USER + MESSENGER_TURN_PASS — постоянные логин/пароль.
 * Без TURN звонок работает только там, где устройства могут соединиться напрямую (домашний Wi-Fi, часть мобильных сетей).
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const list = (v: string | undefined, fallback: string[] = []) => {
  const a = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return a.length ? a : fallback;
};

export function buildIceServers(uid: string): { iceServers: IceServer[]; hasTurn: boolean } {
  const iceServers: IceServer[] = [{ urls: list(process.env.MESSENGER_STUN_URLS, ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"]) }];
  const turn = list(process.env.MESSENGER_TURN_URLS);
  if (turn.length) {
    const secret = process.env.MESSENGER_TURN_SECRET;
    if (secret) {
      const username = `${Math.floor(Date.now() / 1000) + 6 * 3600}:${uid}`;
      iceServers.push({ urls: turn, username, credential: createHmac("sha1", secret).update(username).digest("base64") });
    } else if (process.env.MESSENGER_TURN_USER && process.env.MESSENGER_TURN_PASS) {
      iceServers.push({ urls: turn, username: process.env.MESSENGER_TURN_USER, credential: process.env.MESSENGER_TURN_PASS });
    }
  }
  return { iceServers, hasTurn: iceServers.length > 1 };
}
