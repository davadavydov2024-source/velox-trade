"""Вывод звёзд с баланса бота подарками админу (🧸 мишка и другие подарки Telegram)."""
import asyncio
import html
import logging

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from . import config, db

log = logging.getLogger(__name__)
router = Router()
PENDING: dict = {}  # admin_id -> [(gift, count)]
MAX_PER_GIFT = 50


def _b(text, data):
    return InlineKeyboardButton(text=text, callback_data=data)


def _emoji(g) -> str:
    return getattr(getattr(g, "sticker", None), "emoji", None) or "🎁"


async def balance(bot: Bot) -> int:
    b = await bot.get_my_star_balance()
    return int(getattr(b, "amount", 0) or 0)


async def gifts(bot: Bot) -> list:
    """Подарки, которые бот может отправить, от дорогих к дешёвым (без распроданных)."""
    res = await bot.get_available_gifts()
    items = [g for g in res.gifts if getattr(g, "remaining_count", None) in (None,) or g.remaining_count > 0]
    return sorted(items, key=lambda g: -g.star_count)


def plan(items: list, bal: int, reserve: int = 0):
    """Жадно: сначала самые дорогие подарки, пока хватает звёзд (резерв остаётся на балансе)."""
    left, out = max(0, bal - reserve), []
    for g in items:
        n = min(left // g.star_count, MAX_PER_GIFT)
        rem = getattr(g, "remaining_count", None)
        if rem is not None:
            n = min(n, rem)
        if n > 0:
            out.append((g, n))
            left -= n * g.star_count
    return out, left


def _fmt_plan(p) -> str:
    return " + ".join(f"{n}×{_emoji(g)} ({g.star_count}⭐)" for g, n in p)


async def view(bot: Bot, reserve: int = 0):
    """Текст и кнопки главного экрана «звёзды → подарок»."""
    bal = await balance(bot)
    items = await gifts(bot)
    afford = [g for g in items if g.star_count <= bal]
    lines = [f"⭐ <b>Баланс бота: {bal}</b>",
             "Звёзды можно получить подарком: бот отправит его вам со своего баланса.", ""]
    if not items:
        lines.append("Список подарков пока недоступен.")
    elif not afford:
        lines.append(f"Дешевле всего подарок стоит {items[-1].star_count}⭐ — на балансе пока не хватает.")
    else:
        lines.append("Доступно: " + " · ".join(f"{_emoji(g)} {g.star_count}⭐" for g in afford[:16]))
    lines += ["", "⚠️ Эти звёзды — оплаты пользователей. Оставляйте часть на возвраты (<code>/refund</code>): "
              "<code>/stars 200</code> — «потратить всё» оставит 200⭐."]
    rows, row = [], []
    for g in afford[:12]:
        row.append(_b(f"{_emoji(g)} {g.star_count}⭐", f"gf:one:{g.id}"))
        if len(row) == 3:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    if afford:
        rows.append([_b(f"🎁 Потратить всё (оставить {reserve}⭐)", f"gf:auto:{reserve}")])
    rows.append([_b("🔄 Обновить", f"gf:view:{reserve}"), _b("⬅️ Панель", "adm:panel")])
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=rows)


@router.message(Command("stars"))
async def stars_cmd(m: Message, bot: Bot, command: CommandObject):
    if not m.from_user or m.from_user.id != config.ADMIN_ID:
        return
    reserve = int(command.args) if (command.args or "").strip().isdigit() else 0
    try:
        text, kb = await view(bot, reserve)
    except Exception as e:
        return await m.answer(f"⚠️ Не удалось получить баланс или подарки: {html.escape(type(e).__name__)}: {html.escape(str(e)[:150])}\n"
                              "Нужна свежая версия aiogram (pip install -U aiogram).")
    await m.answer(text, reply_markup=kb)


@router.callback_query(F.data.startswith("gf:"))
async def gifts_cb(cb: CallbackQuery, bot: Bot):
    if cb.from_user.id != config.ADMIN_ID:
        return await cb.answer("Только для главного админа", show_alert=True)
    parts = cb.data.split(":")
    act = parts[1]
    try:
        if act == "view":
            text, kb = await view(bot, int(parts[2]))
            await cb.message.edit_text(text, reply_markup=kb)
            return await cb.answer()
        if act == "no":
            PENDING.pop(cb.from_user.id, None)
            text, kb = await view(bot)
            await cb.message.edit_text(text, reply_markup=kb)
            return await cb.answer("Отменено")
        bal = await balance(bot)
        items = await gifts(bot)
        if act == "one":
            g = next((x for x in items if str(x.id) == parts[2]), None)
            if not g or g.star_count > bal:
                return await cb.answer("Этот подарок сейчас недоступен или не хватает звёзд", show_alert=True)
            p, left = [(g, 1)], bal - g.star_count
        elif act == "auto":
            p, _ = plan(items, bal, int(parts[2]))
            if not p:
                return await cb.answer("Не хватает звёзд даже на самый дешёвый подарок", show_alert=True)
            left = bal - sum(g.star_count * n for g, n in p)  # остаток на балансе вместе с резервом
        elif act == "ok":
            p = PENDING.pop(cb.from_user.id, None)
            if not p:
                return await cb.answer("Нечего отправлять, начните заново", show_alert=True)
            await cb.answer("Отправляю…")
            sent, spent, err = 0, 0, None
            for g, n in p:
                for _ in range(n):
                    try:
                        await bot.send_gift(gift_id=g.id, user_id=config.ADMIN_ID, text="🎁 Подарок из баланса бота")
                        sent += 1
                        spent += g.star_count
                    except Exception as e:
                        err = f"{type(e).__name__}: {e}"
                        break
                    await asyncio.sleep(0.4)
                if err:
                    break
            await db.alog(cb.from_user.id, f"звёзды → подарки: отправлено {sent} на {spent}⭐" + (f", ошибка {err[:80]}" if err else ""))
            new_bal = await balance(bot)
            await cb.message.edit_text(
                f"🎁 Отправлено подарков: <b>{sent}</b> на {spent}⭐. Баланс бота: <b>{new_bal}</b>⭐." + (f"\n⚠️ Остановился: {html.escape(err[:200])}" if err else "\nПодарки в вашем профиле Telegram."),
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[[_b("⭐ К балансу", "gf:view:0"), _b("⬅️ Панель", "adm:panel")]]))
            return
        else:
            return await cb.answer()
        PENDING[cb.from_user.id] = p
        total = sum(g.star_count * n for g, n in p)
        await cb.message.edit_text(
            f"🎁 <b>Подтвердите</b>\nОтправить вам: {_fmt_plan(p)}\nСписать с баланса бота: <b>{total}⭐</b> (останется {left}⭐)",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[_b("✅ Отправить", "gf:ok"), _b("✖ Отмена", "gf:no")]]))
        await cb.answer()
    except TelegramBadRequest:
        await cb.answer("Без изменений")
    except Exception as e:
        log.warning("gifts: %s", e)
        await cb.answer(f"Ошибка: {type(e).__name__}", show_alert=True)
        await cb.message.answer(f"⚠️ {html.escape(type(e).__name__)}: {html.escape(str(e)[:200])}\nПроверьте, что aiogram обновлён (pip install -U aiogram).")
