"use client";

import { UsernameRow } from "./Usernames";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, BadgeCheck, Bookmark, Calendar, ChevronRight, Copy, Crown, Eye, FileText, Gem, Gift, Hash, Link2, LogOut, MessageCircle, Pencil, Search, Settings, Shield, Sparkles, Star, Users, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi } from "./api";
import { Avatar, Sheet, Spinner, TagChip, VerifiedBadge, VerifyMark } from "./ui";
import { markKind, verifyMeta } from "@/lib/messenger/marks";
import { StatusBadge } from "./StatusBadge";
import { BadgeDot, InfoLine, InfoRow, LinkChip, ProfileCard, ProfileHeader, ProfileRoundBtn, ProfileShell, ProfileTabs, ProfileTile, fmtCount, profileBadges, useProfileGifts } from "./ProfileHeader";
import { PostsTab } from "./Posts";
import { ProfileMusic } from "./ProfileMusic";
import { NumberTierChip } from "./Numbers";
import { formatNumber, numberTier } from "@/lib/messenger/numbers";
import { GiftShopSheet, GiftsProfileTab } from "./Gifts";
import { ChannelSettingsSheet, ContactEditSheet, PeopleListSheet } from "./ChannelAdmin";
import { MAccount, MChat, MMessage } from "./mtypes";
import { birthdayText, chatPhoto, chatTitle, formatTime, isSavedMessages, isVideoUrl, lastSeenText, peerUid, plural } from "./util";

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

/** Карточка личного канала в профиле: «КАНАЛ · N подписчиков» + последний пост. */
function ProfileChannelCard({ handle }: { handle: string }) {
  const [c, setC] = useState<{ title: string; photoURL: string | null; subscribers: number; posts: { text: string; createdAt: number; kind: string }[] } | null>(null);
  useEffect(() => { mApi(`channel-preview?handle=${encodeURIComponent(handle)}`).then(setC).catch(() => setC(null)); }, [handle]);
  if (!c) return null;
  const last = c.posts[c.posts.length - 1];
  return (
    <div className="px-4 mb-3">
      <a href={`/m?join=@${handle}`} className="flex items-center gap-3 px-3 py-2.5" style={{ borderRadius: 24, background: "var(--mx-surface)" }}>
        <Avatar src={c.photoURL} name={c.title} seed={handle} size={46} />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold truncate text-[16px]">{c.title}</p>
          <p className="mx-muted text-[13.5px] truncate">{last ? last.text || (last.kind === "image" ? "Фото" : "Публикация") : "Пока нет публикаций"}</p>
        </div>
        <span className="shrink-0 px-3 py-1 rounded-full text-[12px] font-bold" style={{ background: "var(--mx-surface2)" }}>{c.subscribers} {plural(c.subscribers, "подписчик", "подписчика", "подписчиков")}</span>
      </a>
    </div>
  );
}

type StoryThumb = { id: string; kind: "image" | "video"; mediaUrl: string; createdAt: number };

export function ChatInfoSheet({
  open, onClose, chat, me, accounts, peer, isAdmin, onLeave, messages = [], muted = false, onToggleMute, onSearch, preview = false,
}: {
  open: boolean; onClose: () => void; chat: MChat; me: string; accounts: Record<string, MAccount | null | undefined>; peer: MAccount | null; isAdmin: boolean; onLeave: () => void;
  messages?: MMessage[]; muted?: boolean; onToggleMute?: () => void; onSearch?: () => void;
  /** «Как видят другие»: профиль без кнопок редактирования, без счётчика просмотров и личных заметок */
  preview?: boolean;
}) {
  const { toast } = useToast();
  const isDm = chat.type === "dm";
  const saved = isSavedMessages(chat, me);
  const baseTitle = chatTitle(chat, me, accounts);
  const photo = chatPhoto(chat, me, accounts);
  const peerId = isDm ? peerUid(chat, me) : "";
  const profileGifts = useProfileGifts(isDm && !saved ? peerId : null);
  const orbit = profileGifts?.filter((g) => g.pinned && !g.hidden) ?? [];
  const nftCount = profileGifts?.filter((g) => g.nft).length ?? 0;
  const badgeList = isDm && !saved ? profileBadges(peer, nftCount, !!peer?.number && numberTier(peer.number) !== "common") : [];
  const BADGE_ICON = { check: <BadgeCheck size={17} />, star: <Star size={16} fill="currentColor" />, crown: <Crown size={16} />, spark: <Sparkles size={16} />, hash: <Hash size={16} />, gem: <Gem size={16} /> };
  // «посмотрел профиль» — счётчик просмотров (свои и частые повторы сервер не считает)
  useEffect(() => { if (open && isDm && !saved && peerId && !preview) mApi("profile-view", { uid: peerId }).catch(() => {}); }, [open, isDm, saved, peerId]);

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
    if (!open || !isDm || saved || preview) return;
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
        badges={<><VerifyMark acc={isDm ? peer : chat} size={20} /><TagChip acc={isDm ? peer : chat} light />{isDm && <StatusBadge acc={peer} size={20} />}</>}
        orbit={orbit}
        statusPill={isDm && !saved ? lastSeenText(peer) : undefined}
        subtitle={isDm ? undefined : `${chat.members.length} ${chat.type === "channel" ? plural(chat.members.length, "подписчик", "подписчика", "подписчиков") : plural(chat.members.length, "участник", "участника", "участников")}`}
        topRight={<>{!preview && ((isDm && !saved) || (!isDm && isAdmin)) && <ProfileRoundBtn icon={<Pencil size={17} />} label="Изменить" onClick={() => (isDm ? setEdit(true) : setSettings(true))} />}<ProfileRoundBtn icon={<X size={19} />} label="Закрыть" onClick={onClose} /></>}
      />

      <div className="flex gap-2 px-4 py-3">
        {isDm && !saved && <ProfileTile icon={<MessageCircle size={22} />} label="Чат" onClick={onClose} />}
        {isDm && !saved && <ProfileTile icon={<Gift size={22} />} label="Подарок" onClick={() => setShop(true)} />}
        <ProfileTile icon={muted ? <BellOff size={22} /> : <Bell size={22} />} label={muted ? "Включить" : "Звук"} onClick={() => { onToggleMute?.(); onClose(); }} />
        <ProfileTile icon={<Search size={22} />} label="Поиск" onClick={() => { onClose(); onSearch?.(); }} />
        {!isDm && <ProfileTile icon={<LogOut size={22} />} label={chat.type === "channel" ? "Отписаться" : "Выйти"} onClick={() => { onClose(); onLeave(); }} />}
      </div>

      {isDm && !saved && peer?.profileTrack && <ProfileMusic trackId={peer.profileTrack} />}
      {isDm && peer?.channelHandle && <ProfileChannelCard handle={peer.channelHandle} />}

      {((isDm && !saved && peer) || peer?.number || peer?.handle || peer?.bio || chat.description || bday || link || contact?.note) && (
        <ProfileCard title="Информация">
          {peer?.number && <InfoRow icon={<Hash size={19} />} value={formatNumber(peer.number)} label="Номер" onClick={() => copy(formatNumber(peer.number as string), "Номер скопирован")} right={<NumberTierChip digits={peer.number} />} />}
          {peer?.handle && peerId && <UsernameRow uid={peerId} handle={peer.handle} onCopy={(t) => copy(t, "Скопировано")} />}
          {link && <InfoRow icon={<Link2 size={19} />} value={link} label="Ссылка" accent onClick={() => copy(link, "Ссылка скопирована")} />}
          {peer?.bio && <InfoRow icon={<FileText size={19} />} value={peer.bio} label="О себе" />}
          {bday && <InfoRow icon={<Calendar size={19} />} value={bday} label="День рождения" />}
          {chat.description && <InfoRow icon={<FileText size={19} />} value={chat.description} label="Описание" />}
          {contact?.note && <InfoRow icon={<Pencil size={18} />} value={contact.note} label="Заметка (видите только вы)" />}
          {badgeList.length > 0 && (
            <div className="px-5 py-2">
              <div className="flex gap-2 flex-wrap">
                {badgeList.map((bd) => <BadgeDot key={bd.key} color={bd.color} title={bd.label}>{BADGE_ICON[bd.icon]}</BadgeDot>)}
              </div>
              <span className="block text-[13px] mx-muted mt-1.5">Значки</span>
            </div>
          )}
          {bioLinks.length > 0 && (
            <div className="px-5 py-1.5 flex flex-wrap gap-2">
              {bioLinks.map((u) => <LinkChip key={u} href={u} label={hostOf(u)} icon={<Link2 size={15} />} />)}
            </div>
          )}
          {isDm && !saved && peer?.createdAt ? <InfoLine icon={<Calendar size={15} />}>{`На MiliGram с ${new Date(peer.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })} г.`}</InfoLine> : null}
          {isDm && !saved && peer?.numId ? <InfoRow value={`ID: ${peer.numId}`} label="Идентификатор" /> : null}
          {isDm && !saved && typeof peer?.views === "number" && peer.views > 0 ? <InfoLine icon={<Eye size={16} />}>{fmtCount(peer.views)}</InfoLine> : null}
        </ProfileCard>
      )}

      {!isDm && (
        <div className="mx-card" style={{ margin: "0 16px 16px" }}>
          <Row icon={<Shield size={17} />} color="#34c759" label="Администраторы" value={String(adminCount)} onClick={() => setList("admins")} />
          <Row icon={<Users size={17} />} color="#3390ec" label={chat.type === "channel" ? "Подписчики" : "Участники"} value={String(chat.members.length)} onClick={chat.type === "channel" && !isAdmin ? undefined : () => setList("members")} />
          {isAdmin && <Row icon={<Users size={17} />} color="#ff453a" label="Чёрный список" value={String(chat.banned?.length ?? 0)} onClick={() => setList("banned")} />}
          {isAdmin && <Row icon={<Settings size={17} />} color="#ff9f0a" label={chat.type === "channel" ? "Настройки канала" : "Настройки группы"} onClick={() => setSettings(true)} />}
        </div>
      )}

      {(() => {
        const o = isDm ? peer : chat;
        const k = markKind(o);
        if (!k) return null;
        return <p className="px-5 pb-3 text-[13px] mx-muted flex gap-2 items-start"><VerifiedBadge size={16} kind={k} /><span>{o?.verifyText || verifyMeta(k).desc}</span></p>;
      })()}

      <ProfileTabs tabs={tabs} value={tab} onChange={setTab} labels={TAB_LABEL} />

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
