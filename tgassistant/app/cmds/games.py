import html
import json
import random
import re
import time

from .. import db
from ..registry import command

NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
WORDS = [w for w in (
    "книга школа стена земля вишня ветка лодка кошка мышка ручка сумка птица рыбка зебра слово "
    "песня город улица дверь крыша печка весна осень зимой радио театр танец музей замок билет "
    "багаж огонь вилка ложка ножик чашка пицца сосна берег озеро грузы лимон манго груша арбуз "
    "перец чудак герой район отряд район корона жёлудь"
).split() if len(w) == 5]
WORDS = [w.replace("ё", "е") for w in WORDS]


async def _get(ctx):
    return await db.get_cj(ctx.conn_id, ctx.chat_id, "game")


async def _save(ctx, g):
    await db.set_cj(ctx.conn_id, ctx.chat_id, "game", g)


async def _stop(ctx):
    await db.del_c(ctx.conn_id, ctx.chat_id, "game")


# ---------- крестики-нолики ----------
def _ttt_render(b):
    cells = [("❌" if v == "X" else "⭕" if v == "O" else NUM[i]) for i, v in enumerate(b)]
    return "\n".join("".join(cells[r * 3:r * 3 + 3]) for r in range(3))


def _ttt_win(b):
    for a, c, d in LINES:
        if b[a] and b[a] == b[c] == b[d]:
            return b[a]
    return None


@command("крестики", "ttt", section="games", help="крестики-нолики (вы ❌, собеседник ⭕, ходы цифрами 1–9)")
async def ttt(ctx):
    g = {"kind": "ttt", "board": [""] * 9, "turn": "X"}
    await _save(ctx, g)
    await ctx.edit(f"❌⭕ <b>Крестики-нолики</b>\nХодит ❌ (вы). Пишите цифру клетки.\n\n{_ttt_render(g['board'])}")


async def _ttt_move(ctx, g, text):
    if not re.fullmatch(r"[1-9]", text):
        return
    side = "X" if ctx.sender_id == ctx.owner_id else "O"
    if side != g["turn"]:
        return
    i = int(text) - 1
    if g["board"][i]:
        return
    g["board"][i] = side
    win = _ttt_win(g["board"])
    board = _ttt_render(g["board"])
    if win:
        await _stop(ctx)
        return await ctx.send(f"{board}\n\n🏆 Победили {'❌' if win == 'X' else '⭕'}!")
    if all(g["board"]):
        await _stop(ctx)
        return await ctx.send(f"{board}\n\n🤝 Ничья!")
    g["turn"] = "O" if side == "X" else "X"
    await _save(ctx, g)
    await ctx.send(f"{board}\n\nХодит {'❌ (вы)' if g['turn'] == 'X' else '⭕ (собеседник)'}")


# ---------- быки и коровы ----------
@command("быки", "bulls", section="games", help="быки и коровы: угадайте 4-значное число")
async def bulls(ctx):
    digits = random.sample("0123456789", 4)
    await _save(ctx, {"kind": "bulls", "secret": "".join(digits), "tries": 0})
    await ctx.edit("🐂🐄 <b>Быки и коровы</b>\nЯ загадал 4 разные цифры. Присылайте догадки (4 цифры).\n🐂 — цифра на месте, 🐄 — есть, но не на месте.")


async def _bulls_move(ctx, g, text):
    if not re.fullmatch(r"\d{4}", text):
        return
    s = g["secret"]
    b = sum(1 for x, y in zip(s, text) if x == y)
    c = sum(min(s.count(d), text.count(d)) for d in set(text)) - b
    g["tries"] += 1
    if b == 4:
        await _stop(ctx)
        return await ctx.send(f"🎉 Угадано за {g['tries']} попыт.! Число: <b>{s}</b>")
    await _save(ctx, g)
    await ctx.send(f"{text}: 🐂 {b}  🐄 {c}  (попытка {g['tries']})")


# ---------- слова (Wordle) ----------
def _wordle(secret, guess):
    res = ["⬛"] * 5
    rem = list(secret)
    for i, (s, g) in enumerate(zip(secret, guess)):
        if s == g:
            res[i] = "🟩"
            rem[i] = None
    for i, g in enumerate(guess):
        if res[i] == "⬛" and g in rem:
            res[i] = "🟨"
            rem[rem.index(g)] = None
    return "".join(res)


@command("слова", "words", section="games", help="Wordle: угадайте слово из 5 букв за 6 попыток")
async def words(ctx):
    await _save(ctx, {"kind": "words", "word": random.choice(WORDS), "tries": []})
    await ctx.edit("🔤 <b>Wordle</b>\nЗагадано слово из 5 букв. У вас 6 попыток — присылайте слова.\n🟩 на месте, 🟨 есть в слове, ⬛ нет.")


async def _words_move(ctx, g, text):
    t = text.lower().replace("ё", "е")
    if not re.fullmatch(r"[а-я]{5}", t):
        return
    g["tries"].append(t)
    row = _wordle(g["word"], t)
    left = 6 - len(g["tries"])
    if t == g["word"]:
        await _stop(ctx)
        return await ctx.send(f"{row} {html.escape(t)}\n🎉 Угадано за {len(g['tries'])}!")
    if left <= 0:
        await _stop(ctx)
        return await ctx.send(f"{row} {html.escape(t)}\n😔 Попытки кончились. Слово: <b>{g['word']}</b>")
    await _save(ctx, g)
    await ctx.send(f"{row} {html.escape(t)}  (осталось {left})")


# ---------- сапёр ----------
DIG = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]


@command("сапер", "сапёр", "sapper", section="games", help="сапёр 8×8 (клетки под спойлерами)")
async def sapper(ctx):
    w = h = 8
    mines = set(random.sample([(x, y) for x in range(w) for y in range(h)], 10))
    rows = []
    for y in range(h):
        row = []
        for x in range(w):
            if (x, y) in mines:
                c = "💣"
            else:
                c = DIG[sum((x + dx, y + dy) in mines for dx in (-1, 0, 1) for dy in (-1, 0, 1))]
            row.append(f"<tg-spoiler>{c}</tg-spoiler>")
        rows.append("".join(row))
    await ctx.edit("💣 <b>Сапёр</b> 8×8, 10 мин. Открывайте клетки по одной.\n\n" + "\n".join(rows))


# ---------- питомец ----------
def _bar(v):
    k = int(max(0, min(100, v)) // 10)
    return "█" * k + "░" * (10 - k)


@command("pet", section="games", usage="[feed|play|name имя]", help="виртуальный питомец")
async def pet(ctx):
    raw = await db.get_s(ctx.owner_id, "pet")
    now = time.time()
    p = json.loads(raw) if raw else {"name": "Бублик", "hunger": 30, "mood": 70, "t": now}
    hrs = (now - p["t"]) / 3600
    p["hunger"] = min(100, p["hunger"] + hrs * 4)
    p["mood"] = max(0, p["mood"] - hrs * 3)
    p["t"] = now
    a = ctx.args.split(maxsplit=1)
    act = a[0].lower() if a else ""
    note = ""
    if act == "feed":
        p["hunger"] = max(0, p["hunger"] - 35)
        p["mood"] = min(100, p["mood"] + 5)
        note = "🍖 Покормлен!"
    elif act == "play":
        p["mood"] = min(100, p["mood"] + 25)
        p["hunger"] = min(100, p["hunger"] + 10)
        note = "🎾 Поиграли!"
    elif act == "name" and len(a) > 1:
        p["name"] = a[1][:20]
        note = "✏️ Имя изменено"
    await db.set_s(ctx.owner_id, "pet", json.dumps(p, ensure_ascii=False))
    face = "😿" if p["hunger"] > 80 or p["mood"] < 20 else "😺" if p["mood"] > 60 else "🐱"
    await ctx.edit(
        f"{face} <b>{html.escape(p['name'])}</b>\nСытость: {_bar(100 - p['hunger'])}\nНастроение: {_bar(p['mood'])}\n{note}\n"
        "<i>.pet feed · .pet play · .pet name Имя</i>"
    )


# ---------- виселица ----------
HANG_WORDS = ["программа", "телефон", "компьютер", "картошка", "лошадь", "радуга", "география", "мороженое", "библиотека", "светофор", "крокодил", "парашют"]


def _hang_render(g):
    shown = " ".join(c if c in g["guessed"] else "_" for c in g["word"])
    wrong = [c for c in g["guessed"] if c not in g["word"]]
    return f"{shown}\n❤️ Жизней: {g['lives']}" + (f"\n❌ Ошибки: {', '.join(wrong)}" if wrong else "")


@command("виселица", "hangman", section="games", help="виселица: угадайте слово по буквам (пишите по одной букве)")
async def hangman(ctx):
    g = {"kind": "hang", "word": random.choice(HANG_WORDS), "guessed": [], "lives": 6}
    await _save(ctx, g)
    await ctx.edit(f"🪢 <b>Виселица</b>\nПишите по одной букве или слово целиком.\n\n{_hang_render(g)}")


async def _hang_move(ctx, g, text):
    t = text.lower().replace("ё", "е")
    if not re.fullmatch(r"[а-я]+", t):
        return
    if len(t) == len(g["word"]) and t != g["word"]:
        g["lives"] -= 1
        await _save(ctx, g) if g["lives"] > 0 else await _stop(ctx)
        return await ctx.send(f"❌ Нет, это не «{html.escape(t)}»." + (f"\n\n{_hang_render(g)}" if g["lives"] > 0 else f"\n😔 Проиграли. Слово: <b>{g['word']}</b>"))
    if t == g["word"] or (len(t) == 1 and set(g["word"]) <= set(g["guessed"]) | {t}):
        await _stop(ctx)
        return await ctx.send(f"🎉 Угадано! Слово: <b>{g['word']}</b>")
    if len(t) != 1 or t in g["guessed"]:
        return
    g["guessed"].append(t)
    if t not in g["word"]:
        g["lives"] -= 1
        if g["lives"] <= 0:
            await _stop(ctx)
            return await ctx.send(f"😔 Проиграли. Слово: <b>{g['word']}</b>")
    await _save(ctx, g)
    await ctx.send(_hang_render(g))


# ---------- угадай число ----------
@command("угадай", "guess", section="games", usage="[макс]", help="угадай число: бот подсказывает «больше/меньше»")
async def guess(ctx):
    hi = min(10**6, max(10, int(ctx.args))) if ctx.args.isdigit() else 100
    await _save(ctx, {"kind": "guess", "secret": random.randint(1, hi), "hi": hi, "tries": 0})
    await ctx.edit(f"🎯 <b>Угадай число</b> от 1 до {hi}. Присылайте числа — подскажу «больше» или «меньше».")


async def _guess_move(ctx, g, text):
    if not re.fullmatch(r"\d{1,7}", text):
        return
    n = int(text)
    g["tries"] += 1
    if n == g["secret"]:
        await _stop(ctx)
        return await ctx.send(f"🎉 Угадано за {g['tries']} попыт.! Это <b>{n}</b>")
    await _save(ctx, g)
    await ctx.send(f"{n}: {'⬆️ больше' if n < g['secret'] else '⬇️ меньше'} (попытка {g['tries']})")


# ---------- устный счёт ----------
def _math_q():
    a, b = random.randint(2, 20), random.randint(2, 12)
    op = random.choice("+-*")
    return f"{a} {'×' if op == '*' else op} {b}", eval(f"{a}{op}{b}")  # a, b — только наши числа


@command("матем", "math", section="games", help="устный счёт: решайте примеры, пишите ответ числом")
async def mathquiz(ctx):
    q, ans = _math_q()
    await _save(ctx, {"kind": "math", "answer": ans, "score": 0})
    await ctx.edit(f"🧮 <b>Устный счёт</b>\nПишите ответ числом. Остановить: <code>.стопигра</code>\n\n<b>{q} = ?</b>")


async def _math_move(ctx, g, text):
    if not re.fullmatch(r"-?\d{1,6}", text):
        return
    if int(text) == g["answer"]:
        g["score"] += 1
        q, g["answer"] = _math_q()
        await _save(ctx, g)
        return await ctx.send(f"✅ Верно! Счёт: {g['score']}\n\n<b>{q} = ?</b>")
    await ctx.send("❌ Неверно, попробуйте ещё раз")


@command("шашки", "море", section="games", help="(в разработке)")
async def wip(ctx):
    await ctx.edit("🚧 Эта игра пока в разработке")


@command("стопигра", "stopgame", section="games", help="остановить игру")
async def stopgame(ctx):
    await _stop(ctx)
    await ctx.edit("🛑 Игра остановлена")


async def on_move(ctx, text: str):
    text = (text or "").strip()
    if not text:
        return
    g = await _get(ctx)
    if not g:
        return
    kind = g.get("kind")
    if kind == "ttt":
        await _ttt_move(ctx, g, text)
    elif kind == "bulls":
        await _bulls_move(ctx, g, text)
    elif kind == "words":
        await _words_move(ctx, g, text)
    elif kind == "hang":
        await _hang_move(ctx, g, text)
    elif kind == "guess":
        await _guess_move(ctx, g, text)
    elif kind == "math":
        await _math_move(ctx, g, text)
