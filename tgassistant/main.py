import asyncio
import logging
import os
import tempfile

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from aiogram.types import BotCommand, BotCommandScopeChat, ErrorEvent

from app import config, db, menu, business, admin_panel, botcmds, errlog, music_inline, stars
from app.cmds import profile, utils


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if config.DATA_DIR != ".":
        tmp = os.path.join(config.DATA_DIR, "tmp")
        os.makedirs(tmp, exist_ok=True)
        tempfile.tempdir = tmp  # временные файлы медиа-команд тоже пишем в разрешённую папку
    await db.init(config.DB_PATH)
    bot = Bot(config.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    async def on_error(event: ErrorEvent):
        logging.error("Ошибка обработчика", exc_info=event.exception)
        await errlog.report(bot, f"{type(event.exception).__name__}: {event.exception}")
        return True

    dp.errors.register(on_error)
    dp.include_router(admin_panel.router)
    dp.include_router(botcmds.router)
    dp.include_router(music_inline.router)
    dp.include_router(stars.router)
    dp.include_router(menu.router)
    dp.include_router(business.router)
    asyncio.create_task(profile.time_loop(bot))
    asyncio.create_task(utils.remind_loop(bot))
    asyncio.create_task(botcmds.sub_loop(bot))
    me = await bot.me()
    if not config.ADMIN_ID:
        logging.warning("ADMIN_ID не задан: админ-панель и админ-команды недоступны (задайте переменную ADMIN_ID)")
    user_cmds = [
        BotCommand(command="start", description="Главное меню"),
        BotCommand(command="connect", description="Как подключить бота"),
        BotCommand(command="tariffs", description="Тарифы и оплата"),
        BotCommand(command="profile", description="Мой профиль"),
        BotCommand(command="promo", description="Ввести промокод"),
        BotCommand(command="ref", description="Пригласить друга"),
        BotCommand(command="diag", description="Диагностика бота"),
        BotCommand(command="stopsave", description="Выключить сохранение удалённых"),
        BotCommand(command="startsave", description="Включить сохранение удалённых"),
    ]
    try:
        await bot.set_my_commands(user_cmds)
        if config.ADMIN_ID:
            await bot.set_my_commands(
                user_cmds + [BotCommand(command="admin", description="Админ-панель"), BotCommand(command="users", description="Пользователи"),
                             BotCommand(command="stats", description="Статистика"), BotCommand(command="spammers", description="Кто сейчас спамит")],
                scope=BotCommandScopeChat(chat_id=config.ADMIN_ID))
        await bot.set_my_short_description("Ассистент для личных чатов: анимации, игры, медиа, утилиты, сохранение удалённых сообщений")
    except Exception as e:
        logging.warning("не удалось настроить меню команд: %s", e)
    logging.info("Бот @%s запущен, версия %s", me.username, config.VERSION)
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


if __name__ == "__main__":
    asyncio.run(main())
