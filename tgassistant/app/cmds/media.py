import asyncio
import io
import os
import tempfile

from aiogram.types import BufferedInputFile
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

from ..registry import command

IMG = {"photo", "sticker"}
AUD = {"voice", "audio"}
VID = {"video", "video_note"}


def _source(ctx, kinds):
    for m in (ctx.msg, ctx.reply):
        if not m:
            continue
        if m.photo and "photo" in kinds:
            return "photo", m.photo[-1].file_id
        if m.sticker and "sticker" in kinds and not m.sticker.is_animated and not m.sticker.is_video:
            return "sticker", m.sticker.file_id
        if m.video and "video" in kinds:
            return "video", m.video.file_id
        if m.video_note and "video_note" in kinds:
            return "video_note", m.video_note.file_id
        if m.voice and "voice" in kinds:
            return "voice", m.voice.file_id
        if m.audio and "audio" in kinds:
            return "audio", m.audio.file_id
        if m.document and (m.document.mime_type or "").startswith("image/") and "photo" in kinds:
            return "photo", m.document.file_id
    return None, None


async def _need(ctx, kinds, hint):
    kind, fid = _source(ctx, kinds)
    if not fid:
        await ctx.edit(f"Ответьте командой на {hint}")
        return None, None
    await ctx.edit("⏳ Обрабатываю…")
    buf = io.BytesIO()
    await ctx.bot.download(fid, destination=buf)
    return kind, buf.getvalue()


def _open(data):
    return Image.open(io.BytesIO(data)).convert("RGBA")


def _bytes(img, fmt="PNG", **kw):
    b = io.BytesIO()
    if fmt == "JPEG":
        img = _rgb(img)
    img.save(b, fmt, **kw)
    return b.getvalue()


def _rgb(img):
    bg = Image.new("RGB", img.size, "white")
    bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
    return bg


def _square(img, size=None):
    s = min(img.size)
    l, t = (img.width - s) // 2, (img.height - s) // 2
    img = img.crop((l, t, l + s, t + s))
    return img.resize((size, size), Image.LANCZOS) if size else img


async def _photo(ctx, img_bytes, name="img.jpg"):
    await ctx.bot.send_photo(ctx.chat_id, BufferedInputFile(img_bytes, name), **ctx.bc)
    await ctx.delete_cmd()


def _ffmpeg_bin():
    import shutil
    p = shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


async def ffmpeg(data: bytes, in_ext: str, out_ext: str, *args) -> bytes:
    exe = _ffmpeg_bin()
    if not exe:
        raise RuntimeError("ffmpeg не найден (pip install imageio-ffmpeg)")
    with tempfile.TemporaryDirectory() as d:
        ip, op = os.path.join(d, "in." + in_ext), os.path.join(d, "out." + out_ext)
        with open(ip, "wb") as f:
            f.write(data)
        try:
            proc = await asyncio.create_subprocess_exec(
                exe, "-y", "-loglevel", "error", "-i", ip, *args, op,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            raise RuntimeError("ffmpeg не установлен на сервере")
        _, err = await proc.communicate()
        if proc.returncode:
            raise RuntimeError(err.decode(errors="ignore")[-200:])
        with open(op, "rb") as f:
            return f.read()


def _ext(kind):
    return {"video": "mp4", "video_note": "mp4", "voice": "ogg", "audio": "mp3"}.get(kind, "bin")


# ---------- изображения ----------
@command("sticker", section="media", tier=1, help="сделать стикер из изображения (ответом на фото)")
async def sticker(ctx):
    _, data = await _need(ctx, IMG, "фото или картинку")
    if not data:
        return

    def work():
        img = _open(data)
        k = 512 / max(img.size)
        return _bytes(img.resize((max(1, int(img.width * k)), max(1, int(img.height * k))), Image.LANCZOS), "WEBP")

    await ctx.bot.send_sticker(ctx.chat_id, BufferedInputFile(await asyncio.to_thread(work), "s.webp"), **ctx.bc)
    await ctx.delete_cmd()


@command("round", section="media", tier=1, help="изображение в круглый формат (стикер)")
async def round_(ctx):
    _, data = await _need(ctx, IMG, "фото")
    if not data:
        return

    def work():
        img = _square(_open(data), 512)
        mask = Image.new("L", img.size, 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 511, 511), fill=255)
        img.putalpha(mask)
        return _bytes(img, "WEBP")

    await ctx.bot.send_sticker(ctx.chat_id, BufferedInputFile(await asyncio.to_thread(work), "r.webp"), **ctx.bc)
    await ctx.delete_cmd()


@command("ramka", section="media", tier=1, help="обернуть картинку в пиксельную Minecraft-рамку")
async def ramka(ctx):
    _, data = await _need(ctx, IMG, "фото")
    if not data:
        return

    def work():
        size, b = 512, 28
        img = _square(_open(data), size - 2 * b)
        canvas = Image.new("RGB", (size, size), "#2b1d12")
        d = ImageDraw.Draw(canvas)
        colors = ["#2b1d12", "#6b4a2b", "#9c7340", "#c49a6c"]
        step = b // len(colors)
        for i, col in enumerate(colors):
            d.rectangle((i * step, i * step, size - 1 - i * step, size - 1 - i * step), outline=col, width=step)
        for x in range(0, size, 32):
            for y in (0, size - 8):
                d.rectangle((x, y, x + 15, y + 7), fill="#5a3d22")
            for xx in (0, size - 8):
                d.rectangle((xx, x, xx + 7, x + 15), fill="#5a3d22")
        canvas.paste(_rgb(img), (b, b))
        return _bytes(canvas, "PNG")

    await _photo(ctx, await asyncio.to_thread(work), "ramka.png")


@command("crop", section="media", tier=1, usage="[w:h]", help="обрезать изображение по центру (по умолчанию 1:1)")
async def crop(ctx):
    _, data = await _need(ctx, IMG, "фото")
    if not data:
        return
    try:
        rw, rh = [float(x) for x in (ctx.args or "1:1").split(":")]
    except ValueError:
        rw, rh = 1.0, 1.0

    def work():
        img = _open(data)
        w, h = img.size
        tw, th = (w, w * rh / rw) if w * rh / rw <= h else (h * rw / rh, h)
        l, t = (w - tw) / 2, (h - th) / 2
        return _bytes(img.crop((int(l), int(t), int(l + tw), int(t + th))), "JPEG", quality=92)

    await _photo(ctx, await asyncio.to_thread(work))


@command("resize", section="media", tier=1, usage="[ширина] [высота] | [50%]", help="изменить размер изображения")
async def resize(ctx):
    _, data = await _need(ctx, IMG, "фото")
    if not data:
        return
    a = ctx.args.split()

    def work():
        img = _open(data)
        if a and a[0].endswith("%") and a[0][:-1].isdigit():
            k = max(1, min(400, int(a[0][:-1]))) / 100
            size = (int(img.width * k), int(img.height * k))
        elif a and a[0].isdigit():
            w = min(4000, int(a[0]))
            h = min(4000, int(a[1])) if len(a) > 1 and a[1].isdigit() else int(img.height * w / img.width)
            size = (w, h)
        else:
            size = (img.width // 2, img.height // 2)
        return _bytes(img.resize((max(1, size[0]), max(1, size[1])), Image.LANCZOS), "JPEG", quality=92)

    await _photo(ctx, await asyncio.to_thread(work))


@command("rotate", section="media", tier=1, usage="[градусы]", help="повернуть изображение (по умолчанию 90°)")
async def rotate(ctx):
    _, data = await _need(ctx, IMG, "фото")
    if not data:
        return
    deg = int(ctx.args) if ctx.args.lstrip("-").isdigit() else 90
    await _photo(ctx, await asyncio.to_thread(lambda: _bytes(_open(data).rotate(-deg, expand=True), "JPEG", quality=92)))


@command("removebg", section="media", tier=1, help="удалить фон с изображения (нужен rembg на сервере)")
async def removebg(ctx):
    _, data = await _need(ctx, IMG, "фото")
    if not data:
        return
    try:
        from rembg import remove
    except ImportError:
        return await ctx.edit("⚠️ Установите на сервере: <code>pip install rembg onnxruntime</code>")
    out = await asyncio.to_thread(remove, data)
    await ctx.bot.send_document(ctx.chat_id, BufferedInputFile(out, "nobg.png"), **ctx.bc)
    await ctx.delete_cmd()


@command("enhance", section="media", tier=1, help="улучшить качество изображения")
async def enhance(ctx):
    _, data = await _need(ctx, IMG, "фото")
    if not data:
        return

    def work():
        img = _rgb(_open(data))
        k = min(1.6, 2400 / max(img.size))
        if k > 1:
            img = img.resize((int(img.width * k), int(img.height * k)), Image.LANCZOS)
        img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=3))
        img = ImageEnhance.Contrast(img).enhance(1.1)
        img = ImageEnhance.Color(img).enhance(1.1)
        return _bytes(img, "JPEG", quality=95)

    await _photo(ctx, await asyncio.to_thread(work))


@command("wanted", section="media", tier=1, help="постер «Разыскивается» из фото")
async def wanted(ctx):
    _, data = await _need(ctx, IMG, "фото")
    if not data:
        return

    def work():
        W, H = 700, 960
        photo = ImageOps.colorize(ImageOps.grayscale(_square(_rgb(_open(data)), 500)), "#2b1b0e", "#f0dcaa")
        c = Image.new("RGB", (W, H), "#e6cf9a")
        d = ImageDraw.Draw(c)
        d.rectangle((15, 15, W - 16, H - 16), outline="#3b2a14", width=8)
        d.text((W // 2, 100), "WANTED", font=ImageFont.load_default(size=120), fill="#3b2a14", anchor="mm")
        c.paste(photo, ((W - 500) // 2, 190))
        d.rectangle(((W - 500) // 2 - 4, 186, (W + 500) // 2 + 3, 693), outline="#3b2a14", width=6)
        d.text((W // 2, 760), "DEAD OR ALIVE", font=ImageFont.load_default(size=64), fill="#3b2a14", anchor="mm")
        d.text((W // 2, 850), "$ 1 000 000", font=ImageFont.load_default(size=72), fill="#3b2a14", anchor="mm")
        return _bytes(c, "JPEG", quality=92)

    await _photo(ctx, await asyncio.to_thread(work))


# ---------- фото + видео ----------
@command("blur", section="media", tier=1, usage="[сила]", help="размыть фото или видео")
async def blur(ctx):
    kind, data = await _need(ctx, IMG | VID, "фото или видео")
    if not data:
        return
    r = min(50, int(ctx.args)) if ctx.args.isdigit() else 8
    if kind in IMG:
        return await _photo(ctx, await asyncio.to_thread(lambda: _bytes(_open(data).filter(ImageFilter.GaussianBlur(r)), "JPEG", quality=92)))
    out = await ffmpeg(data, "mp4", "mp4", "-vf", f"boxblur={r}:1", "-c:a", "copy")
    await _send_video(ctx, kind, out)


@command("compress", section="media", tier=1, help="сжать фото или видео")
async def compress(ctx):
    kind, data = await _need(ctx, IMG | {"video"}, "фото или видео")
    if not data:
        return
    if kind in IMG:
        def work():
            img = _rgb(_open(data))
            img.thumbnail((1280, 1280))
            return _bytes(img, "JPEG", quality=35)
        return await _photo(ctx, await asyncio.to_thread(work))
    out = await ffmpeg(data, "mp4", "mp4", "-vf", "scale='min(640,iw)':-2", "-c:v", "libx264", "-crf", "32", "-preset", "veryfast", "-c:a", "aac", "-b:a", "64k")
    await _send_video(ctx, kind, out)


async def _send_video(ctx, kind, out):
    f = BufferedInputFile(out, "v.mp4")
    if kind == "video_note":
        await ctx.bot.send_video_note(ctx.chat_id, f, **ctx.bc)
    else:
        await ctx.bot.send_video(ctx.chat_id, f, **ctx.bc)
    await ctx.delete_cmd()


# ---------- аудио / видео ----------
@command("audio", section="media", tier=1, help="извлечь аудио из видео")
async def audio(ctx):
    kind, data = await _need(ctx, VID, "видео")
    if not data:
        return
    out = await ffmpeg(data, "mp4", "mp3", "-vn", "-acodec", "libmp3lame", "-q:a", "3")
    await ctx.bot.send_audio(ctx.chat_id, BufferedInputFile(out, "audio.mp3"), **ctx.bc)
    await ctx.delete_cmd()


def _tts(text):
    from gtts import gTTS
    buf = io.BytesIO()
    gTTS(text, lang="ru").write_to_fp(buf)
    return buf.getvalue()


@command("voice", section="media", tier=1, usage="[текст]", help="аудио → голосовое / .voice текст — озвучка")
async def voice(ctx):
    kind, fid = _source(ctx, AUD | VID)
    if fid:
        kind, data = await _need(ctx, AUD | VID, "аудио")
        out = await ffmpeg(data, _ext(kind), "ogg", "-vn", "-c:a", "libopus", "-b:a", "48k")
    elif ctx.args:
        await ctx.edit("⏳ Озвучиваю…")
        mp3 = await asyncio.to_thread(_tts, ctx.args)
        out = await ffmpeg(mp3, "mp3", "ogg", "-c:a", "libopus", "-b:a", "48k")
    else:
        return await ctx.edit("Ответьте на аудио/видео или напишите <code>.voice текст</code>")
    await ctx.bot.send_voice(ctx.chat_id, BufferedInputFile(out, "v.ogg"), **ctx.bc)
    await ctx.delete_cmd()


@command("volume", section="media", tier=1, usage="[1.1–5]", help="увеличить громкость гс, кружка или видео")
async def volume(ctx):
    kind, data = await _need(ctx, AUD | VID, "голосовое, кружок или видео")
    if not data:
        return
    try:
        k = min(5.0, max(1.1, float(ctx.args.replace(",", "."))))
    except ValueError:
        k = 2.0
    if kind in AUD:
        out = await ffmpeg(data, _ext(kind), "ogg", "-af", f"volume={k}", "-c:a", "libopus", "-b:a", "48k")
        await ctx.bot.send_voice(ctx.chat_id, BufferedInputFile(out, "v.ogg"), **ctx.bc)
        return await ctx.delete_cmd()
    out = await ffmpeg(data, "mp4", "mp4", "-af", f"volume={k}", "-c:v", "copy")
    await _send_video(ctx, kind, out)


@command("fast", section="media", tier=1, usage="[0.5–2]", help="изменить скорость гс, кружка или видео")
async def fast(ctx):
    kind, data = await _need(ctx, AUD | VID, "голосовое, кружок или видео")
    if not data:
        return
    try:
        k = min(2.0, max(0.5, float(ctx.args.replace(",", "."))))
    except ValueError:
        k = 1.5
    if kind in AUD:
        out = await ffmpeg(data, _ext(kind), "ogg", "-af", f"atempo={k}", "-c:a", "libopus", "-b:a", "48k")
        await ctx.bot.send_voice(ctx.chat_id, BufferedInputFile(out, "v.ogg"), **ctx.bc)
        return await ctx.delete_cmd()
    try:
        out = await ffmpeg(data, "mp4", "mp4", "-filter_complex", f"[0:v]setpts=PTS/{k}[v];[0:a]atempo={k}[a]", "-map", "[v]", "-map", "[a]")
    except RuntimeError:
        out = await ffmpeg(data, "mp4", "mp4", "-vf", f"setpts=PTS/{k}", "-an")
    await _send_video(ctx, kind, out)


@command("krom", section="media", tier=1, help="конвертировать видео в кружок Telegram")
async def krom(ctx):
    _, data = await _need(ctx, {"video"}, "видео")
    if not data:
        return
    out = await ffmpeg(
        data, "mp4", "mp4", "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=384:384",
        "-t", "60", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac",
    )
    await ctx.bot.send_video_note(ctx.chat_id, BufferedInputFile(out, "v.mp4"), **ctx.bc)
    await ctx.delete_cmd()
