"use client";

import { Trash2, UserMinus, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { MenuList, Sheet } from "./ui";
import { deleteChatForAll, leaveChatRequest, tryClearHistory } from "./chatActions";
import { useAccounts } from "./hooks";
import { chatTitle } from "./util";
import type { MChat } from "./mtypes";

/**
 * «Удалить чат?» — как в Telegram:
 *  • личный чат: «Удалить у меня» или «Удалить у меня и у собеседника»;
 *  • группа/канал: участник — «Покинуть», владелец — ещё и «Удалить для всех».
 */
export function DeleteChatSheet({
  chat,
  me,
  onClose,
  onHide,
}: {
  chat: MChat | null;
  me: string;
  onClose: () => void;
  /** локально убрать чат из списка (и закрыть окно чата) */
  onHide: (chatId: string) => void;
}) {
  const { toast } = useToast();
  const accounts = useAccounts(chat?.members ?? []);
  if (!chat) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const title = chatTitle(chat, me, accounts);
  const isOwner = chat.createdBy === me;
  const saved = chat.type === "dm" && chat.members.every((m) => m === me);

  const forMe = async () => {
    onClose();
    tryClearHistory(chat.id);
    onHide(chat.id);
    toast("success", "Чат удалён у вас");
  };

  const leave = async () => {
    onClose();
    const r = await leaveChatRequest(chat.id, me);
    if (r.ok) {
      onHide(chat.id);
      toast("success", chat.type === "channel" ? "Вы отписались" : "Вы вышли из группы");
    } else toast("error", r.message ?? "Не удалось выйти");
  };

  const forAll = async () => {
    const ask = chat.type === "dm" ? "Удалить чат у вас и у собеседника? Сообщения исчезнут у обоих." : "Удалить для всех участников? Это нельзя отменить.";
    if (!confirm(ask)) return;
    onClose();
    const r = await deleteChatForAll(chat.id);
    if (r.ok) {
      onHide(chat.id);
      toast("success", "Чат удалён у всех");
    } else toast("error", r.message ?? "Не удалось удалить");
  };

  const items =
    chat.type === "dm"
      ? [
          { label: "Удалить у меня", icon: <Trash2 size={20} />, danger: true, onPress: forMe },
          { label: "Удалить у меня и у собеседника", icon: <Trash2 size={20} />, danger: true, hidden: saved, onPress: forAll },
        ]
      : [
          { label: chat.type === "channel" ? "Отписаться и удалить" : "Покинуть группу и удалить", icon: <UserMinus size={20} />, danger: true, onPress: leave },
          { label: chat.type === "channel" ? "Удалить канал для всех" : "Удалить группу для всех", icon: <Trash2 size={20} />, danger: true, hidden: !isOwner, onPress: forAll },
        ];

  return (
    <Sheet open onClose={onClose} title={`Удалить «${title}»?`}>
      <MenuList onDone={() => {}} items={[...items, { label: "Отмена", icon: <X size={20} />, onPress: onClose }]} />
    </Sheet>
  );
}
