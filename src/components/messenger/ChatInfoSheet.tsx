"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, BadgeCheck, Bookmark, Calendar, ChevronRight, Copy, Crown, Eye, FileText, Gem, Gift, Hash, Link2, LogOut, MessageCircle, Pencil, Search, Settings, Shield, Sparkles, Star, Users, X, Camera, Filter, Music2, Play, Send, AtSign } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { Avatar, Sheet, Spinner, VerifiedBadge } from "./ui";
import { StatusBadge } from "./StatusBadge";
import { BadgeDot, InfoLine, InfoRow, LinkChip, ProfileHeader, ProfileRoundBtn, ProfileShell, ProfileTabs, ProfileTile, fmtCount, profileBadges, useProfileGifts } from "./ProfileHeader";
import { PostsTab } from "./Posts";
import { ProfileMusic } from "./ProfileMusic";
import { NumberTierChip } from "./Numbers";
import { formatNumber, numberTier } from "@/lib/messenger/numbers";
import { GiftShopSheet, GiftsProfileTab } from "./Gifts";
import { ChannelSettingsSheet, ContactEditSheet, PeopleListSheet } from "./ChannelAdmin";
import { MAccount, MChat, MMessage } from "./mtypes";
import { birthdayText, chatPhoto, chatTitle, formatTime, isSavedMessages, isVideoUrl, lastSeenText, peerUid, plural } from "./util";

/** Ссылка на профиль в соцсети по типу и имени (названия сайтов используются только как адреса ссылок). */
function socialUrl(kind: string, v: string): string {
  const map: Record<string, string> = { telegram: `https://t.me/${v}`, tiktok: `https://www.tiktok.com/@${v}`, soundcloud: `https://soundcloud.com/${v}`, instagram: `https://www.instagram.com/${v}`, youtube: `https://www.youtube.com/@${v}`, x: `https://x.com/${v}`, vk: `https://vk.com/${v}` };
  return map[kind] ?? `https://${v}`;
}

type Tab = "stories" | "gifts" | "posts" | "media" | "files" | "links" | "polls";
const TAB_LABEL: Record<Tab, string> = { stories: "Истории", gifts: "Подарки", posts: "Посты", media: "Медиа", files: "Файлы", links: "Ссылки", polls: "Опросы" };
const URL_RE = /https?:\/\/[^\s<]+[^\s<.,;:!?)"']/g;

function Tile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex-1 min-w-0 flex flex-col items-center gap-1 rounded-2xl py-2.5 active:scale-95 transition-transform" style={{ background: "var(--mx-surface2)", color: "var(--mx-muted)" }}>
      {icon}
      <span className="text-[12.5px] truncate max-w-full px-1">{label}</span>
    </button>
  );
}

function Row({ icon, color, label, value, onClick }: { icon: ReactNode; color: string; label: string; value?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="mx-icon-box" style={{ background: color }}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {value && <span className="mx-muted">{value}</span>}
      {onClick && <ChevronRight size={18} className="mx-muted" />}
    </>
  );
  return onClick ? <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5">{inner}</button> : <div className="w-full flex items-center gap-3 px-4 py-2.5">{inner}</div>;
}

/** Карточка канала в профиле: название, последний пост или «Закрытый канал», число подписчиков и кнопка по ситуации — Открыть / Подписаться / Подать заявку. */
function ProfileChannelCard({ chatId, handle }: { chatId?: string | null; handle?: string | null }) {
  const { toast } = useToast();
  const [c, setC] = useState<{ chatId: string; title: string; photoURL: string | null; description: string; subscribers: number; handle: string | null; isPrivate: boolean; mode: "member" | "join" | "request" | "requested"; lastText: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    const q = chatId ? `chatId=${encodeURIComponent(chatId)}` : `handle=${encodeURIComponent(handle ?? "")}`;
    mApi<NonNullable<typeof c>>(`profile-channel?${q}`).then(setC).catch(() => setC(null));
  }, [chatId, handle]);
  useEffect(() => { load(); }, [load]);
  if (!c) return null;
  const act = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await mApi<{ requested?: boolean; joined?: boolean; already?: boolean }>("profile-channel", { chatId: c.chatId });
      toast("success", r.requested ? (r.already ? "Заявка уже отправлена" : "Заявка отправлена админам канала") : "Вы подписались");
      load();
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не получилось"); } finally { setBusy(false); }
  };
  const sub = c.isPrivate ? "Закрытый канал" : c.lastText || "Пока нет публикаций";
  return (
    <div className="px-4 mb-3">
      <div className="flex items-center gap-3 px-3 py-2.5" style={{ borderRadius: 24, background: "rgba(0,0,0,0.38)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <Avatar src={c.photoURL} name={c.title} seed={c.chatId} size={46} />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold truncate text-[16px]">{c.title}</p>
          <p className="mx-muted text-[13.5px] truncate">{sub}</p>
        </div>
        <span className="shrink-0 px-3 py-1 rounded-full text-[12px] font-bold" style={{ background: "rgba(255,255,255,0.14)" }}>{c.subscribers} {plural(c.subscribers, "подписчик", "подписчика", "подписчиков")}</span>
      </div>
      <div className="mt-2">
        {c.mode === "member" ? (
          <a href={`/m?chat=${c.chatId}`} className="block text-center h-10 leading-10 rounded-full font-extrabold text-[14.5px]" style={{ background: "rgba(255,255,255,0.12)" }}>Открыть канал</a>
        ) : c.mode === "requested" ? (
          <div className="text-center h-10 leading-10 rounded-full font-extrabold text-[14.5px] mx-muted" style={{ background: "rgba(255,255,255,0.08)" }}>Заявка отправлена</div>
        ) : (
          <button onClick={act} disabled={busy} className="w-full h-10 rounded-full font-extrabold text-[14.5px] disabled:opacity-60" style={{ background: "#fff", color: "#111" }}>{busy ? "…" : c.mode === "request" ? "Подать заявку" : "Подписаться"}</button>
        )}
      </div>
    </div>
  );
}

type StoryThumb = { id: string; kind: "image" | "video"; mediaUrl: string; createdAt: number };

export function ChatInfoSheet({
  open, onClose, chat, me, accounts, peer, isAdmin, onLeave, messages = [], muted = false, onToggleMute, onSearch,
}: {
  open: boolean; onClose: () => void; chat: MChat; me: string; accounts: Record<string, MAccount | null | undefined>; peer: MAccount | null; isAdmin: boolean; onLeave: () => void;
  messages?: MMessage[]; muted?: boolean; onToggleMute?: () => void; onSearch?: () => void;
}) {
  const { toast } = useToast();
  const isDm = chat.type === "dm";
  const saved = isSavedMessages(chat, me);
  const baseTitle = chatTitle(chat, me, accounts);
  const photo = chatPhoto(chat, me, accounts);
  const peerId = isDm ? peerUid(chat, me) : "";
  const [giftFilter, setGiftFilter] = useState(false);
  const profileGifts = useProfileGifts(isDm && !saved ? peerId : null);
  const orbit = profileGifts?.filter((g) => g.pinned && !g.hidden) ?? [];
  const nftCount = profileGifts?.filter((g) => g.nft).length ?? 0;
  const badgeList = isDm && !saved ? profileBadges(peer, nftCount, !!peer?.number && numberTier(peer.number) !== "common") : [];
  const BADGE_ICON = { check: <BadgeCheck size={17} />, star: <Star size={16} fill="currentColor" />, crown: <Crown size={16} />, spark: <Sparkles size={16} />, hash: <Hash size={16} />, gem: <Gem size={16} /> };
  // «посмотрел профиль» — счётчик просмотров (свои и частые повторы сервер не считает)
  useEffect(() => { if (open && isDm && !saved && peerId) mApi("profile-view", { uid: peerId }).catch(() => {}); }, [open, isDm, saved, peerId]);

  const tabs: Tab[] = isDm ? (saved ? ["media", "files", "links"] : ["gifts", "posts", "stories", "media", "files", "links"]) : ["media", "files", "links", "polls"];
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const [shop, setShop] = useState(false);
  const [edit, setEdit] = useState(false);
  const [settings, setSettings] = useState(false);
  const [list, setList] = useState<"admins" | "members" | "banned" | null>(null);
  const [contact, setContact] = useState<{ firstName: string; lastName: string; note: string } | null>(null);
  const [stories, setStories] = useState<StoryThumb[] | null>(null);

  useEffect(() => { if (open) setTab(tabs[0]); }, [open, chat.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !isDm || saved) return;
    mApi<typeof contact>(`contact?uid=${encodeURIComponent(peerId)}`).then(setContact).catch(() => {});
    mApi<{ stories: StoryThumb[] }>(`stories?uid=${encodeURIComponent(peerId)}`).then((d) => setStories(d.stories ?? [])).catch(() => setStories([]));
  }, [open, isDm, saved, peerId]);

  const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "";
  const title = isDm && contactName ? contactName : baseTitle;
  const live = messages.filter((m) => !m.deletedForAll);
  const media = useMemo(() => live.flatMap((m) => (m.kind === "image" ? (m.mediaUrls?.length ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : []) : [])).reverse(), [messages]); // eslint-disable-line react-hooks/exhaustive-deps
  const files = useMemo(() => live.filter((m) => m.kind === "file" && m.mediaUrl).reverse(), [messages]); // eslint-disable-line react-hooks/exhaustive-deps
  const links = useMemo(() => live.flatMap((m) => ((m.text ?? "").match(URL_RE) ?? []).map((u) => ({ url: u, at: m.createdAt }))).reverse(), [messages]); // eslint-disable-line react-hooks/exhaustive-deps
  const polls = useMemo(() => live.filter((m) => m.kind === "poll").reverse(), [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const adminCount = Array.from(new Set([chat.createdBy, ...(chat.admins ?? [])])).length;
  const link = !isDm && chat.handle ? `${typeof location !== "undefined" ? location.origin : ""}/m?join=@${chat.handle}` : "";
  const copy = (text: string, ok: string) => navigator.clipboard?.writeText(text).then(() => toast("success", ok)).catch(() => {});
  const bday = birthdayText(peer?.birthday);
  const SOCIAL_ICON: Record<string, React.ReactNode> = { telegram: <Send size={15} />, tiktok: <Music2 size={15} />, soundcloud: <Music2 size={15} />, instagram: <Camera size={15} />, youtube: <Play size={15} />, x: <AtSign size={15} />, vk: <Link2 size={15} /> };
  const bioLinks = Array.from(new Set((peer?.bio?.match(URL_RE) ?? []).slice(0, 3)));
  const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  const empty = (t: string) => <p className="mx-muted text-center text-[14px] py-8 px-6">{t}</p>;

  return (
    <Sheet open={open} onClose={() => { onClose(); }} full>
      <ProfileShell>
      <ProfileHeader
        seed={isDm ? peerId : chat.id}
        name={title}
        photo={photo}
        account={isDm ? peer : null}
        avatarFallback={saved ? <Bookmark size={44} /> : undefined}
        badges={<>{isDm && peer?.verified && <VerifiedBadge size={18} />}{isDm && <StatusBadge acc={peer} size={20} />}</>}
        orbit={orbit}
        statusPill={isDm && !saved ? lastSeenText(peer) : undefined}
        subtitle={isDm ? undefined : `${chat.members.length} ${chat.type === "channel" ? plural(chat.members.length, "подписчик", "подписчика", "подписчиков") : plural(chat.members.length, "участник", "участника", "участников")}`}
        topRight={<>{isDm && !saved && <ProfileRoundBtn icon={<Shield size={17} />} label="Заблокировать" onClick={async () => { if (!peer?.handle || !confirm(`Заблокировать @${peer.handle}? Вы не сможете писать друг другу.`)) return; try { await mApi("block", { handle: peer.handle, blocked: true }); toast("success", "Пользователь заблокирован"); } catch { toast("error", "Не удалось заблокировать"); } }} />}{((isDm && !saved) || (!isDm && isAdmin)) && <ProfileRoundBtn icon={<Pencil size={17} />} label="Изменить" onClick={() => (isDm ? setEdit(true) : setSettings(true))} />}<ProfileRoundBtn icon={<X size={19} />} label="Закрыть" onClick={onClose} /></>}
      />

      <div className="flex gap-2 px-4 py-3">
        {isDm && !saved && <ProfileTile icon={<MessageCircle size={22} />} label="Чат" onClick={onClose} />}
        {isDm && !saved && <ProfileTile icon={<Gift size={22} />} label="Подарок" onClick={() => setShop(true)} />}
        <ProfileTile icon={muted ? <BellOff size={22} /> : <Bell size={22} />} label={muted ? "Включить" : "Звук"} onClick={() => { onToggleMute?.(); onClose(); }} />
        <ProfileTile icon={<Search size={22} />} label="Поиск" onClick={() => { onClose(); onSearch?.(); }} />
        {!isDm && <ProfileTile icon={<LogOut size={22} />} label={chat.type === "channel" ? "Отписаться" : "Выйти"} onClick={() => { onClose(); onLeave(); }} />}
      </div>

      {isDm && !saved && peer?.profileTrack && <ProfileMusic trackId={peer.profileTrack} />}
      {isDm && (peer?.profileChannel || peer?.channelHandle) && <ProfileChannelCard chatId={peer?.profileChannel} handle={peer?.channelHandle} />}

      {((isDm && !saved && peer) || peer?.number || peer?.handle || peer?.bio || chat.description || bday || link || contact?.note) && (
        <div className="pb-2">
          {peer?.number && <InfoRow value={formatNumber(peer.number)} label="Анонимный номер" onClick={() => copy(formatNumber(peer.number as string), "Номер скопирован")} right={<NumberTierChip digits={peer.number} />} />}
          {peer?.handle && <InfoRow value={`@${peer.handle}`} label="Имя пользователя" onClick={() => copy(`@${peer.handle}`, "Скопировано")} />}
          {peer?.aliases && peer.aliases.length > 0 && <p className="px-5 -mt-1 pb-1.5 text-[14.5px] mx-muted leading-snug">а также {peer.aliases.map((a) => `@${a}`).join(", ")}</p>}
          {link && <InfoRow value={link} label="Ссылка" accent onClick={() => copy(link, "Ссылка скопирована")} />}
          {peer?.bio && <InfoRow value={peer.bio} label="Описание" />}
          {bday && <InfoRow value={bday} label="День рождения" />}
          {chat.description && <InfoRow value={chat.description} label="Описание" />}
          {contact?.note && <InfoRow value={contact.note} label="Заметка (видите только вы)" />}
          {badgeList.length > 0 && (
            <div className="px-5 py-2">
              <div className="flex gap-2 flex-wrap">
                {badgeList.map((bd) => <BadgeDot key={bd.key} color={bd.color} title={bd.label}>{BADGE_ICON[bd.icon]}</BadgeDot>)}
              </div>
              <span className="block text-[13px] mx-muted mt-1.5">Значки</span>
            </div>
          )}
          {(bioLinks.length > 0 || (peer?.socials?.length ?? 0) > 0) && (
            <div className="px-5 py-1.5 flex flex-wrap gap-2">
              {(peer?.socials ?? []).map((sc) => <LinkChip key={sc.kind + sc.value} href={socialUrl(sc.kind, sc.value)} label={sc.value} icon={SOCIAL_ICON[sc.kind] ?? <Link2 size={15} />} />)}
              {bioLinks.map((u) => <LinkChip key={u} href={u} label={hostOf(u)} icon={<Link2 size={15} />} />)}
            </div>
          )}
          {isDm && !saved && peer?.createdAt ? <InfoLine icon={<Calendar size={15} />}>{`На MiliGram с ${new Date(peer.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })} г.`}</InfoLine> : null}
          {isDm && !saved && peer?.numId ? <InfoRow value={`ID: ${peer.numId}`} label="Идентификатор" /> : null}
          {isDm && !saved && typeof peer?.views === "number" && peer.views > 0 ? <InfoLine icon={<Eye size={16} />}>{fmtCount(peer.views)}</InfoLine> : null}
        </div>
      )}

      {!isDm && (
        <div className="mx-card" style={{ margin: "0 16px 16px" }}>
          <Row icon={<Shield size={17} />} color="#34c759" label="Администраторы" value={String(adminCount)} onClick={() => setList("admins")} />
          <Row icon={<Users size={17} />} color="#3390ec" label={chat.type === "channel" ? "Подписчики" : "Участники"} value={String(chat.members.length)} onClick={chat.type === "channel" && !isAdmin ? undefined : () => setList("members")} />
          {isAdmin && <Row icon={<Users size={17} />} color="#ff453a" label="Чёрный список" value={String(chat.banned?.length ?? 0)} onClick={() => setList("banned")} />}
          {isAdmin && <Row icon={<Settings size={17} />} color="#ff9f0a" label={chat.type === "channel" ? "Настройки канала" : "Настройки группы"} onClick={() => setSettings(true)} />}
        </div>
      )}

      <ProfileTabs tabs={tabs} value={tab} onChange={setTab} labels={TAB_LABEL} right={tab === "gifts" ? <button onClick={() => setGiftFilter((v) => !v)} className="w-12 flex items-center justify-center" style={{ color: giftFilter ? "#fff" : "#8b8b96" }} aria-label="Фильтр подарков"><Filter size={18} /></button> : undefined} />

      <div className="pb-24">
        {tab === "gifts" && isDm && !saved && <GiftsProfileTab uid={peerId} mine={false} name={title} />}
        {tab === "posts" && isDm && !saved && <PostsTab uid={peerId} mine={false} />}
        {tab === "stories" && (stories === null ? <div className="flex justify-center py-8"><Spinner /></div> : stories.length === 0 ? empty("Нет публикаций") : (
          <div className="grid grid-cols-3 gap-1 px-4">
            {stories.map((s) => (
              <a key={s.id} href={s.mediaUrl} target="_blank" rel="noreferrer" className="relative aspect-[3/4] rounded-xl overflow-hidden block" style={{ background: "var(--mx-surface2)" }}>
                {s.kind === "video" ? <video src={s.mediaUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.mediaUrl} alt="" className="w-full h-full object-cover" />}
              </a>
            ))}
          </div>
        ))}
        {tab === "media" && (media.length === 0 ? empty("Здесь появятся фото и видео из чата") : (
          <div className="grid grid-cols-3 gap-1 px-4">
            {media.map((u, i) => (
              <a key={u + i} href={u} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden block" style={{ background: "var(--mx-surface2)" }}>
                {isVideoUrl(u) ? <video src={u} muted playsInline preload="metadata" className="w-full h-full object-cover" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />}
              </a>
            ))}
          </div>
        ))}
        {tab === "files" && (files.length === 0 ? empty("Файлов пока нет") : (
          <div className="mx-card" style={{ margin: "0 16px" }}>
            {files.map((m) => (
              <a key={m.id} href={m.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3"><FileText size={22} className="mx-muted" /><span className="flex-1 truncate">{m.text || "Файл"}</span><span className="mx-muted text-[12.5px]">{formatTime(m.createdAt)}</span></a>
            ))}
          </div>
        ))}
        {tab === "links" && (links.length === 0 ? empty("Ссылок пока нет") : (
          <div className="mx-card" style={{ margin: "0 16px" }}>
            {links.map((l, i) => <a key={l.url + i} href={l.url} target="_blank" rel="noreferrer" className="block px-4 py-3 truncate" style={{ color: "var(--mx-accent)" }}>{l.url}</a>)}
          </div>
        ))}
        {tab === "polls" && (polls.length === 0 ? empty("Опросов пока нет") : (
          <div className="mx-card" style={{ margin: "0 16px" }}>
            {polls.map((m) => <div key={m.id} className="px-4 py-3"><p>{m.poll?.question ?? m.text}</p><p className="mx-muted text-[12.5px]">{m.poll?.total ?? 0} {plural(m.poll?.total ?? 0, "голос", "голоса", "голосов")} · {formatTime(m.createdAt)}</p></div>)}
          </div>
        ))}
      </div>

      {isDm && !saved && <GiftShopSheet open={shop} onClose={() => setShop(false)} toUid={peerId} toName={title} onSent={() => setTab("gifts")} />}
      {isDm && !saved && <ContactEditSheet open={edit} onClose={() => setEdit(false)} uid={peerId} account={peer} onSaved={(c) => setContact(c)} />}
      {!isDm && <PeopleListSheet open={!!list} onClose={() => setList(null)} chat={chat} me={me} mode={list ?? "members"} canManage={isAdmin} />}
      {!isDm && isAdmin && <ChannelSettingsSheet open={settings} onClose={() => setSettings(false)} chat={chat} me={me} onCounts={(k) => setList(k)} />}
      </ProfileShell>
    </Sheet>
  );
}
