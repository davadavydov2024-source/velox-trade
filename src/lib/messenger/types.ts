/** Типы мессенджера — единственный источник правды для бэкенда (сессия A) и интерфейса (сессия B). */

export type ChatType = "dm" | "group" | "channel";
export type MessageKind = "text" | "image" | "voice" | "videoNote" | "file" | "sticker" | "poll" | "system" | "gift";

export interface MessengerAccount {
  uid: string;
  handle: string; // lowercase, 4–24 символа: a-z, 0-9, _
  displayName: string;
  photoURL: string | null;
  bio: string;
  birthday?: string | null;
  createdAt: number;
  lastSeenAt: number;
  showLastSeen: boolean;
  banned: boolean;
  verified?: boolean;
  bannerURL?: string | null; // баннер профиля (обложка)
  status?: { kind: "emoji"; emoji: string } | { kind: "nft"; giftId: string; giftDocId: string; nft: import("./gifts").GiftNft } | null; // статус рядом с ником (Premium)
  channelHandle?: string | null; // @адрес личного канала (показывается карточкой «Канал» в профиле)
  plusUntil?: number; // «Премиум Плюс» активен, пока plusUntil > Date.now()
  frame?: { id: string; color: string } | null; // надетая рамка аватарки
  numId?: number; // числовой ID аккаунта (с 100000)
  views?: number; // сколько раз смотрели профиль
  profileTrack?: string | null; // трек из «Музыки» как мелодия профиля
  number?: string | null; // красивый номер «+888 …» в профиле (8 цифр после +888); владельца проверяет сервер
  messagePrice?: number; // ⭐ за одно входящее сообщение (только Плюс; 0/нет — бесплатно)
  premiumUntil?: number; // Mili Premium активен, пока premiumUntil > Date.now()
  privacy?: { whoCanMessage: "everyone" | "nobody"; whoCanAddToGroups: "everyone" | "nobody" };
}

export interface MessengerChat {
  id: string;
  type: ChatType;
  members: string[];
  admins: string[];
  title?: string;
  photoURL?: string | null;
  description?: string;
  createdBy: string;
  lastMessage?: { text: string; kind: MessageKind; from: string; at: number };
  updatedAt: number;
  readBy: Record<string, number>;
  pinnedMessageIds: string[];
  handle?: string; // публичный @канал (поиск, вступление по ссылке /m?join=@handle)
  inviteCode?: string; // пригласительная ссылка /m?join=<код>
  permissions?: Partial<ChatPermissions>; // права участников по умолчанию (группа)
  slowModeSec?: number; // медленный режим: 0, 10, 30, 60, 300, 900, 3600
  noForwards?: boolean; // «защищённый контент»: пересылка и копирование запрещены
  autoDeleteSec?: number; // автоудаление сообщений: 0, 86400, 604800, 2678400
  joinByRequest?: boolean; // вступление по ссылке только с одобрения админа
  adminRights?: Record<string, AdminRights>;
  adminTitles?: Record<string, string>; // подпись админа («Модератор»)
  restricted?: Record<string, MemberRestriction>;
  banned?: string[];
  freeFor?: string[]; // кому можно писать бесплатно (владелец платных сообщений сам ответил им)
  service?: boolean; // служебный чат «MiliGram Push»: только читать, отвечать нельзя
}

export interface MessengerMessage {
  id: string;
  from: string; // ставит сервер по токену, клиенту доверять нельзя
  kind: MessageKind;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  duration?: number;
  waveform?: number[];
  width?: number;
  height?: number;
  replyTo?: { msgId: string; from: string; preview: string; thumb?: string };
  forwardedFrom?: { name: string; uid?: string };
  reactions: Record<string, string[]>; // эмодзи -> uid поставивших
  createdAt: number;
  editedAt?: number;
  deletedForAll?: boolean;
  views?: number; // просмотры поста в канале
  sticker?: { pack: string; index: number; emoji?: string; preview?: string };
  gift?: { giftId: string; giftDocId: string; price: number; to: string; anonymous?: boolean; nft?: import("./gifts").GiftNft }; // kind: "gift", подпись — в text
  poll?: MessengerPoll;
  mentions?: string[]; // uid упомянутых через @handle
  expireAt?: number; // автоудаление: после этого времени сообщение скрыть
  kb?: string[]; // быстрые ответы бота (кнопки под последним сообщением)
  hiddenFor?: string[]; // «удалить у себя»: этим пользователям сообщение не показывать
}

/** Личные настройки чата: messengerUserChats/{uid}/chats/{chatId} */
export interface MessengerUserChat {
  unread: number;
  pinned?: boolean;
  pinnedAt?: number;
  archived?: boolean;
  muted?: boolean;
  mutedUntil?: number;
  folderIds?: string[];
  mentions?: number; // непрочитанные упоминания (значок @)
  markedUnread?: boolean; // «отметить непрочитанным»
  clearedAt?: number; // «очистить историю у себя»: сообщения старше не показывать
  hiddenAt?: number; // чат удалён у себя: скрыт, пока нет новых сообщений
}

export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👎", "🎉"] as const;
export const MAX_MESSAGE_TEXT = 4000;

export interface MessengerFolder {
  id: string;
  name: string;
  emoji?: string;
  order: number;
  includeTypes: ("dm" | "group" | "channel" | "unread")[];
  chatIds?: string[];
}

export interface MessengerStory {
  id: string;
  uid: string;
  kind: "image" | "video";
  mediaUrl: string;
  caption?: string;
  createdAt: number;
  expiresAt: number; // +24 часа
  viewers: string[];
}

export interface MessengerReport {
  id: string;
  reporterUid: string;
  chatId: string;
  msgId: string;
  from: string;
  kind: MessageKind;
  textSnapshot?: string;
  reason: string;
  createdAt: number;
  status: "open" | "resolved";
}

export type StickerKind = "image" | "video" | "lottie";
/** Один стикер набора. image — картинка (в т.ч. GIF/анимированный WEBP), video — .webm, lottie — .json (из .tgs Telegram). preview — статичная картинка-заглушка. */
export interface MessengerSticker { url: string; emoji: string; kind?: StickerKind; preview?: string }

export interface MessengerStickerPack {
  slug: string; // ссылка: /m?stickers=<slug>
  title: string;
  premium: boolean; // добавить и отправлять могут только с Mili Premium
  published: boolean;
  stickers: MessengerSticker[];
  createdBy?: string; // кто привёз набор
  unlisted?: boolean; // набор привёз обычный пользователь: доступен по ссылке, но не показывается в общем каталоге
  tgName?: string; // имя набора в Telegram (t.me/addstickers/<tgName>), если импортирован
  createdAt: number;
  updatedAt: number;
}

export interface AdminRights {
  changeInfo?: boolean; deleteMessages?: boolean; banUsers?: boolean; inviteUsers?: boolean;
  pinMessages?: boolean; addAdmins?: boolean; postMessages?: boolean; editMessages?: boolean;
}
export const ADMIN_RIGHT_KEYS = ["changeInfo", "deleteMessages", "banUsers", "inviteUsers", "pinMessages", "addAdmins", "postMessages", "editMessages"] as const;

export interface ChatPermissions {
  sendMessages: boolean; sendMedia: boolean; sendStickers: boolean; sendPolls: boolean;
  addMembers: boolean; pinMessages: boolean; changeInfo: boolean;
}
export const DEFAULT_PERMISSIONS: ChatPermissions = { sendMessages: true, sendMedia: true, sendStickers: true, sendPolls: true, addMembers: true, pinMessages: false, changeInfo: false };
export const PERMISSION_KEYS = Object.keys(DEFAULT_PERMISSIONS) as (keyof ChatPermissions)[];

/** Ограничение участника: false = запрещено до until. */
export interface MemberRestriction { until: number; sendMessages?: boolean; sendMedia?: boolean; sendStickers?: boolean; sendPolls?: boolean }

export interface MessengerPoll {
  question: string;
  options: { text: string; count: number }[]; // голоса — только счётчики; свой выбор — messages/{id}/votes/{uid}
  multiple: boolean;
  anonymous: boolean;
  quiz: boolean; // правильный ответ хранится на сервере и отдаётся после голосования
  closed: boolean;
  total: number; // сколько человек проголосовало
}
