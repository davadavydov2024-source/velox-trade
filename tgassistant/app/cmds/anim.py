import asyncio
import html
import random
import time

from .. import config, db
from ..registry import command

esc = html.escape


async def _need_text(ctx):
    t = ctx.text_arg()
    if not t:
        await ctx.edit(f"Нужен текст: <code>.{ctx.msg.text.split()[0][1:] if ctx.msg.text else 'cmd'} привет</code>")
    return t


@command("print", section="anim", tier=1, usage="[текст]", help="эффект печати текста")
async def print_(ctx):
    t = await _need_text(ctx)
    if not t:
        return
    n = len(t)
    step = max(1, n // 20)
    for i in range(step, n + step, step):
        i = min(i, n)
        await ctx.edit(esc(t[:i]) + ("▌" if i < n else ""))
        await asyncio.sleep(0.5)


@command("arg", section="anim", tier=1, usage="[текст]", help="анимация появления текста")
async def arg(ctx):
    t = await _need_text(ctx)
    if not t:
        return
    for k in range(6):
        out = "".join(c if (c == " " or random.random() < k / 5) else random.choice("░▒▓█#@%&*") for c in t)
        await ctx.edit(esc(out))
        await asyncio.sleep(0.6)


@command("scrl", section="anim", tier=1, usage="[текст]", help="анимация прокрутки текста")
async def scrl(ctx):
    t = await _need_text(ctx)
    if not t:
        return
    w = 14
    padded = " " * w + t + " " * w
    total = len(padded) - w
    step = max(1, total // 25)
    for i in range(0, total, step):
        await ctx.edit(f"<code>{esc(padded[i:i + w])}</code>")
        await asyncio.sleep(0.5)
    await ctx.edit(esc(t))


@command("glit", section="anim", tier=1, usage="[текст]", help="анимация с эффектом глитча")
async def glit(ctx):
    t = await _need_text(ctx)
    if not t:
        return
    for _ in range(6):
        out = "".join(random.choice("▒▓░#@$%&?!") if (c != " " and random.random() < 0.3) else c for c in t)
        await ctx.edit(esc(out))
        await asyncio.sleep(0.5)
    await ctx.edit(esc(t))


@command("stairs", section="anim", tier=1, usage="[текст]", help="каждое слово отдельным сообщением")
async def stairs(ctx):
    t = await _need_text(ctx)
    if not t:
        return
    await ctx.delete_cmd()
    for w in t.split()[:ctx.limit(10**6, 30)]:
        await ctx.send(esc(w))
        await asyncio.sleep(0.5)


@command("wave", section="anim", tier=1, usage="[текст]", help="нарастающая лесенка слов")
async def wave(ctx):
    t = await _need_text(ctx)
    if not t:
        return
    words = t.split()[:ctx.limit(10**6, 20)]
    await ctx.delete_cmd()
    for i in range(1, len(words) + 1):
        await ctx.send(esc(" ".join(words[:i])))
        await asyncio.sleep(0.5)


@command("letters", section="anim", tier=1, usage="[текст]", help="каждая буква отдельным сообщением")
async def letters(ctx):
    t = await _need_text(ctx)
    if not t:
        return
    await ctx.delete_cmd()
    for ch in [c for c in t if not c.isspace()][:ctx.limit(10**6, 40)]:
        await ctx.send(esc(ch))
        await asyncio.sleep(0.4)


@command("ghoul", section="anim", tier=1, help="анимация 1000-7")
async def ghoul(ctx):
    n = 1000
    for _ in range(15):
        await ctx.edit(f"{n} − 7 = <b>{n - 7}</b>")
        n -= 7
        await asyncio.sleep(0.6)
    await ctx.edit("👹 я гуль")


@command("love", section="anim", tier=1, help="красивая анимация сердца")
async def love(ctx):
    rows = ["⬜❤️❤️⬜❤️❤️⬜", "❤️❤️❤️❤️❤️❤️❤️", "❤️❤️❤️❤️❤️❤️❤️", "⬜❤️❤️❤️❤️❤️⬜", "⬜⬜❤️❤️❤️⬜⬜", "⬜⬜⬜❤️⬜⬜⬜"]
    for col in ["🤍", "💛", "🧡", "💚", "💙", "💜", "🩷", "❤️"]:
        await ctx.edit("\n".join(r.replace("❤️", col) for r in rows))
        await asyncio.sleep(0.7)


_spam_stop: set = set()
ACTIVE: dict = {}  # (conn_id, chat_id) -> {"owner", "chat", "sent", "total", "admin"}


def list_active():
    return list(ACTIVE.values())


def stop_owner(owner_id=None) -> list:
    """Остановить активный спам владельца (или всех при None). Запустить снова он сможет сам."""
    stopped = []
    for key, info in ACTIVE.items():
        if owner_id is None or info["owner"] == owner_id:
            info["admin"] = True
            _spam_stop.add(key)
            stopped.append(info["owner"])
    return stopped


@command("spam", section="anim", tier=1, usage="[количество] [текст]", help="спам: до 10 000 сообщений, затем перерыв 20 мин (у админов без лимита)")
async def spam(ctx):
    parts = ctx.args.split(maxsplit=1)
    if len(parts) < 2 or not parts[0].isdigit():
        return await ctx.edit("Формат: <code>.spam 5 привет</code>")
    key = (ctx.conn_id, ctx.chat_id)
    if key in ACTIVE:
        return await ctx.edit("Спам в этом чате уже идёт. Остановить: <code>.stopspam</code>")
    if not ctx.is_staff:
        wait = float(await db.get_s(ctx.owner_id, "spam_next", "0")) - time.time()
        if wait > 0:
            return await ctx.edit(f"⏳ Спам на перезарядке: ещё {int(wait // 60)} мин {int(wait % 60)} с")
    n = ctx.limit(max(1, int(parts[0])), config.SPAM_MAX)
    _spam_stop.discard(key)
    info = {"owner": ctx.owner_id, "chat": ctx.chat_id, "sent": 0, "total": n, "admin": False}
    ACTIVE[key] = info
    await ctx.delete_cmd()
    delay = 0.1 if ctx.is_staff else 0.35
    try:
        for _ in range(n):
            if key in _spam_stop:
                break
            await ctx.send_safe(esc(parts[1]))
            info["sent"] += 1
            await asyncio.sleep(delay)
    finally:
        _spam_stop.discard(key)
        ACTIVE.pop(key, None)
        if info["admin"]:  # остановил админ: без перерыва, можно запустить снова
            try:
                await ctx.bot.send_message(ctx.owner_id, "⛔ Ваш спам остановил администратор. Вы можете запустить его снова.")
            except Exception:
                pass
        elif not ctx.is_staff:
            await db.set_s(ctx.owner_id, "spam_next", time.time() + config.SPAM_COOLDOWN)


@command("stopspam", section="anim", tier=1, usage="[ID]", help="остановить спам в этом чате (админам: .stopspam ID — остановить спам пользователя)")
async def stopspam(ctx):
    a = ctx.args.strip()
    if a.isdigit() and ctx.is_staff:
        n = len(stop_owner(int(a)))
        return await ctx.edit(f"🛑 Остановлено спам-задач: {n}")
    _spam_stop.add((ctx.conn_id, ctx.chat_id))
    await ctx.edit("🛑 Спам остановлен")


async def _fake(ctx, title, lines):
    n = len(lines)
    for i, line in enumerate(lines, 1):
        k = i * 10 // n
        await ctx.edit(f"<b>{title}</b>\n{'█' * k}{'░' * (10 - k)} {i * 100 // n}%\n<i>{line}</i>")
        await asyncio.sleep(1.1)
    await ctx.edit(f"<b>{title}</b>\n{'█' * 10} 100%\n😄 шутка, ничего не произошло")


@command("hack", section="anim", tier=1, help="пугающая анимация взлома (шуточная)")
async def hack(ctx):
    await _fake(ctx, "💻 Взлом", ["Подключение к серверу…", "Подбор пароля…", "Обход защиты…", "Получение доступа…", "Загрузка данных…"])


@command("ddos", section="anim", tier=1, help="пугающая анимация DDoS (шуточная)")
async def ddos(ctx):
    await _fake(ctx, "🌐 DDoS", ["Запуск ботнета…", "Отправка пакетов…", "Нагрузка растёт…", "Сервер не отвечает…"])


@command("ban", section="anim", tier=1, help="пугающая анимация бана (шуточная)")
async def ban(ctx):
    await _fake(ctx, "🚫 Бан", ["Проверка аккаунта…", "Формирование жалоб…", "Отправка в модерацию…", "Применение санкций…"])


@command("dox", section="anim", tier=1, help="пугающая анимация поиска данных (шуточная)")
async def dox(ctx):
    await _fake(ctx, "🔎 Поиск данных", ["Поиск профиля…", "Имя: ██████", "Город: ██████", "Телефон: +7 ███ ███-██-██", "Сборка досье…"])


@command("snos", section="anim", tier=1, help="пугающая анимация сноса (шуточная)")
async def snos(ctx):
    await _fake(ctx, "📨 Снос", ["Подготовка жалоб…", "Отправка волны 1…", "Отправка волны 2…", "Ожидание ответа…"])
