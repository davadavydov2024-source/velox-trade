"""Инлайн-режим: в любом чате набрать @имя_бота название песни и выбрать результат."""
import html
import logging

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, InlineQuery, InlineQueryResultAudio, Message

from . import db
from .cmds.music import search_tracks
from .menu import _admin

log = logging.getLogger(__name__)
router = Router()


@router.inline_query()
async def inline_music(q: InlineQuery):
    text = q.query.strip()
    if q.from_user.id in db.BANNED or len(text) < 2:
        return await q.answer([], cache_time=1, is_personal=True)
    try:
        tracks = await search_tracks(text)
    except Exception as e:
        log.warning("поиск музыки: %s", e)
        return await q.answer([], cache_time=1)
    results = []
    for t in tracks[:10]:
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🎧 Слушать полностью", url=t["link"])]]) if t["link"] else None
        results.append(InlineQueryResultAudio(
            id=str(t["id"]), audio_url=t["preview"], title=(t["title"] or "Без названия")[:100],
            performer=t["artist"][:100], audio_duration=30, reply_markup=kb))
    await q.answer(results, cache_time=300)


@router.message(Command("musictest"))
async def music_test(m: Message):
    """Админская проверка: достаёт ли сервер до каталога музыки."""
    if not _admin(m):
        return
    try:
        tracks = await search_tracks("queen")
        await m.answer(f"🎧 Поиск музыки работает: найдено {len(tracks)} треков.\nПример: {html.escape(tracks[0]['artist'])} — {html.escape(tracks[0]['title'])}" if tracks
                       else "🎧 Каталог ответил, но треков не нашёл")
    except Exception as e:
        await m.answer(f"⚠️ С сервера нет доступа к каталогу музыки: {html.escape(type(e).__name__)}: {html.escape(str(e)[:150])}")
