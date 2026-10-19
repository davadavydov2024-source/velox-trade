import asyncio
import hashlib
import html
import json
import random
import re
import time
from urllib.parse import quote

import aiohttp

from .. import db
from ..registry import command

UA = {"User-Agent": "tgassistant-bot/1.0"}


async def _json(url, **kw):
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15), headers=UA) as s:
        async with s.get(url, **kw) as r:
            return await r.json(content_type=None)


async def _private(ctx, text):
    """Личные данные отправляем владельцу в личку с ботом, а не в чат (его видит собеседник)."""
    try:
        await ctx.bot.send_message(ctx.owner_id, text)
        await ctx.delete_cmd()
    except Exception:
        await ctx.edit(text)


async def _load(uid, key, default):
    raw = await db.get_s(uid, key)
    return json.loads(raw) if raw else default


async def _save(uid, key, obj):
    await db.set_s(uid, key, json.dumps(obj, ensure_ascii=False))


# ---------- перевод / курсы / википедия ----------
LANGS = {"ru", "en", "de", "fr", "es", "it", "uk", "pl", "tr", "zh", "ja", "ko", "ar", "pt", "nl", "cs", "be", "kk"}


@command("tr", "translate", section="utils", usage="[язык] [текст]", help="перевод (по умолчанию ru↔en), можно ответом на сообщение")
async def tr(ctx):
    parts = ctx.args.split(maxsplit=1)
    tgt, text = None, ctx.args
    if parts and parts[0].lower() in LANGS:
        tgt, text = parts[0].lower(), (parts[1] if len(parts) > 1 else "")
    if not text and ctx.reply:
        text = ctx.reply.text or ctx.reply.caption or ""
    if not text:
        return await ctx.edit("Формат: <code>.tr en привет</code> или ответом на сообщение")
    cyr = bool(re.search("[а-яё]", text.lower()))
    src = "ru" if cyr else "en"
    tgt = tgt or ("en" if cyr else "ru")
    if src == tgt:
        return await ctx.edit(html.escape(text))
    d = await _json("https://api.mymemory.translated.net/get", params={"q": text[:500], "langpair": f"{src}|{tgt}"})
    await ctx.edit(f"🌐 {html.escape(d['responseData']['translatedText'])}")


@command("курс", "rate", section="utils", usage="[сумма] [валюта] [в валюту]", help="курс валют: .курс 100 usd rub")
async def rate(ctx):
    toks = [t.upper().replace(",", ".") for t in ctx.args.split() if t.lower() not in ("в", "to")]
    amount = 1.0
    if toks and re.fullmatch(r"\d+(\.\d+)?", toks[0]):
        amount = float(toks.pop(0))
    pairs = [(toks[0], toks[1] if len(toks) > 1 else "RUB")] if toks else [("USD", "RUB"), ("EUR", "RUB")]
    lines = []
    for base, q in pairs:
        d = await _json(f"https://open.er-api.com/v6/latest/{quote(base)}")
        r = (d.get("rates") or {}).get(q) if d.get("result") == "success" else None
        if r is None:
            lines.append(f"⚠️ {html.escape(base)}→{html.escape(q)}: не нашёл")
        else:
            lines.append(f"💱 {amount:g} {base} = <b>{amount * r:,.2f}</b> {q}".replace(",", " "))
    await ctx.edit("\n".join(lines))


COINS = {"btc": "bitcoin", "eth": "ethereum", "ton": "the-open-network", "sol": "solana", "usdt": "tether",
         "bnb": "binancecoin", "doge": "dogecoin", "xrp": "ripple", "ltc": "litecoin", "trx": "tron"}


@command("crypto", section="utils", usage="[btc|eth|ton|sol…]", help="курс криптовалюты в USD и RUB")
async def crypto(ctx):
    sym = (ctx.args.split() or ["btc"])[0].lower()
    cid = COINS.get(sym)
    if not cid:
        return await ctx.edit("Доступно: " + ", ".join(COINS))
    d = await _json("https://api.coingecko.com/api/v3/simple/price", params={"ids": cid, "vs_currencies": "usd,rub"})
    p = d.get(cid)
    if not p:
        return await ctx.edit("⚠️ Не удалось получить курс, попробуйте позже")
    await ctx.edit(f"🪙 <b>{sym.upper()}</b>: ${p['usd']:,.2f} · {p['rub']:,.0f} ₽".replace(",", " "))


@command("wiki", section="utils", usage="[запрос]", help="краткая справка из Википедии")
async def wiki(ctx):
    q = ctx.text_arg().strip()
    if not q:
        return await ctx.edit("Формат: <code>.wiki Эйнштейн</code>")
    d = await _json(f"https://ru.wikipedia.org/api/rest_v1/page/summary/{quote(q.replace(' ', '_'))}")
    if "extract" not in d:
        return await ctx.edit("📚 Ничего не нашёл")
    ext = d["extract"]
    ext = ext if len(ext) < 700 else ext[:700].rsplit(" ", 1)[0] + "…"
    url = (d.get("content_urls") or {}).get("desktop", {}).get("page", "")
    await ctx.edit(f"📚 <b>{html.escape(d.get('title', q))}</b>\n{html.escape(ext)}\n{url}")


# ---------- развлечения ----------
@command("ship", section="fun", usage="[имя1] [имя2]", help="совместимость двух имён")
async def ship(ctx):
    names = ctx.args.replace("+", " ").split()
    if len(names) < 2:
        return await ctx.edit("Формат: <code>.ship Аня Дима</code>")
    a, b = sorted([names[0].lower(), names[1].lower()])
    pct = int(hashlib.sha256(f"{a}|{b}".encode()).hexdigest(), 16) % 101
    verdict = "💔 Не судьба" if pct < 30 else "🙂 Есть шанс" if pct < 60 else "💞 Хорошая пара" if pct < 85 else "💘 Идеально!"
    await ctx.edit(f"❤️ {html.escape(names[0])} + {html.escape(names[1])}\n{'█' * (pct // 10)}{'░' * (10 - pct // 10)} <b>{pct}%</b>\n{verdict}")


TRUTH = ["Что тебя больше всего смущало в детстве?", "Какая твоя самая странная привычка?", "Чего ты боишься больше всего?",
         "Какую песню ты слушаешь тайком?", "О чём ты мечтаешь прямо сейчас?", "Какой самый глупый поступок ты совершал(а)?",
         "Что бы ты сделал(а), если бы стал(а) невидимым на день?", "Какой подарок был лучшим в жизни?"]
DARES = ["Отправь в чат самое смешное селфи.", "Напиши следующее сообщение только эмодзи.", "Расскажи анекдот в голосовом.",
         "Смени аватарку на час на любую смешную.", "Придумай рифму к имени собеседника.", "Пришли голосовое с лучшим кошачьим «мяу».",
         "Назови 5 вещей рядом за 10 секунд.", "Напиши комплимент следующему человеку из контактов."]


@command("truth", section="fun", help="вопрос для игры «правда или действие»")
async def truth(ctx):
    await ctx.edit(f"🗣 <b>Правда:</b> {random.choice(TRUTH)}")


@command("dare", section="fun", help="задание для игры «правда или действие»")
async def dare(ctx):
    await ctx.edit(f"🎯 <b>Действие:</b> {random.choice(DARES)}")


# ---------- азбука Морзе / хэш ----------
_LAT = {"a": ".-", "b": "-...", "c": "-.-.", "d": "-..", "e": ".", "f": "..-.", "g": "--.", "h": "....", "i": "..", "j": ".---",
        "k": "-.-", "l": ".-..", "m": "--", "n": "-.", "o": "---", "p": ".--.", "q": "--.-", "r": ".-.", "s": "...", "t": "-",
        "u": "..-", "v": "...-", "w": ".--", "x": "-..-", "y": "-.--", "z": "--..",
        "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----."}
_CYR = {"а": ".-", "б": "-...", "в": ".--", "г": "--.", "д": "-..", "е": ".", "ж": "...-", "з": "--..", "и": "..", "й": ".---",
        "к": "-.-", "л": ".-..", "м": "--", "н": "-.", "о": "---", "п": ".--.", "р": ".-.", "с": "...", "т": "-", "у": "..-",
        "ф": "..-.", "х": "....", "ц": "-.-.", "ч": "---.", "ш": "----", "щ": "--.-", "ъ": "--.--", "ы": "-.--", "ь": "-..-",
        "э": "..-..", "ю": "..--", "я": ".-.-"}
_DIG = {k: v for k, v in _LAT.items() if k.isdigit()}


@command("morse", section="utils", usage="[текст]", help="текст → азбука Морзе (рус/лат)")
async def morse(ctx):
    t = ctx.text_arg().lower().replace("ё", "е")
    if not t:
        return await ctx.edit("Формат: <code>.morse привет</code>")
    code = {**_LAT, **_CYR}
    out = " ".join("/" if c == " " else code.get(c, "") for c in t).replace("  ", " ")
    await ctx.edit(f"<code>{out}</code>")


@command("unmorse", section="utils", usage="[en] [код]", help="Морзе → текст (по умолчанию русский, .unmorse en — латиница)")
async def unmorse(ctx):
    a = ctx.text_arg()
    table = _LAT
    if a.lower().startswith("en "):
        a = a[3:]
    else:
        table = {**_DIG, **_CYR}
    rev = {v: k for k, v in table.items()}
    words = [" ".join(rev.get(sym, "?") for sym in w.split()).replace(" ", "") for w in re.split(r"\s*/\s*", a.strip())]
    await ctx.edit(html.escape(" ".join(words)))


@command("hash", section="utils", usage="[текст]", help="MD5 и SHA-256 хэш текста")
async def hash_(ctx):
    t = ctx.text_arg()
    if not t:
        return await ctx.edit("Формат: <code>.hash текст</code>")
    b = t.encode()
    await ctx.edit(f"MD5: <code>{hashlib.md5(b).hexdigest()}</code>\nSHA-256: <code>{hashlib.sha256(b).hexdigest()}</code>")


# ---------- личные заметки и задачи (приходят вам в личку с ботом) ----------
@command("todo", section="utils", usage="[add текст | done N | clear]", help="список дел (показывается только вам, в личке с ботом)")
async def todo(ctx):
    items = await _load(ctx.owner_id, "todo", [])
    a = ctx.args.split(maxsplit=1)
    act = a[0].lower() if a else ""
    if act == "add" and len(a) > 1:
        items.append(a[1])
    elif act == "done" and len(a) > 1 and a[1].isdigit() and 0 < int(a[1]) <= len(items):
        items.pop(int(a[1]) - 1)
    elif act == "clear":
        items = []
    await _save(ctx.owner_id, "todo", items)
    body = "\n".join(f"{i}. {html.escape(t)}" for i, t in enumerate(items, 1)) or "пусто"
    await _private(ctx, f"📝 <b>Дела</b>\n{body}\n<i>.todo add текст · .todo done N · .todo clear</i>")


@command("note", "notes", section="utils", usage="save имя текст | имя | del имя | list", help="личные заметки (показываются только вам)")
async def note(ctx):
    notes = await _load(ctx.owner_id, "notes", {})
    a = ctx.args.split(maxsplit=2)
    act = a[0].lower() if a else "list"
    if act == "save" and len(a) == 3:
        notes[a[1].lower()] = a[2]
        await _save(ctx.owner_id, "notes", notes)
        return await _private(ctx, f"💾 Заметка «{html.escape(a[1])}» сохранена")
    if act == "del" and len(a) >= 2:
        notes.pop(a[1].lower(), None)
        await _save(ctx.owner_id, "notes", notes)
        return await _private(ctx, "🗑 Удалено")
    if act == "list":
        return await _private(ctx, "🗒 <b>Заметки</b>: " + (", ".join(notes) or "пока нет") + "\n<i>.note save имя текст · .note имя</i>")
    await _private(ctx, f"🗒 <b>{html.escape(act)}</b>\n{html.escape(notes.get(act, 'такой заметки нет'))}")


# ---------- автоответчик и отложенные сообщения ----------
@command("afk", section="profile", tier=1, usage="[причина]", help="автоответчик: собеседникам отвечает «меня нет» (раз в 30 мин на чат)")
async def afk(ctx):
    await db.set_s(ctx.owner_id, "afk", ctx.args or "Сейчас не могу ответить, напишу позже")
    await ctx.delete_cmd()
    try:
        await ctx.bot.send_message(ctx.owner_id, "💤 Автоответчик включён. Выключить: <code>.unafk</code>")
    except Exception:
        pass


@command("unafk", section="profile", tier=1, help="выключить автоответчик")
async def unafk(ctx):
    await db.del_s(ctx.owner_id, "afk")
    await ctx.delete_cmd()
    try:
        await ctx.bot.send_message(ctx.owner_id, "✅ Автоответчик выключен")
    except Exception:
        pass


async def afk_reply(ctx):
    """Вызывается для входящих сообщений собеседников."""
    reason = await db.get_s(ctx.owner_id, "afk")
    if not reason or await db.get_tier(ctx.owner_id) < 1:
        return
    last = float(await db.get_c(ctx.conn_id, ctx.chat_id, "afk_last", "0"))
    if time.time() - last < 1800:
        return
    await db.set_c(ctx.conn_id, ctx.chat_id, "afk_last", time.time())
    await ctx.send(f"💤 {html.escape(reason)}")


_U = {"": 60, "s": 1, "с": 1, "m": 60, "м": 60, "h": 3600, "ч": 3600}


@command("later", section="utils", tier=1, usage="10m текст", help="отправить сообщение в этот чат через время (пока бот не перезапущен)")
async def later(ctx):
    m = re.match(r"^(\d+)\s*([smhсмч]?)\s+(.+)$", ctx.args, re.S)
    if not m:
        return await ctx.edit("Формат: <code>.later 30m текст</code> (s/m/h)")
    secs = ctx.limit(int(m.group(1)) * _U[m.group(2)], 86400)
    text = m.group(3)
    await ctx.delete_cmd()
    try:
        await ctx.bot.send_message(ctx.owner_id, f"⏱ Отправлю через {secs // 60} мин {secs % 60} с: «{html.escape(text[:80])}»")
    except Exception:
        pass

    async def job():
        await asyncio.sleep(secs)
        await ctx.send_safe(html.escape(text))

    asyncio.create_task(job())
