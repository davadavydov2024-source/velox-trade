"use client";

import { Check, Lock } from "lucide-react";
import { plural } from "./util";
import { Avatar, Sheet, Spinner } from "./ui";

export type MyChannel = { chatId: string; title: string; photoURL: string | null; handle: string | null; isPrivate: boolean; subscribers: number };

/** Выбор канала для профиля из ВСЕХ своих каналов (публичных и закрытых). null в onPick — убрать канал из профиля. */
export function ChannelPickerSheet({ open, onClose, channels, current, onPick }: { open: boolean; onClose: () => void; channels: MyChannel[] | null; current: string | null; onPick: (c: MyChannel | null) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Канал в профиле" full zIndex={80}>
      <div className="pb-8">
        <p className="mx-muted text-[14px] px-4 pb-3">Выбери канал, который покажется в твоём профиле. У закрытого канала у других людей будет кнопка «Подать заявку», а админам канала придёт уведомление.</p>
        {channels === null ? <div className="flex justify-center py-10"><Spinner /></div> : channels.length === 0 ? (
          <p className="mx-muted text-center px-8 py-10 text-[14.5px]">У тебя пока нет каналов. Создай канал в разделе «Новый чат», и он появится здесь.</p>
        ) : (
          <>
            {current && <button onClick={() => onPick(null)} className="w-full text-left px-4 py-3 text-[16px]" style={{ color: "var(--mx-danger)" }}>Убрать канал из профиля</button>}
            {channels.map((c) => (
              <button key={c.chatId} onClick={() => onPick(c)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/5">
                <Avatar src={c.photoURL} name={c.title} seed={c.chatId} size={46} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold truncate">{c.title}</span>
                  <span className="flex items-center gap-1 text-[13px] mx-muted truncate">{c.isPrivate && <Lock size={12} />}{c.isPrivate ? "Закрытый" : `@${c.handle}`} · {c.subscribers} {plural(c.subscribers, "подписчик", "подписчика", "подписчиков")}</span>
                </span>
                {current === c.chatId && <Check size={20} style={{ color: "var(--mx-accent)" }} />}
              </button>
            ))}
          </>
        )}
      </div>
    </Sheet>
  );
}
