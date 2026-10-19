import html
import logging
import secrets
import time
from datetime import datetime

from aiogram import F, Bot, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, LabeledPrice, Message, PreCheckoutQuery,
)

from . import config, db, subtools
from .registry import CMDS, SECTIONS, TIERS, section_text
from .cmds import anim, saver

log = logging.getLogger(__name__)
router = Router()

TIER_TEXT = {
    1: "✨ Анимации (.print .glit .love …)\n🎞 Медиа (.sticker .removebg .voice .krom …)\n💥 .spam .xaxa .bomb\n💤 .afk .later",
    2: "Всё из PREMIUM +\n🛡 Модерация (.mute .antimat .antispam …)\n👤 Профиль и авто (.panic .autoread .timeprofile …)",
    3: "Сразу PREMIUM и VIP: все функции бота без ограничений тарифов",
}
PRODUCT = {1: "PREMIUM", 2: "VIP", 3: "КОМБО PREMIUM+VIP"}


def _btn(text, data):
    return InlineKeyboardButton(text=text, callback_data=data)


def _visible():
    return [sid for sid in SECTIONS if any(c.section == sid and not c.hidden for c in CMDS)]


def _stitle(sid):
    icon, title = SECTIONS[sid]
    return f"{icon} {title}"


def price(tier):
    return config.PRICES[tier]


async def sub_line(uid) -> str:
    if uid == config.ADMIN_ID:
        return "💎 Тариф: <b>VIP</b> (админ)"
    if uid in db.MODS:
        return "💎 Тариф: <b>VIP</b> (мини-админ)"
    act = await db.active_subs(uid)
    if not act:
        return "💎 Тариф: <b>FREE</b>"
    return "💎 Подписки: " + " · ".join(f"<b>{subtools.NAME[t]}</b> до {datetime.fromtimestamp(u, config.MSK):%d.%m.%Y}" for t, u in sorted(act.items()))


async def _connected(uid) -> int:
    return (await db.fetchone("SELECT COUNT(*) c FROM connections WHERE user_id=?", (uid,)))["c"]


# ---------- страницы ----------
async def home_text(uid, bot) -> str:
    status = "✅ Бот подключён к вашему аккаунту" if await _connected(uid) else "⚠️ Бот пока не подключён — нажмите «Подключение»"
    return (
        "<b>Ассистент для личных чатов</b> 👀\n<i>Максимум возможностей — минимум лишних действий</i>\n\n"
        f"{status}\n{await sub_line(uid)}\n\n"
        "<blockquote>Пишите команды с точки в любом личном чате: <code>.help</code>, <code>.love</code>, <code>.sticker</code>, "
        "<code>.calc</code> … Удалённые и изменённые сообщения собеседников приходят сюда.\n"
        f"🎧 Музыка: в любом чате наберите <code>@{(await bot.me()).username} название песни</code> или команду <code>.music</code>.</blockquote>"
    )


def home_kb(uid) -> InlineKeyboardMarkup:
    rows = [
        [_btn("🔌 Подключение", "m:connect"), _btn("📖 Команды", "m:cmds")],
        [_btn("💳 Тарифы", "m:sub"), _btn("👤 Профиль", "m:profile")],
        [_btn("🎟 Промокод", "m:promo"), _btn("👥 Друзья", "m:ref")],
        [_btn("🩺 Диагностика", "m:diag"), _btn("ℹ️ О боте", "m:about")],
    ]
    if db.is_staff(uid):
        rows.append([_btn("👑 Админка" if uid == config.ADMIN_ID else "🛡 Мини-админка", "adm:panel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def back_kb(*extra_rows) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[*extra_rows, [_btn("🏠 В меню", "m:home")]])


def cmds_kb() -> InlineKeyboardMarkup:
    btns = []
    for sid in _visible():
        lock = " 🔒" if max(c.tier for c in CMDS if c.section == sid and not c.hidden) else ""
        btns.append(_btn(_stitle(sid) + lock, f"m:{sid}"))
    rows = [btns[i:i + 2] for i in range(0, len(btns), 2)]
    return back_kb(*rows)


def section_kb(sid) -> InlineKeyboardMarkup:
    vis = _visible()
    k = vis.index(sid)
    prev, nxt = vis[k - 1], vis[(k + 1) % len(vis)]
    return back_kb([_btn("⬅️ " + _stitle(prev), f"m:{prev}"), _btn(_stitle(nxt) + " ➡️", f"m:{nxt}")], [_btn("📖 Все разделы", "m:cmds")])


def connect_text(username: str) -> str:
    return (
        "🔌 <b>Как подключить бота</b>\n\n"
        "1️⃣ Откройте <b>Настройки</b> в Telegram.\n"
        "2️⃣ Нажмите <b>Изменить профиль</b>.\n"
        "3️⃣ Выберите <b>Автоматизация чатов</b>.\n"
        f"4️⃣ Укажите бота <code>@{username}</code> и выберите, с какими чатами он работает (например, все личные).\n"
        "5️⃣ Включите права: <b>отвечать на сообщения</b>, <b>удалять сообщения</b> (для .panic и модерации), "
        "<b>читать сообщения</b>, а для .timeprofile ещё <b>менять имя профиля</b>.\n"
        "6️⃣ Вернитесь сюда и нажмите /start — так бот сможет писать вам в личку (удалённые сообщения, напоминания, заметки).\n"
        "7️⃣ В любом личном чате отправьте <code>.ping</code> — бот должен ответить «pong». Все команды — <code>.help</code>.\n\n"
        "ℹ️ Telegram Premium для подключения не обязателен — по сообщениям сервисов, с мая 2026. "
        "Если пункта нет, обновите Telegram; на старых версиях раздел может быть только у Premium.\n"
        "⚠️ Команды работают только в личных чатах и только когда их пишете вы."
    )


async def sub_text(uid) -> str:
    return (
        f"💳 <b>Тарифы</b>\n{await sub_line(uid)}\n\n"
        f"🔥 <b>КОМБО: PREMIUM + VIP сразу</b> — всего <b>{config.PRICES[3]}⭐</b> за {config.SUB_DAYS} дн. каждой (выгодно!)\n{TIER_TEXT[3]}\n\n"
        f"⭐ <b>PREMIUM</b> — {config.PRICES[1]}⭐ / {config.SUB_DAYS} дн.\n{TIER_TEXT[1]}\n\n"
        f"👑 <b>VIP</b> — {config.PRICES[2]}⭐ / {config.SUB_DAYS} дн.\n{TIER_TEXT[2]}\n\n"
        "<i>PREMIUM и VIP — независимые подписки: можно держать обе, у каждой свой срок. Действуют функции самой высокой из активных. "
        "Повторная покупка продлевает подписку. Бесплатно: основные команды, игры, серии, утилиты и сохранение удалённых сообщений. "
        "Есть промокод — /promo КОД.</i>"
    )


def sub_kb():
    return back_kb([_btn(f"🔥 КОМБО PREMIUM+VIP · {config.PRICES[3]}⭐", "pay:3")],
                   [_btn(f"⭐ PREMIUM · {config.PRICES[1]}⭐", "pay:1"), _btn(f"👑 VIP · {config.PRICES[2]}⭐", "pay:2")],
                   [_btn("🎁 Подарить подписку другу", "m:gift")])


def gift_kb():
    return back_kb([_btn(f"🎁 КОМБО другу · {config.PRICES[3]}⭐", "pay:g3")],
                   [_btn(f"🎁 PREMIUM · {config.PRICES[1]}⭐", "pay:g1"), _btn(f"🎁 VIP · {config.PRICES[2]}⭐", "pay:g2")],
                   [_btn("⬅️ К тарифам", "m:sub")])


async def profile_text(uid, bot) -> str:
    me = await bot.me()
    refs = (await db.fetchone("SELECT COUNT(*) c FROM settings WHERE key='ref' AND value=?", (str(uid),)))["c"]
    saved = (await db.fetchone("SELECT COUNT(*) c FROM saved s JOIN connections c ON c.conn_id=s.conn_id WHERE c.user_id=?", (uid,)))["c"]
    save_on = await db.get_s(uid, "save", "1") == "1"
    return (
        f"👤 <b>Профиль</b>\nID: <code>{uid}</code>\n{await sub_line(uid)}\n"
        f"Подключено аккаунтов: {await _connected(uid)}\n"
        f"Сохранение удалённых: {'включено' if save_on else 'выключено (/startsave)'} · в базе: {saved}\n"
        f"Приглашено друзей: {refs}\n\n"
        f"Ваша ссылка: <code>https://t.me/{me.username}?start=ref_{uid}</code>"
    )


async def page(key: str, uid: int, bot):
    """Возвращает (текст, клавиатура) для экрана меню или None."""
    if key == "home":
        return await home_text(uid, bot), home_kb(uid)
    if key == "cmds":
        return "📖 <b>Команды</b>\nВыберите раздел. 🔒 — нужен платный тариф.\nСписок одной строкой: <code>.help</code> в любом чате.", cmds_kb()
    if key in SECTIONS and key in _visible():
        return section_text(key), section_kb(key)
    if key == "connect":
        return connect_text((await bot.me()).username), back_kb([_btn("🩺 Проверить подключение", "m:diag")])
    if key == "sub":
        return await sub_text(uid), sub_kb()
    if key == "gift":
        return ("🎁 <b>Подарить подписку другу</b>\nОплатите подарок — бот пришлёт вам <b>код</b>. Передайте его другу: он отправит боту "
                f"<code>/promo КОД</code> и получит подписку на {config.SUB_DAYS} дн. Код одноразовый."), gift_kb()
    if key == "profile":
        return await profile_text(uid, bot), back_kb([_btn("👥 Пригласить друга", "m:ref")])
    if key == "promo":
        return "🎟 <b>Промокод</b>\nОтправьте боту сообщение:\n<code>/promo ВАШ_КОД</code>", back_kb()
    if key == "ref":
        me = await bot.me()
        return (f"👥 <b>Пригласи друга</b>\nЗа каждого друга, который подключит бота, вы получаете +{config.REF_DAYS} дн. PREMIUM.\n\n"
                f"Ваша ссылка:\n<code>https://t.me/{me.username}?start=ref_{uid}</code>"), back_kb()
    if key == "diag":
        return await saver.diag_text(bot, uid), back_kb([_btn("🔄 Обновить", "m:diag")])
    if key == "about":
        return (f"ℹ️ <b>О боте</b>\nВерсия: <code>{config.VERSION}</code>\n"
                f"Команд: {len([c for c in CMDS if not c.hidden])} · разделов: {len(_visible())}\n\n"
                "Анимации, игры, медиа-инструменты, утилиты, серии, модерация и сохранение удалённых сообщений — прямо в ваших личных чатах."), back_kb()
    return None


async def _guard(m: Message) -> bool:
    if m.from_user.id in db.BANNED:
        await m.answer("⛔ Вы заблокированы администратором.")
        return False
    return True


async def _show(m: Message, bot: Bot, key: str):
    if await _guard(m):
        text, kb = await page(key, m.from_user.id, bot)
        await m.answer(text, reply_markup=kb)


@router.message(CommandStart())
async def start(m: Message, bot: Bot, command: CommandObject = None):
    uid = m.from_user.id
    if uid in db.BANNED:
        return await m.answer("⛔ Вы заблокированы администратором.")
    await db.set_s(uid, "started", "1")
    arg = (command.args or "") if command else ""
    if arg.startswith("ref_") and arg[4:].isdigit() and int(arg[4:]) != uid and await db.get_s(uid, "ref") is None:
        await db.set_s(uid, "ref", arg[4:])
    await _show(m, bot, "home")


@router.message(Command("menu", "help"))
async def menu_cmd(m: Message, bot: Bot):
    await _show(m, bot, "home")


@router.message(Command("connect"))
async def connect_cmd(m: Message, bot: Bot):
    await _show(m, bot, "connect")


@router.message(Command("tariffs", "sub", "buy"))
async def tariffs_cmd(m: Message, bot: Bot):
    await _show(m, bot, "sub")


@router.message(Command("profile"))
async def profile_cmd(m: Message, bot: Bot):
    await _show(m, bot, "profile")


@router.callback_query(F.data.startswith("m:"))
async def on_menu(cb: CallbackQuery, bot: Bot):
    res = await page(cb.data[2:], cb.from_user.id, bot)
    if res is None:
        return await cb.answer()
    text, kb = res
    if len(text) > 4000:
        text = text[:3950].rsplit("\n", 1)[0] + "\n… (полный список: .help)"
    try:
        await cb.message.edit_text(text, reply_markup=kb)
    except TelegramBadRequest:
        pass
    await cb.answer()


@router.callback_query(F.data.startswith("buy:"))
async def on_buy_page(cb: CallbackQuery, bot: Bot):
    text, kb = await page("sub", cb.from_user.id, bot)
    try:
        await cb.message.edit_text(text, reply_markup=kb)
    except TelegramBadRequest:
        pass
    await cb.answer()


@router.callback_query(F.data.startswith("pay:"))
async def on_pay(cb: CallbackQuery):
    if cb.from_user.id in db.BANNED:
        return await cb.answer("Вы заблокированы", show_alert=True)
    raw = cb.data[4:]
    gift = raw.startswith("g")
    kind = int(raw[1:] if gift else raw) if (raw[1:] if gift else raw).isdigit() else 0
    if kind not in PRODUCT:
        return await cb.answer()
    await cb.message.answer_invoice(
        title=("Подарок: " if gift else "") + f"{PRODUCT[kind]} на {config.SUB_DAYS} дн.",
        description=("Бот пришлёт код, который можно подарить другу. " if gift else "") + TIER_TEXT[kind].replace("\n", ", ")[:200],
        payload=f"{'gift' if gift else 'sub'}:{kind}",
        currency="XTR",
        prices=[LabeledPrice(label=PRODUCT[kind], amount=price(kind))],
    )
    await cb.answer()


@router.pre_checkout_query()
async def pre_checkout(q: PreCheckoutQuery):
    if q.from_user.id in db.BANNED:
        return await q.answer(ok=False, error_message="Вы заблокированы администратором")
    await q.answer(ok=True)


def _items(kind: int, days: int):
    return [(1, days), (2, days)] if kind == 3 else [(kind, days)]


@router.message(F.successful_payment)
async def paid(m: Message, bot: Bot):
    p = m.successful_payment
    uid, charge = m.from_user.id, p.telegram_payment_charge_id
    if await db.fetchone("SELECT 1 FROM payments WHERE charge_id=?", (charge,)):
        return  # повторная доставка того же платежа — второй раз не начисляем
    prefix, _, num = p.invoice_payload.partition(":")
    kind, days = int(num), config.SUB_DAYS
    payload = p.invoice_payload
    code = None
    if prefix == "gift":
        code = "GIFT-" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))
        await db.execute("INSERT INTO promos VALUES(?,?,?,1)", (code, kind, days))
        payload += f":{code}"
    await db.execute("INSERT INTO payments(charge_id,user_id,payload,stars,ts,days) VALUES(?,?,?,?,?,?)", (charge, uid, payload, p.total_amount, time.time(), days))
    log.info("оплата: user=%s payload=%s charge=%s", uid, payload, charge)
    if code:
        await m.answer(f"🎁 <b>Подарок готов:</b> {PRODUCT[kind]} на {days} дн.\nКод для друга: <code>{code}</code>\nОн отправляет боту <code>/promo {code}</code>. Код одноразовый.")
    else:
        await db.grant_many(uid, _items(kind, days))
        what = "КОМБО: PREMIUM и VIP сразу" if kind == 3 else PRODUCT[kind]
        await m.answer(f"🎉 <b>{what}</b> активировано на {days} дн.!\n{await sub_line(uid)}")
    try:
        await bot.send_message(config.ADMIN_ID, f"💰 {'Подарок' if code else 'Покупка'}: <code>{uid}</code> @{m.from_user.username or '—'} · {PRODUCT.get(kind)} · {p.total_amount}⭐", parse_mode="HTML")
    except Exception:
        pass


# ---------- админка ----------
def _admin(m: Message) -> bool:
    return bool(m.from_user and m.from_user.id == config.ADMIN_ID)


def _staff(m: Message) -> bool:
    return bool(m.from_user and db.is_staff(m.from_user.id))


def _tier_arg(s: str):
    return {"0": 0, "free": 0, "1": 1, "premium": 1, "prem": 1, "2": 2, "vip": 2, "combo": 2, "bundle": 2, "all": 2}.get(s.lower())


def _target(m: Message, a: list):
    """user_id из аргумента, из пересланного сообщения или из ответа на него."""
    if a and a[0].isdigit() and len(a[0]) > 5:
        return int(a[0]), a[1:]
    r = m.reply_to_message
    if r:
        fo = getattr(r, "forward_origin", None)
        u = getattr(fo, "sender_user", None) or (r.from_user if r.from_user and r.from_user.id != config.ADMIN_ID else None)
        if u:
            return u.id, a
    return None, a


@router.message(Command("give", "gift"))
async def give(m: Message, bot: Bot):
    if not _admin(m):
        return
    uid, a = _target(m, (m.text or "").split()[1:])
    usage = ("Формат: <code>/give ID premium|vip|both [дней]</code>\n"
             "Две сразу с разным сроком: <code>/give ID premium 30 vip 60</code>\n"
             "Ответом на пересланное сообщение: <code>/give both 30</code>\nСнять: <code>/give ID free</code>")
    if uid is None or not a:
        return await m.answer(usage)
    if a[0].lower() in subtools.FREE_WORDS:
        await db.revoke(uid)
        await db.alog(m.from_user.id, f"снял подписки → {uid}")
        return await m.answer(f"🗑 Подписки {uid} сняты")
    items = subtools.parse_grants(a)
    if not items:
        return await m.answer(usage)
    await db.grant_many(uid, items)
    await db.alog(m.from_user.id, f"выдал {subtools.fmt_items(items)} → {uid}")
    now = await subtools.describe(uid)
    await m.answer(f"✅ {uid}: выдано {subtools.fmt_items(items)}\nСейчас: {now}")
    try:
        await bot.send_message(uid, f"🎁 Вам выданы подписки: {subtools.fmt_items(items)}\n{now}")
    except Exception:
        pass


@router.message(Command("revoke"))
async def revoke(m: Message):
    if not _admin(m):
        return
    uid, a = _target(m, (m.text or "").split()[1:])
    tier = subtools.revoke_tier(a[0] if a else "")
    if uid is None or tier is False:
        return await m.answer("Формат: <code>/revoke ID [premium|vip]</code> — без тарифа снимает всё")
    await db.revoke(uid, tier)
    await db.alog(m.from_user.id, f"снял {subtools.NAME.get(tier, 'все подписки')} → {uid}")
    await m.answer(f"✅ {uid}: снято {subtools.NAME.get(tier, 'всё')}. Осталось: {await subtools.describe(uid)}")


async def _subs_text() -> str:
    rows = await subtools_overview()
    if not rows:
        return "Активных подписок нет"
    return "<b>Подписки</b>\n" + "\n".join(
        f"<code>{uid}</code> — " + " · ".join(f"{subtools.NAME[t]} до {datetime.fromtimestamp(u, config.MSK):%d.%m}" for t, u in sorted(tiers.items()))
        for uid, tiers in rows[:50])


async def subtools_overview():
    return await db.subs_overview()


async def _stats_text() -> str:
    now = time.time()
    day = datetime.now(config.MSK).strftime("%Y-%m-%d")
    one = lambda q, a=(): db.fetchone(q, a)
    users = (await one("SELECT COUNT(DISTINCT user_id) c FROM connections"))["c"]
    started = (await one("SELECT COUNT(*) c FROM settings WHERE key='started'"))["c"]
    active = (await one("SELECT COUNT(*) c FROM settings WHERE key='last_seen' AND CAST(value AS REAL) > ?", (now - 86400,)))["c"]
    by = {r["tier"]: r["c"] for r in await db.fetchall("SELECT tier, COUNT(*) c FROM subscriptions WHERE until > ? GROUP BY tier", (now,))}
    top = await db.fetchall("SELECT cmd, n FROM cmdstat WHERE day=? ORDER BY n DESC LIMIT 5", (day,))
    total = (await one("SELECT COALESCE(SUM(n),0) c FROM cmdstat WHERE day=?", (day,)))["c"]
    lines = [
        "📊 <b>Статистика</b>",
        f"Подключённых аккаунтов: {users} · запускали бота: {started}",
        f"Активных за 24 ч: {active}",
        f"Подписки: PREMIUM {by.get(1, 0)} · VIP {by.get(2, 0)}",
        f"Мини-админов: {len(db.MODS)} · забанено: {len(db.BANNED)}",
        f"Команд сегодня: {total}",
    ]
    if top:
        lines.append("Топ команд: " + ", ".join(f".{r['cmd']} ({r['n']})" for r in top))
    if db.STATE["maint"]:
        lines.append("🛠 Включён режим техработ")
    return "\n".join(lines)


def _spam_text() -> str:
    items = anim.list_active()
    if not items:
        return "🚨 Активного спама сейчас нет"
    return "🚨 <b>Активный спам</b>\n" + "\n".join(
        f"<code>{i['owner']}</code> · чат <code>{i['chat']}</code> · {i['sent']}/{i['total']}" for i in items[:30]
    ) + "\n\nОстановить: <code>/stopspam ID</code> или <code>/stopspam all</code>"


@router.message(Command("spammers"))
async def spammers(m: Message):
    if _staff(m):
        await m.answer(_spam_text())


@router.message(Command("stopspam"))
async def stopspam_cmd(m: Message, bot: Bot):
    if not _staff(m):
        return
    a = (m.text or "").split()[1:]
    if a and a[0].lower() == "all":
        n = len(anim.stop_owner(None))
    elif a and a[0].isdigit():
        n = len(anim.stop_owner(int(a[0])))
    else:
        return await m.answer("Формат: <code>/stopspam ID</code> или <code>/stopspam all</code>. Список: /spammers")
    await m.answer(f"🛑 Остановлено спам-задач: {n}. Пользователь сможет запустить спам снова.")


@router.message(Command("startsave"))
async def startsave_dm(m: Message):
    await db.set_s(m.from_user.id, "save", "1")
    await m.answer("💾 Включено: удалённые для всех и изменённые сообщения собеседников будут приходить сюда. Выключить: /stopsave")


@router.message(Command("stopsave"))
async def stopsave_dm(m: Message):
    await db.set_s(m.from_user.id, "save", "0")
    await m.answer("⏹ Сохранение выключено. Включить: /startsave")


@router.message(Command("addmod"))
async def addmod(m: Message, bot: Bot):
    if not _admin(m):
        return
    uid, _ = _target(m, (m.text or "").split()[1:])
    if uid is None:
        return await m.answer("Формат: <code>/addmod ID</code> или ответом на пересланное сообщение человека")
    await db.add_mod(uid)
    await db.alog(m.from_user.id, f"назначил мини-админа → {uid}")
    await m.answer(f"🛡 {uid} — мини-админ")
    try:
        await bot.send_message(uid, "🛡 Вам выданы права мини-админа: все функции без лимитов. Выдавать подписки нельзя.")
    except Exception:
        pass


@router.message(Command("delmod"))
async def delmod(m: Message):
    if not _admin(m):
        return
    uid, _ = _target(m, (m.text or "").split()[1:])
    if uid is None:
        return await m.answer("Формат: <code>/delmod ID</code>")
    await db.del_mod(uid)
    await db.alog(m.from_user.id, f"снял мини-админа → {uid}")
    await m.answer("✅ Мини-админ снят")


@router.message(Command("mods"))
async def mods(m: Message):
    if _admin(m):
        await m.answer("🛡 <b>Мини-админы</b>\n" + ("\n".join(f"<code>{u}</code>" for u in sorted(db.MODS)) or "пока нет"))


@router.message(Command("diag"))
async def diag(m: Message, bot: Bot):
    await m.answer(await saver.diag_text(bot, m.from_user.id))


@router.message(Command("version"))
async def version(m: Message):
    await m.answer(f"ℹ️ Версия бота: <code>{config.VERSION}</code>")


@router.message(Command("id"))
async def my_id(m: Message):
    await m.answer(f"Ваш ID: <code>{m.from_user.id}</code>")


@router.message(Command("subs"))
async def subs(m: Message):
    if _staff(m):
        await m.answer(await _subs_text())


@router.message(Command("stats"))
async def stats(m: Message):
    if _staff(m):
        await m.answer(await _stats_text())
