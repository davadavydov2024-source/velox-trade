import asyncio

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import Message

from . import config, db


class Ctx:
    def __init__(self, bot: Bot, msg: Message, conn_id: str, owner_id: int, args: str = ""):
        self.bot = bot
        self.msg = msg
        self.conn_id = conn_id
        self.owner_id = owner_id
        self.args = args

    @property
    def chat_id(self) -> int:
        return self.msg.chat.id

    @property
    def bc(self) -> dict:
        return {"business_connection_id": self.conn_id}

    @property
    def reply(self):
        return self.msg.reply_to_message

    @property
    def sender_id(self) -> int:
        return self.msg.from_user.id if self.msg.from_user else 0

    @property
    def is_admin(self) -> bool:
        return self.owner_id == config.ADMIN_ID

    @property
    def is_staff(self) -> bool:
        """Админ или мини-админ: без лимитов и платных ограничений."""
        return db.is_staff(self.owner_id)

    def limit(self, n: int, cap: int) -> int:
        """Лимит для обычных пользователей; админу и мини-админам — без ограничений."""
        return n if self.is_staff else min(n, cap)

    async def send_safe(self, text: str, **kw):
        """send с ожиданием при флуд-лимите Telegram."""
        from aiogram.exceptions import TelegramRetryAfter
        for _ in range(5):
            try:
                return await self.send(text, **kw)
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after + 0.5)
        return None

    async def send(self, text: str, **kw):
        return await self.bot.send_message(chat_id=self.chat_id, text=text, **self.bc, **kw)

    async def edit(self, text: str, **kw):
        try:
            return await self.bot.edit_message_text(
                text=text, chat_id=self.chat_id, message_id=self.msg.message_id, **self.bc, **kw
            )
        except TelegramBadRequest as e:
            if "not modified" in str(e).lower():
                return None
            raise

    async def delete_msg(self, message_id: int):
        await self.bot.delete_business_messages(business_connection_id=self.conn_id, message_ids=[message_id])

    async def delete_cmd(self):
        try:
            await self.delete_msg(self.msg.message_id)
        except Exception:
            pass

    def text_arg(self) -> str:
        if self.args:
            return self.args
        r = self.reply
        return (r.text or r.caption or "") if r else ""
