import asyncio
import csv
import html
import io
import json
import logging
import os
import tempfile
import time
from datetime import datetime

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest, TelegramRetryAfter
from aiogram.filters import Command, CommandObject
from aiogram.types import BufferedInputFile, CallbackQuery, FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup, Message

from . import config, db, subtools
from .cmds import anim
from .menu import _admin, _staff, _target, _subs_text, _stats_text, _spam_text
from .registry import REG, TIERS

log = logging.getLogger(__name__)
router = Router()
PENDING: dict[int, str] = {}
PROMO_MAP = {"1": 1, "premium": 1, "prem": 1, "2": 2, "vip": 2, "3": 3, "combo": 3, "both": 3, "bundle": 3, "all": 3}
PRICE_MAP = {"1": 1, "premium": 1, "prem": 1, "2": 2, "vip": 2, "3": 3, "combo": 3, "both": 3, "bundle": 3, "all": 3}
NAMES = {1: "PREMIUM", 2: "VIP", 3: "КОМБО (PREMIUM+VIP)"}
PAGE = 15
FILTERS = {"all": "Все", "paid": "💎 Платные", "banned": "🚫 Баны", "mods": "🛡 Мини"}
LAST_FILTER: dict[int, str] = {}
SEARCH: dict[int, list] = {}
SETTINGS = {  # имя -> (название, быстрые значения)
    "trial": ("Пробный PREMIUM при подключении, дн.", [0, 3, 7]),
    "ref": ("Бонус за приглашённого друга, дн.", [0, 3, 7]),
    "spam_max": ("Лимит спама за раз", [1000, 10000, 50000]),
    "spam_cd": ("Перерыв спама, сек.", [0, 1200, 3600]),
    "sub_days": ("Длительность подписки, дн.", [30, 60, 90]),
}
PRICE_PRESETS = {1: [100, 150, 250], 2: [250, 350, 500], 3: [10, 50, 100]}

ADMIN_HELP = (
    "👑 <b>Все команды админа</b>\n\n"
    "<b>Пользователи</b>: /users · <code>/find @ник|имя|ID</code> · <code>/user ID</code> · /top · "
    "<code>/ban ID [причина]</code> · <code>/unban ID</code> · /bans · <code>/msg ID текст</code>\n"
    "<b>Подписки</b> (PREMIUM и VIP независимы, можно обе сразу): <code>/give ID premium|vip|both [дней]</code> · "
    "<code>/give ID premium 30 vip 60</code> · <code>/revoke ID [premium|vip]</code> · /subs · <code>/expiring [дней]</code> · <code>/giftall both 7</code>\n"
    "В чате с человеком: <code>.premium 30</code> · <code>.vip 30</code> · <code>.both 30</code> · <code>.give premium 30 vip 60</code> · <code>.revoke</code>\n"
    "<b>Промокоды</b>: <code>/newpromo КОД premium|vip|both ДНЕЙ ЛИМИТ</code> · /promos · <code>/delpromo КОД</code>\n"
    "<b>Команды</b>: <code>/disablecmd имя</code> · <code>/enablecmd имя</code> · /disabled · "
    "<code>/blockcmd ID имя</code> · <code>/unblockcmd ID имя</code>\n"
    "<b>Спам</b>: /spammers · <code>/stopspam ID|all</code>\n"
    "<b>Мини-админы</b>: <code>/addmod ID</code> · <code>/delmod ID</code> · /mods\n"
    "<b>Прочее</b>: <code>/broadcast текст</code> · <code>/maintenance on|off</code> · "
    "<code>/setprice premium|vip|combo звёзды</code> · <code>/set имя значение</code> · /payments · <code>/refund ID</code> · /export · /backup · /log · /stats · /musictest · <code>/stars [резерв]</code> (звёзды бота → подарок вам)"
)
STAFF_HELP = (
    "🛡 <b>Мини-админка</b>\n\n"
    "У вас VIP-функции без лимитов. Доступно: /users · <code>/find</code> · <code>/user ID</code> · /subs · /stats · /top · "
    "/spammers · <code>/stopspam ID|all</code>.\n"
    "Выдавать подписки, банить, делать рассылки и назначать мини-админов может только главный админ."
)


def _b(text, data):
    return InlineKeyboardButton(text=text, callback_data=data)


def _ab(text, key):
    return _b(text, f"adm:{key}")


def _back(*extra):
    return InlineKeyboardMarkup(inline_keyboard=[*extra, [_ab("⬅️ Панель", "panel")]])


def _args(m: Message):
    return (m.text or "").split()[1:]


def _fmt(ts) -> str:
    return datetime.fromtimestamp(float(ts), config.MSK).strftime("%d.%m.%Y %H:%M")


def _name(r) -> str:
    return html.escape(f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() or "—")


def _cmd_name(raw: str):
    c = REG.get(raw.lower().lstrip("."))
    return c.names[0] if c else None


async def _edit(cb: CallbackQuery, text: str, kb=None):
    try:
        await cb.message.edit_text(text, reply_markup=kb)
    except TelegramBadRequest:
        pass


# ---------- главный экран ----------
async def _dash_text() -> str:
    now = time.time()
    users = (await db.fetchone("SELECT COUNT(DISTINCT user_id) c FROM connections"))["c"]
    active = (await db.fetchone("SELECT COUNT(*) c FROM settings WHERE key='last_seen' AND CAST(value AS REAL) > ?", (now - 86400,)))["c"]
    by = {r["tier"]: r["c"] for r in await db.fetchall("SELECT tier, COUNT(*) c FROM subscriptions WHERE until > ? GROUP BY tier", (now,))}
    return (
        f"👑 <b>Админ-панель</b> · <code>{config.VERSION}</code>\n\n"
        f"👥 Пользователей: <b>{users}</b> · активных за 24 ч: <b>{active}</b>\n"
        f"💎 Подписки: PREMIUM {by.get(1, 0)} · VIP {by.get(2, 0)}\n"
        f"🚨 Спам сейчас: {len(anim.list_active())} · 🚫 Банов: {len(db.BANNED)} · 🛡 Мини-админов: {len(db.MODS)}\n"
        f"🛠 Техработы: {'ВКЛЮЧЕНЫ' if db.STATE['maint'] else 'выкл'}\n\nВсе команды — /adminhelp"
    )


def _panel_kb(admin: bool) -> InlineKeyboardMarkup:
    rows = [[_ab("👥 Пользователи", "users"), _ab("🔎 Поиск", "find")],
            [_ab("📋 Подписки", "subs"), _ab("📊 Статистика", "stats")],
            [_ab("🏆 Топ", "top"), _ab("🚨 Спам", "spam")]]
    if admin:
        rows += [[_ab("🚫 Баны", "bans"), _ab("🎟 Промокоды", "promos")],
                 [_ab("📢 Рассылка", "bc"), _ab("⚙️ Настройки", "settings")],
                 [_ab("💰 Цены", "prices"), _ab("🔧 Команды", "cmds")],
                 [_ab("🛠 Техработы: ВКЛ" if db.STATE["maint"] else "🛠 Техработы: выкл", "maint"), _ab("📤 Экспорт", "export")],
                 [_ab("💾 Бэкап БД", "backup"), _ab("📜 Лог", "log")],
                 [_ab("💳 Платежи", "pays"), _ab("⭐ Звёзды → подарок", "stars")]]
    rows.append([_ab("🔄 Обновить", "panel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


@router.message(Command("admin"))
async def admin_panel(m: Message):
    if _staff(m):
        await m.answer(await _dash_text(), reply_markup=_panel_kb(_admin(m)))


@router.message(Command("adminhelp"))
async def admin_help(m: Message):
    if _staff(m):
        await m.answer(ADMIN_HELP if _admin(m) else STAFF_HELP, reply_markup=_back())


# ---------- пользователи: список, фильтры, поиск ----------
async def _all_users():
    return await db.fetchall(
        "SELECT user_id, MAX(first_name) first_name, MAX(last_name) last_name, MAX(username) username "
        "FROM connections GROUP BY user_id ORDER BY user_id")


async def _filtered(admin_id: int, flt: str):
    rows = await _all_users()
    if flt == "search":
        by = {r["user_id"]: r for r in rows}
        return [by[u] for u in SEARCH.get(admin_id, []) if u in by]
    out = []
    for r in rows:
        uid = r["user_id"]
        if flt == "paid" and (db.is_staff(uid) or await db.get_tier(uid) == 0):
            continue
        if flt == "banned" and uid not in db.BANNED:
            continue
        if flt == "mods" and uid not in db.MODS:
            continue
        out.append(r)
    return out


async def _users_page(admin_id: int, flt: str = "all", page: int = 0):
    LAST_FILTER[admin_id] = flt
    rows = await _filtered(admin_id, flt)
    pages = max(1, (len(rows) + PAGE - 1) // PAGE)
    page = max(0, min(page, pages - 1))
    title = "🔎 Результаты поиска" if flt == "search" else f"👥 Пользователи · {FILTERS.get(flt, '')}"
    lines = [f"<b>{title}</b> ({len(rows)}) · стр. {page + 1}/{pages}"]
    for i, r in enumerate(rows[page * PAGE:(page + 1) * PAGE], page * PAGE + 1):
        uid = r["user_id"]
        flags = ("🚫" if uid in db.BANNED else "") + ("🛡" if uid in db.MODS else "") + ("👑" if uid == config.ADMIN_ID else "")
        un = f"@{html.escape(r['username'])}" if r["username"] else "—"
        lines.append(f"{i}. {un} · {_name(r)} · {TIERS[await db.get_tier(uid)]} {flags}".rstrip())
    if not rows:
        lines.append("пусто")
    lines.append("\n✍️ Отправьте <b>номер</b> из списка (например <code>3</code>) — откроется пользователь.")
    kb = [[_b(("✅ " if flt == k else "") + v, f"u:list:{k}:0") for k, v in FILTERS.items()]]
    nav = []
    if page > 0:
        nav.append(_b("⬅️", f"u:list:{flt}:{page - 1}"))
    if page < pages - 1:
        nav.append(_b("➡️", f"u:list:{flt}:{page + 1}"))
    if nav:
        kb.append(nav)
    kb.append([_ab("⬅️ Панель", "panel")])
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=kb)


async def _card_text(uid: int) -> str:
    row = await db.fetchone("SELECT MAX(first_name) f, MAX(last_name) l, MAX(username) u FROM connections WHERE user_id=?", (uid,))
    name = html.escape(f"{row['f'] or ''} {row['l'] or ''}".strip() or "—")
    un = f"@{html.escape(row['u'])}" if row["u"] else "без username"
    act = await db.active_subs(uid)
    conns = (await db.fetchone("SELECT COUNT(*) c FROM connections WHERE user_id=?", (uid,)))["c"]
    msgs = (await db.fetchone("SELECT COUNT(*) c FROM msgs m JOIN connections c ON c.conn_id=m.conn_id WHERE c.user_id=?", (uid,)))["c"]
    refs = (await db.fetchone("SELECT COUNT(*) c FROM settings WHERE key='ref' AND value=?", (str(uid),)))["c"]
    seen = await db.get_s(uid, "last_seen")
    flags = [x for x, on in (("👑 админ", uid == config.ADMIN_ID), ("🛡 мини-админ", uid in db.MODS), ("🚫 забанен", uid in db.BANNED)) if on]
    blocked = json.loads(await db.get_s(uid, "blocked_cmds", "[]"))
    spam_wait = float(await db.get_s(uid, "spam_next", "0")) - time.time()
    return (
        f"👤 <b>{name}</b> ({un})\nID: <code>{uid}</code> {' '.join(flags)}\nПодписки: "
        + (" · ".join(f"{subtools.NAME[t]} до {_fmt(u)}" for t, u in sorted(act.items())) or "нет (FREE)")
        + f"\nПодключений: {conns} · сообщений в журнале: {msgs}\nПриглашено друзей: {refs}\n"
        f"Последняя команда: {_fmt(seen) if seen else '—'}\n"
        f"Спам: {'🔇 отключён' if 'spam' in blocked else '✅ доступен'}"
        + (f" · перерыв ещё {int(spam_wait // 60)} мин" if spam_wait > 0 else "")
        + (f"\nВсе отключённые команды: {', '.join('.' + c for c in blocked)}" if blocked else "")
    )


def _card_kb(uid: int, admin: bool, admin_id: int) -> InlineKeyboardMarkup:
    back = [_b("⬅️ К списку", f"u:list:{LAST_FILTER.get(admin_id, 'all')}:0"), _ab("🏠 Панель", "panel")]
    if not admin:
        return InlineKeyboardMarkup(inline_keyboard=[back])

    def b(text, act):
        return _b(text, f"u:{act}:{uid}")

    return InlineKeyboardMarkup(inline_keyboard=[[b("🎁 PREMIUM 7д", "prem7"), b("🎁 PREMIUM 30д", "prem30")],
                                                 [b("👑 VIP 30д", "vip30"), b("👑 VIP 90д", "vip90")],
                                                 [b("🔥 ОБЕ сразу 30д", "both30"), b("🔥 ОБЕ сразу 90д", "both90")],
                                                 [b("🗑 PREMIUM", "rev1"), b("🗑 VIP", "rev2"), b("🗑 Всё", "rev")], back])


async def _card_markup(uid: int, admin: bool, admin_id: int) -> InlineKeyboardMarkup:
    kb = _card_kb(uid, admin, admin_id)
    if not admin:
        return kb

    def b(text, act):
        return _b(text, f"u:{act}:{uid}")

    banned, mod = uid in db.BANNED, uid in db.MODS
    spam_off = "spam" in json.loads(await db.get_s(uid, "blocked_cmds", "[]"))
    rows = kb.inline_keyboard[:-1] + [
        [b("✅ Разбанить", "unban") if banned else b("🚫 Забанить", "ban"),
         b("❌ Снять мини-админа", "unmod") if mod else b("🛡 Мини-админка", "mod")],
        [b("🔊 Вернуть спам", "spamon") if spam_off else b("🔇 Отключить спам", "spamoff"), b("♻️ Сброс перерыва", "spamreset")],
        [b("✉️ Написать", "msg")],
        kb.inline_keyboard[-1],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


@router.message(Command("users"))
async def users(m: Message):
    if _staff(m):
        text, kb = await _users_page(m.from_user.id)
        await m.answer(text, reply_markup=kb)


@router.message(Command("find"))
async def find(m: Message, command: CommandObject):
    if not _staff(m):
        return
    q = (command.args or "").strip().lstrip("@").lower()
    if not q:
        return await m.answer("Формат: <code>/find @username</code>, часть имени или ID")
    hits = []
    for r in await _all_users():
        full = f"{r['first_name'] or ''} {r['last_name'] or ''}".lower()
        if q in str(r["user_id"]) or q in (r["username"] or "").lower() or q in full:
            hits.append(r["user_id"])
    if not hits:
        return await m.answer("🔎 Ничего не найдено")
    SEARCH[m.from_user.id] = hits[:40]
    text, kb = await _users_page(m.from_user.id, "search")
    await m.answer(text, reply_markup=kb)


@router.message(F.text.regexp(r"^\d{1,5}$"))
async def pick_user_by_number(m: Message):
    """Админ присылает номер из списка — открывается карточка пользователя."""
    if m.chat.type != "private" or not _staff(m):
        return
    rows = await _filtered(m.from_user.id, LAST_FILTER.get(m.from_user.id, "all"))
    n = int(m.text)
    if not 1 <= n <= len(rows):
        return await m.answer("Нет пользователя с таким номером. Список: /users")
    uid = rows[n - 1]["user_id"]
    await m.answer(await _card_text(uid), reply_markup=await _card_markup(uid, _admin(m), m.from_user.id))


@router.message(Command("user"))
async def user_card(m: Message):
    if not _staff(m):
        return
    uid, _ = _target(m, _args(m))
    if uid is None:
        return await m.answer("Формат: <code>/user ID</code>, ответом на пересланное сообщение или номер из /users")
    await m.answer(await _card_text(uid), reply_markup=await _card_markup(uid, _admin(m), m.from_user.id))


GRANTS = {"prem": [(1, None)], "vip": [(2, None)], "prem7": [(1, 7)], "prem30": [(1, 30)], "vip30": [(2, 30)], "vip90": [(2, 90)],
          "both30": [(1, 30), (2, 30)], "both90": [(1, 90), (2, 90)], "combo30": [(1, 30), (2, 30)]}


@router.callback_query(F.data.startswith("u:"))
async def user_cb(cb: CallbackQuery, bot: Bot):
    parts = cb.data.split(":")
    act, me = parts[1], cb.from_user.id
    if not db.is_staff(me):
        return await cb.answer("Только для админов", show_alert=True)
    try:
        if act == "list":
            flt, page = (parts[2], int(parts[3])) if len(parts) > 3 else ("all", int(parts[2]))
            text, kb = await _users_page(me, flt, page)
            await cb.message.edit_text(text, reply_markup=kb)
            return await cb.answer()
        if me != config.ADMIN_ID:
            return await cb.answer("Только для главного админа", show_alert=True)
        uid = int(parts[2])
        note = None
        if act == "msg":
            return await cb.answer(f"Отправьте: /msg {uid} текст сообщения", show_alert=True)
        if act == "ban":
            if db.is_staff(uid):
                return await cb.answer("Админов банить нельзя", show_alert=True)
            await db.ban(uid, "через админку")
            await db.alog(me, f"бан → {uid}")
            note = "⛔ Вы заблокированы администратором."
        elif act == "unban":
            await db.unban(uid)
            await db.alog(me, f"разбан → {uid}")
            note = "✅ Вы разблокированы."
        elif act in GRANTS:
            items = [(t, d or config.SUB_DAYS) for t, d in GRANTS[act]]
            await db.grant_many(uid, items)
            await db.alog(me, f"выдал {subtools.fmt_items(items)} → {uid}")
            note = f"🎁 Вам выданы подписки: {subtools.fmt_items(items)}\n{await subtools.describe(uid)}"
        elif act in ("rev", "rev1", "rev2"):
            tier = {"rev1": 1, "rev2": 2}.get(act)
            await db.revoke(uid, tier)
            await db.alog(me, f"отобрал {subtools.NAME.get(tier, 'все подписки')} → {uid}")
        elif act == "mod":
            await db.add_mod(uid)
            await db.alog(me, f"мини-админ → {uid}")
            note = "🛡 Вам выданы права мини-админа: все функции без лимитов."
        elif act == "unmod":
            await db.del_mod(uid)
            await db.alog(me, f"снял мини-админа → {uid}")
        elif act in ("spamoff", "spamon"):
            blocked = set(json.loads(await db.get_s(uid, "blocked_cmds", "[]")))
            if act == "spamoff":
                blocked.add("spam")
                anim.stop_owner(uid)
            else:
                blocked.discard("spam")
            await db.set_s(uid, "blocked_cmds", json.dumps(sorted(blocked)))
            await db.alog(me, f"спам {'отключён' if act == 'spamoff' else 'возвращён'} → {uid}")
        elif act == "spamreset":
            await db.del_s(uid, "spam_next")
            await db.alog(me, f"сбросил перерыв спама → {uid}")
        if note:
            try:
                await bot.send_message(uid, note)
            except Exception:
                pass
        await cb.message.edit_text(await _card_text(uid), reply_markup=await _card_markup(uid, True, me))
        await cb.answer("Готово")
    except TelegramBadRequest:
        await cb.answer("Без изменений")


# ---------- тексты разделов ----------
async def _top_text() -> str:
    rows = await db.fetchall(
        "SELECT c.user_id uid, COUNT(*) n FROM msgs m JOIN connections c ON c.conn_id = m.conn_id GROUP BY c.user_id ORDER BY n DESC LIMIT 10")
    cmds = await db.fetchall("SELECT cmd, SUM(n) n FROM cmdstat GROUP BY cmd ORDER BY n DESC LIMIT 10")
    out = ["🏆 <b>Самые активные</b> (сообщений за 30 дней)"]
    out += [f"{i}. <code>{r['uid']}</code> — {r['n']}" for i, r in enumerate(rows, 1)] or ["пока пусто"]
    out += ["", "🔥 <b>Популярные команды</b>"]
    out += [f"{i}. .{r['cmd']} — {r['n']}" for i, r in enumerate(cmds, 1)] or ["пока пусто"]
    return "\n".join(out)


async def _bans_text() -> str:
    rows = await db.fetchall("SELECT * FROM banned ORDER BY ts DESC LIMIT 40")
    if not rows:
        return "🚫 Банов нет"
    return "🚫 <b>Баны</b>\n" + "\n".join(
        f"<code>{r['user_id']}</code> · {_fmt(r['ts'])} · {html.escape(r['reason'] or '—')}" for r in rows) + "\n\nСнять: <code>/unban ID</code> или фильтр «🚫 Баны» в списке пользователей"


async def _promos_text() -> str:
    rows = await db.fetchall("SELECT * FROM promos ORDER BY code")
    body = "\n".join(f"<code>{r['code']}</code> · {NAMES[r['tier']]} {r['days']} дн. · осталось {r['uses_left']}" for r in rows) or "пока нет"
    return ("🎟 <b>Промокоды</b>\n" + body + "\n\nСоздать: <code>/newpromo КОД both 30 10</code> (premium | vip | both)\nУдалить: <code>/delpromo КОД</code>\n"
            "Пользователи активируют: <code>/promo КОД</code>")


def _cmds_text() -> str:
    dis = ", ".join(f".{c}" for c in sorted(db.DISABLED)) or "нет"
    return (f"🔧 <b>Команды</b>\nОтключены глобально: {dis}\n\n"
            "<code>/disablecmd spam</code> — отключить для всех (кроме админов)\n<code>/enablecmd spam</code> — включить\n"
            "<code>/blockcmd ID spam</code> — отключить одному пользователю (или кнопкой в карточке)\n<code>/unblockcmd ID spam</code> — вернуть")


def _prices_view():
    kb = []
    for t in (3, 1, 2):
        kb.append([_ab(f"{NAMES[t]}: {config.PRICES[t]}⭐", "noop")])
        kb.append([_ab(("✅ " if config.PRICES[t] == v else "") + f"{v}⭐", f"price:{t}:{v}") for v in PRICE_PRESETS[t]])
    return (f"💰 <b>Цены</b> ({config.SUB_DAYS} дн.)\nКОМБО: {config.PRICES[3]}⭐ · PREMIUM: {config.PRICES[1]}⭐ · VIP: {config.PRICES[2]}⭐\n"
            "Комбо выдаёт VIP (он включает всё из PREMIUM).\n\nСвою цену: <code>/setprice combo 10</code>, <code>/setprice premium 200</code>"), _back(*kb)


def _settings_view():
    lines, kb = ["⚙️ <b>Настройки</b> (применяются сразу, без перезапуска)\n"], []
    for name, (title, presets) in SETTINGS.items():
        cur = getattr(config, db.CFG_KEYS[name])
        lines.append(f"• {title}: <b>{cur}</b>")
        kb.append([_ab(title, "noop")])
        kb.append([_ab(("✅ " if cur == v else "") + str(v), f"set:{name}:{v}") for v in presets])
    lines.append("\nДругое значение: <code>/set trial 5</code> (имена: " + ", ".join(SETTINGS) + ")")
    return "\n".join(lines), _back(*kb)


async def _log_text() -> str:
    rows = await db.recent_log(25)
    if not rows:
        return "📜 Журнал пуст"
    return "📜 <b>Последние действия админов</b>\n" + "\n".join(
        f"{_fmt(r['ts'])} · <code>{r['admin_id']}</code> · {html.escape(r['text'])}" for r in rows)


async def _pays_text() -> str:
    rows = await db.fetchall("SELECT * FROM payments ORDER BY ts DESC LIMIT 15")
    total = (await db.fetchone("SELECT COALESCE(SUM(stars),0) c FROM payments WHERE payload NOT LIKE '%:refunded'"))["c"]
    if not rows:
        return "💳 Платежей пока нет"
    names = {"1": "PREMIUM", "2": "VIP", "3": "КОМБО"}
    lines = [f"💳 <b>Платежи</b> · всего получено: <b>{total}⭐</b>"]
    for r in rows:
        parts = r["payload"].split(":")
        gift = "🎁 " if parts[0] == "gift" else ""
        mark = " ↩️ возврат" if r["payload"].endswith(":refunded") else ""
        lines.append(f"{_fmt(r['ts'])} · <code>{r['user_id']}</code> · {gift}{names.get(parts[1], parts[1])} · {r['stars']}⭐{mark}\n<code>{r['charge_id']}</code>")
    return "\n".join(lines) + "\n\nВернуть звёзды и снять подписку: <code>/refund ID_платежа</code>"


async def _export(msg: Message):
    rows = await db.fetchall("SELECT user_id, first_name, last_name, MAX(username) username, MAX(ts) ts FROM connections GROUP BY user_id")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["user_id", "username", "name", "premium_until", "vip_until", "banned", "mod", "last_seen"])
    for r in rows:
        uid = r["user_id"]
        act = await db.active_subs(uid)
        seen = await db.get_s(uid, "last_seen")
        w.writerow([uid, r["username"] or "", f"{r['first_name']} {r['last_name']}".strip(),
                    _fmt(act[1]) if 1 in act else "", _fmt(act[2]) if 2 in act else "", int(uid in db.BANNED), int(uid in db.MODS), _fmt(seen) if seen else ""])
    await msg.answer_document(BufferedInputFile(buf.getvalue().encode("utf-8-sig"), "users.csv"), caption=f"👥 Пользователей: {len(rows)}")


async def _backup(msg: Message):
    path = os.path.join(tempfile.gettempdir(), f"backup_{int(time.time())}.db")
    try:
        await db.execute(f"VACUUM INTO '{path}'")
        await msg.answer_document(FSInputFile(path, filename=f"backup_{datetime.now(config.MSK):%Y%m%d_%H%M}.db"),
                                  caption="💾 Копия базы (подписки, настройки, сохранённые сообщения). Храните в безопасном месте.")
    finally:
        if os.path.exists(path):
            os.remove(path)


# ---------- кнопки панели ----------
ADMIN_ONLY = {"bans", "promos", "bc", "cmds", "maint", "prices", "export", "backup", "log", "settings", "pays", "stars"}


@router.callback_query(F.data.startswith("adm:"))
async def admin_cb(cb: CallbackQuery, bot: Bot):
    key, uid = cb.data[4:], cb.from_user.id
    if not db.is_staff(uid):
        return await cb.answer("Только для админов", show_alert=True)
    head = key.split(":")[0]
    if (head in ADMIN_ONLY or head in ("set", "price")) and uid != config.ADMIN_ID:
        return await cb.answer("Только для главного админа", show_alert=True)
    is_admin = uid == config.ADMIN_ID
    if key == "noop":
        return await cb.answer()
    if key == "panel":
        await _edit(cb, await _dash_text(), _panel_kb(is_admin))
        return await cb.answer()
    if key == "users":
        text, kb = await _users_page(uid, "all")
        await _edit(cb, text, kb)
        return await cb.answer()
    if key == "stars":
        from .stars import view
        try:
            text, kb = await view(bot)
        except Exception as e:
            return await cb.answer(f"Не удалось получить баланс: {type(e).__name__}", show_alert=True)
        await _edit(cb, text, kb)
        return await cb.answer()
    if key == "export":
        await _export(cb.message)
        return await cb.answer()
    if key == "backup":
        await cb.answer("Готовлю копию…")
        try:
            await _backup(cb.message)
        except Exception as e:
            await cb.message.answer(f"⚠️ Не удалось сделать копию: {html.escape(str(e))}")
        return
    if key == "maint":
        await db.set_maint(not db.STATE["maint"])
        await db.alog(uid, f"техработы {'вкл' if db.STATE['maint'] else 'выкл'}")
        await _edit(cb, await _dash_text(), _panel_kb(True))
        return await cb.answer("Режим техработ: " + ("ВКЛ" if db.STATE["maint"] else "выкл"))
    if key == "stopall":
        n = len(anim.stop_owner(None))
        await cb.answer(f"Остановлено задач: {n}", show_alert=True)
        return await _edit(cb, _spam_text(), _spam_kb())
    if head == "set":
        _, name, val = key.split(":")
        setattr(config, db.CFG_KEYS[name], int(val))
        await db.set_s(0, f"cfg_{name}", val)
        await db.alog(uid, f"настройка {name} = {val}")
        text, kb = _settings_view()
        await _edit(cb, text, kb)
        return await cb.answer("Сохранено")
    if head == "price":
        _, t, val = key.split(":")
        config.PRICES[int(t)] = int(val)
        await db.set_s(0, f"price_{t}", val)
        await db.alog(uid, f"цена {NAMES[int(t)]} = {val}⭐")
        text, kb = _prices_view()
        await _edit(cb, text, kb)
        return await cb.answer("Сохранено")
    kb = _back()
    if key == "subs":
        text = await _subs_text()
    elif key == "stats":
        text = await _stats_text()
    elif key == "top":
        text = await _top_text()
    elif key == "spam":
        text, kb = _spam_text(), _spam_kb()
    elif key == "bans":
        text = await _bans_text()
    elif key == "promos":
        text = await _promos_text()
    elif key == "cmds":
        text = _cmds_text()
    elif key == "prices":
        text, kb = _prices_view()
    elif key == "settings":
        text, kb = _settings_view()
    elif key == "log":
        text = await _log_text()
    elif key == "pays":
        text = await _pays_text()
    elif key == "find":
        text = "🔎 <b>Поиск</b>\nОтправьте <code>/find @username</code>, часть имени или ID — покажу список, номер откроет пользователя."
    elif key == "bc":
        text = "📢 <b>Рассылка</b>\nНапишите <code>/broadcast текст</code> — покажу предпросмотр и спрошу подтверждение."
    else:
        return await cb.answer()
    await _edit(cb, text, kb)
    await cb.answer()


def _spam_kb():
    return _back([_ab("🔄 Обновить", "spam"), _ab("🛑 Остановить весь спам", "stopall")])


# ---------- баны ----------
@router.message(Command("ban"))
async def ban(m: Message, bot: Bot):
    if not _admin(m):
        return
    uid, a = _target(m, _args(m))
    if uid is None:
        return await m.answer("Формат: <code>/ban ID [причина]</code>")
    if db.is_staff(uid):
        return await m.answer("Админов банить нельзя")
    await db.ban(uid, " ".join(a))
    await db.alog(m.from_user.id, f"бан → {uid} {' '.join(a)}")
    await m.answer(f"🚫 {uid} заблокирован. Команды бота у него больше не работают.")
    try:
        await bot.send_message(uid, "⛔ Вы заблокированы администратором." + (f"\nПричина: {html.escape(' '.join(a))}" if a else ""))
    except Exception:
        pass


@router.message(Command("unban"))
async def unban(m: Message):
    if not _admin(m):
        return
    uid, _ = _target(m, _args(m))
    if uid is None:
        return await m.answer("Формат: <code>/unban ID</code>")
    await db.unban(uid)
    await db.alog(m.from_user.id, f"разбан → {uid}")
    await m.answer(f"✅ {uid} разблокирован")


@router.message(Command("bans"))
async def bans(m: Message):
    if _admin(m):
        await m.answer(await _bans_text())


@router.message(Command("top"))
async def top(m: Message):
    if _staff(m):
        await m.answer(await _top_text())


# ---------- команды: глобально и точечно ----------
@router.message(Command("disablecmd", "enablecmd"))
async def toggle_cmd(m: Message, command: CommandObject):
    if not _admin(m):
        return
    name = _cmd_name((command.args or "").strip())
    if not name:
        return await m.answer("Такой команды нет. Формат: <code>/disablecmd spam</code>")
    on = command.command == "disablecmd"
    await db.set_disabled(name, on)
    await db.alog(m.from_user.id, f"{'отключил' if on else 'включил'} .{name} для всех")
    await m.answer(f"{'⛔ Отключена' if on else '✅ Включена'} для всех: <code>.{name}</code>")


@router.message(Command("disabled"))
async def disabled(m: Message):
    if _admin(m):
        await m.answer(_cmds_text())


@router.message(Command("blockcmd", "unblockcmd"))
async def block_cmd(m: Message, command: CommandObject):
    if not _admin(m):
        return
    uid, a = _target(m, _args(m))
    name = _cmd_name(a[0]) if a else None
    if uid is None or not name:
        return await m.answer("Формат: <code>/blockcmd ID spam</code>")
    blocked = set(json.loads(await db.get_s(uid, "blocked_cmds", "[]")))
    on = command.command == "blockcmd"
    blocked.add(name) if on else blocked.discard(name)
    await db.set_s(uid, "blocked_cmds", json.dumps(sorted(blocked)))
    await db.alog(m.from_user.id, f"{'отключил' if on else 'вернул'} .{name} → {uid}")
    await m.answer(f"{'⛔ Отключена' if on else '✅ Возвращена'} для {uid}: <code>.{name}</code>")


# ---------- промокоды ----------
@router.message(Command("newpromo"))
async def newpromo(m: Message):
    if not _admin(m):
        return
    a = _args(m)
    if len(a) < 4 or a[1].lower() not in PROMO_MAP or not a[2].isdigit() or not a[3].isdigit():
        return await m.answer("Формат: <code>/newpromo КОД premium|vip|both ДНЕЙ ЛИМИТ</code> (both — обе подписки сразу)")
    code = a[0].upper()
    await db.execute("INSERT OR REPLACE INTO promos VALUES(?,?,?,?)", (code, PROMO_MAP[a[1].lower()], int(a[2]), int(a[3])))
    await db.execute("DELETE FROM promo_used WHERE code=?", (code,))
    await db.alog(m.from_user.id, f"промокод {code}: {a[1]} {a[2]}д ×{a[3]}")
    await m.answer(f"🎟 Промокод <code>{code}</code>: {NAMES[PROMO_MAP[a[1].lower()]]} на {a[2]} дн., активаций {a[3]}\nПользователи вводят: <code>/promo {code}</code>")


@router.message(Command("promos"))
async def promos(m: Message):
    if _admin(m):
        await m.answer(await _promos_text())


@router.message(Command("delpromo"))
async def delpromo(m: Message, command: CommandObject):
    if not _admin(m):
        return
    code = (command.args or "").strip().upper()
    await db.execute("DELETE FROM promos WHERE code=?", (code,))
    await m.answer(f"🗑 Промокод {html.escape(code)} удалён")


# ---------- прочее ----------
@router.message(Command("maintenance"))
async def maintenance(m: Message, command: CommandObject):
    if not _admin(m):
        return
    a = (command.args or "").strip().lower()
    if a not in ("on", "off"):
        return await m.answer(f"Сейчас: {'включены' if db.STATE['maint'] else 'выключены'}. Формат: <code>/maintenance on|off</code>")
    await db.set_maint(a == "on")
    await db.alog(m.from_user.id, f"техработы {a}")
    await m.answer("🛠 Режим техработ " + ("включён: обычные пользователи не могут пользоваться командами" if a == "on" else "выключен"))


@router.message(Command("setprice"))
async def setprice(m: Message):
    if not _admin(m):
        return
    a = _args(m)
    if len(a) < 2 or a[0].lower() not in PRICE_MAP or not a[1].isdigit() or int(a[1]) < 1:
        return await m.answer("Формат: <code>/setprice premium|vip|combo 200</code>")
    t = PRICE_MAP[a[0].lower()]
    config.PRICES[t] = int(a[1])
    await db.set_s(0, f"price_{t}", a[1])
    await db.alog(m.from_user.id, f"цена {NAMES[t]} = {a[1]}⭐")
    await m.answer(f"💰 {NAMES[t]}: {a[1]}⭐")


@router.message(Command("set"))
async def set_cfg(m: Message):
    if not _admin(m):
        return
    a = _args(m)
    if len(a) < 2 or a[0] not in SETTINGS or not a[1].isdigit():
        return await m.answer("Формат: <code>/set имя значение</code>\nИмена: " + ", ".join(f"<code>{k}</code>" for k in SETTINGS))
    setattr(config, db.CFG_KEYS[a[0]], int(a[1]))
    await db.set_s(0, f"cfg_{a[0]}", a[1])
    await db.alog(m.from_user.id, f"настройка {a[0]} = {a[1]}")
    await m.answer(f"⚙️ {SETTINGS[a[0]][0]}: <b>{a[1]}</b>")


@router.message(Command("payments"))
async def payments(m: Message):
    if _admin(m):
        await m.answer(await _pays_text())


@router.message(Command("refund"))
async def refund(m: Message, command: CommandObject, bot: Bot):
    if not _admin(m):
        return
    charge = (command.args or "").strip()
    row = await db.fetchone("SELECT * FROM payments WHERE charge_id=?", (charge,)) if charge else None
    if not row:
        return await m.answer("Платёж не найден. Формат: <code>/refund ID_платежа</code>, список: /payments")
    if row["payload"].endswith(":refunded"):
        return await m.answer("Этот платёж уже возвращён")
    try:
        await bot.refund_star_payment(user_id=row["user_id"], telegram_payment_charge_id=charge)
    except Exception as e:
        return await m.answer(f"⚠️ Возврат не удался: {html.escape(str(e))}")
    await db.execute("UPDATE payments SET payload = payload || ':refunded' WHERE charge_id=?", (charge,))
    parts = row["payload"].split(":")
    kind, days, note = int(parts[1]), row["days"] or config.SUB_DAYS, ""
    if parts[0] == "gift":
        code = parts[2] if len(parts) > 2 else None
        if code:
            used = await db.fetchone("SELECT 1 FROM promo_used WHERE code=?", (code,))
            await db.execute("DELETE FROM promos WHERE code=?", (code,))
            note = "код подарка удалён" if not used else "код уже активирован — у друга подписка сохранена"
    else:
        for t in ((1, 2) if kind == 3 else (kind,)):
            await db.take_days(row["user_id"], t, days)
        note = f"сняты {days} дн. подписки"
    await db.alog(m.from_user.id, f"возврат {row['stars']}⭐ → {row['user_id']}: {note}")
    await m.answer(f"↩️ Возвращено {row['stars']}⭐ пользователю {row['user_id']}: {note}")
    try:
        await bot.send_message(row["user_id"], f"↩️ Платёж возвращён ({row['stars']}⭐)." + ("" if parts[0] == "gift" else " Оплаченные дни подписки сняты."))
    except Exception:
        pass


# ---------- массовая выдача и скоро истекающие ----------
GIFT_PENDING: dict = {}


@router.message(Command("giftall"))
async def giftall(m: Message):
    if not _admin(m):
        return
    items = subtools.parse_grants(_args(m))
    if not items:
        return await m.answer("Формат: <code>/giftall both 7</code> или <code>/giftall premium 3 vip 1</code> — подарить ВСЕМ пользователям")
    GIFT_PENDING[m.from_user.id] = items
    kb = InlineKeyboardMarkup(inline_keyboard=[[_b(f"✅ Выдать ({len(await _recipients())})", "ga:ok"), _b("✖ Отмена", "ga:no")]])
    await m.answer(f"🎁 Выдать <b>{subtools.fmt_items(items)}</b> всем пользователям бота?", reply_markup=kb)


@router.callback_query(F.data.startswith("ga:"))
async def giftall_cb(cb: CallbackQuery, bot: Bot):
    if cb.from_user.id != config.ADMIN_ID:
        return await cb.answer("Только для главного админа", show_alert=True)
    items = GIFT_PENDING.pop(cb.from_user.id, None)
    await cb.message.edit_reply_markup(reply_markup=None)
    if cb.data == "ga:no" or not items:
        return await cb.answer("Отменено")
    await cb.answer("Выдаю…")
    sent = 0
    for uid in await _recipients():
        await db.grant_many(uid, items)
        try:
            await bot.send_message(uid, f"🎁 Вам подарок от администратора: {subtools.fmt_items(items)}\n{await subtools.describe(uid)}")
            sent += 1
        except Exception:
            pass
        await asyncio.sleep(0.05)
    await db.alog(cb.from_user.id, f"выдал всем {subtools.fmt_items(items)}; уведомлено {sent}")
    await cb.message.answer(f"🎁 Готово: {subtools.fmt_items(items)} выданы всем, уведомлено {sent}")


@router.message(Command("expiring"))
async def expiring(m: Message, command: CommandObject):
    if not _staff(m):
        return
    d = int(command.args) if (command.args or "").strip().isdigit() else 3
    now = time.time()
    rows = await db.fetchall("SELECT * FROM subscriptions WHERE until > ? AND until <= ? ORDER BY until", (now, now + d * 86400))
    if not rows:
        return await m.answer(f"Ближайшие {d} дн. ничего не истекает")
    await m.answer(f"⏳ <b>Истекает в ближайшие {d} дн.</b>\n" + "\n".join(
        f"<code>{r['user_id']}</code> · {subtools.NAME[r['tier']]} · {_fmt(r['until'])}" for r in rows[:50]))


@router.message(Command("log"))
async def log_cmd(m: Message):
    if _admin(m):
        await m.answer(await _log_text())


@router.message(Command("export"))
async def export(m: Message):
    if _admin(m):
        await _export(m)


@router.message(Command("backup"))
async def backup(m: Message):
    if _admin(m):
        try:
            await _backup(m)
        except Exception as e:
            await m.answer(f"⚠️ Не удалось сделать копию: {html.escape(str(e))}")


@router.message(Command("msg"))
async def msg_user(m: Message, bot: Bot):
    if not _admin(m):
        return
    uid, a = _target(m, _args(m))
    if uid is None or not a:
        return await m.answer("Формат: <code>/msg ID текст</code>")
    try:
        await bot.send_message(uid, "✉️ <b>Сообщение от администратора</b>\n" + html.escape(" ".join(a)))
        await db.alog(m.from_user.id, f"написал → {uid}")
        await m.answer("✅ Отправлено")
    except Exception as e:
        await m.answer(f"⚠️ Не доставлено: {html.escape(str(e))}")


async def _recipients():
    rows = await db.fetchall("SELECT user_id FROM connections UNION SELECT user_id FROM settings WHERE key='started' AND user_id != 0")
    return [r["user_id"] for r in rows if r["user_id"] not in db.BANNED]


@router.message(Command("broadcast"))
async def broadcast(m: Message, command: CommandObject):
    if not _admin(m):
        return
    text = (command.args or "").strip()
    if not text:
        return await m.answer("Формат: <code>/broadcast текст рассылки</code> (можно HTML-разметку)")
    PENDING[m.from_user.id] = text
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        _b(f"✅ Отправить ({len(await _recipients())})", "bc:ok"), _b("✖ Отмена", "bc:no")]])
    try:
        await m.answer(f"📢 <b>Предпросмотр</b>\n\n{text}", reply_markup=kb)
    except TelegramBadRequest:
        PENDING[m.from_user.id] = html.escape(text)
        await m.answer(f"📢 <b>Предпросмотр</b>\n\n{html.escape(text)}", reply_markup=kb)


@router.callback_query(F.data.startswith("bc:"))
async def broadcast_cb(cb: CallbackQuery, bot: Bot):
    if cb.from_user.id != config.ADMIN_ID:
        return await cb.answer("Только для главного админа", show_alert=True)
    text = PENDING.pop(cb.from_user.id, None)
    await cb.message.edit_reply_markup(reply_markup=None)
    if cb.data == "bc:no" or not text:
        return await cb.answer("Отменено")
    await cb.answer("Отправляю…")
    sent = failed = 0
    for uid in await _recipients():
        try:
            try:
                await bot.send_message(uid, text)
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after + 1)
                await bot.send_message(uid, text)
            sent += 1
        except Exception:
            failed += 1
        await asyncio.sleep(0.05)
    await db.alog(cb.from_user.id, f"рассылка: доставлено {sent}, не доставлено {failed}")
    await cb.message.answer(f"📢 Рассылка завершена: доставлено {sent}, не доставлено {failed}")
