"""Пользовательские команды в личке с ботом: промокоды и реферальная ссылка."""
import asyncio
import html
import logging
import time
from datetime import datetime

from aiogram import Bot, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import Message

from . import config, db, subtools
from .registry import TIERS

router = Router()
_promo_lock = asyncio.Lock()  # чтобы одноразовый код не активировали двое одновременно


@router.message(Command("promo", "activate"))
async def promo(m: Message, command: CommandObject):
    uid = m.from_user.id
    if uid in db.BANNED:
        return await m.answer("⛔ Вы заблокированы администратором.")
    code = (command.args or "").strip().upper()
    if not code:
        return await m.answer("Введите промокод: <code>/promo КОД</code>")
    async with _promo_lock:
        row = await db.fetchone("SELECT * FROM promos WHERE code=?", (code,))
        if not row or row["uses_left"] <= 0:
            return await m.answer("❌ Промокод не найден или закончился")
        if await db.fetchone("SELECT 1 FROM promo_used WHERE code=? AND user_id=?", (code, uid)):
            return await m.answer("Вы уже активировали этот промокод")
        await db.execute("INSERT INTO promo_used VALUES(?,?)", (code, uid))
        await db.execute("UPDATE promos SET uses_left = uses_left - 1 WHERE code=?", (code,))
        await db.apply_sub(uid, row["tier"], row["days"])
    what = "КОМБО: PREMIUM и VIP сразу" if row["tier"] == 3 else TIERS[row["tier"]]
    await m.answer(f"🎉 Промокод активирован: <b>{what}</b> на {row['days']} дн.!\n{await subtools.describe(uid)}")


@router.message(Command("ref", "invite"))
async def ref(m: Message, bot: Bot):
    uid = m.from_user.id
    me = await bot.me()
    n = (await db.fetchone("SELECT COUNT(*) c FROM settings WHERE key='ref' AND value=?", (str(uid),)))["c"]
    await m.answer(
        f"👥 <b>Пригласи друга</b>\nЗа каждого друга, который подключит бота, вы получаете +{config.REF_DAYS} дн. PREMIUM.\n\n"
        f"Ваша ссылка:\n<code>https://t.me/{me.username}?start=ref_{uid}</code>\n\nПриглашено (перешли по ссылке): {n}"
    )


log = logging.getLogger(__name__)


async def sub_loop(bot: Bot):
    """Предупреждает за сутки до окончания подписки и сообщает, когда она закончилась."""
    while True:
        try:
            now = time.time()
            for r in await db.fetchall("SELECT * FROM subscriptions WHERE until > ? AND until <= ? AND COALESCE(notified,0)=0", (now, now + 86400)):
                await db.execute("UPDATE subscriptions SET notified=1 WHERE user_id=? AND tier=?", (r["user_id"], r["tier"]))
                if r["user_id"] in db.BANNED or db.is_staff(r["user_id"]):
                    continue
                try:
                    await bot.send_message(r["user_id"], f"⏳ Ваш тариф <b>{TIERS[r['tier']]}</b> заканчивается {datetime.fromtimestamp(r['until'], config.MSK):%d.%m в %H:%M}. Продлить: /tariffs")
                except Exception:
                    pass
            for r in await db.fetchall("SELECT * FROM subscriptions WHERE until <= ? AND COALESCE(notified,0) < 2", (now,)):
                await db.execute("UPDATE subscriptions SET notified=2 WHERE user_id=? AND tier=?", (r["user_id"], r["tier"]))
                if r["user_id"] in db.BANNED or db.is_staff(r["user_id"]):
                    continue
                try:
                    await bot.send_message(r["user_id"], f"⌛ Тариф <b>{TIERS[r['tier']]}</b> закончился. Бесплатные функции остаются. Продлить: /tariffs")
                except Exception:
                    pass
        except Exception:
            log.exception("sub_loop")
        await asyncio.sleep(1800)
