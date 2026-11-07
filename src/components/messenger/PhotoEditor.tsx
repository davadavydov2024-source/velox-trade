"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Check, Crop, EyeOff, Pencil, RotateCcw, RotateCw, Send, Sparkles, Type, Undo2, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";

/**
 * Редактор фото перед отправкой, как в Telegram/Discord: обрезка с пропорциями, поворот и зеркало («ракурс»),
 * рисование кистью, «замазать» (пикселизация), текст, фильтры, подпись. Несколько фото редактируются по очереди.
 */

type Tool = "crop" | "draw" | "blur" | "text" | "filter";
type Stroke = { kind: "pen" | "blur"; color: string; size: number; pts: [number, number][] };
type TextItem = { text: string; x: number; y: number; color: string; size: number };
type Rect = { x: number; y: number; w: number; h: number };
type Filter = { name: string; b: number; c: number; s: number; g: number; p: number };

const MAX_SIDE = 1800;
const MIN_CROP = 48;
const COLORS = ["#ffffff", "#000000", "#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#0a84ff", "#bf5af2"];
const SIZES: [string, number][] = [["S", 0.006], ["M", 0.012], ["L", 0.022]];
const RATIOS: [string, number | null][] = [["Свободно", null], ["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["16:9", 16 / 9], ["9:16", 9 / 16]];
const FILTERS: Filter[] = [
  { name: "Оригинал", b: 1, c: 1, s: 1, g: 0, p: 0 },
  { name: "Ч/Б", b: 1, c: 1.05, s: 1, g: 1, p: 0 },
  { name: "Сепия", b: 1.02, c: 1, s: 1, g: 0, p: 0.85 },
  { name: "Яркий", b: 1.04, c: 1.1, s: 1.45, g: 0, p: 0 },
  { name: "Мягкий", b: 1.08, c: 0.88, s: 0.9, g: 0, p: 0 },
  { name: "Контраст", b: 1, c: 1.3, s: 1.05, g: 0, p: 0 },
  { name: "Драма", b: 0.94, c: 1.25, s: 0.75, g: 0, p: 0 },
  { name: "Винтаж", b: 1.05, c: 0.93, s: 0.85, g: 0, p: 0.35 },
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const mkCanvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

async function loadBase(file: File): Promise<HTMLCanvasElement> {
  let src: CanvasImageSource;
  let w = 0, h = 0;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as unknown as ImageBitmapOptions);
    src = bmp; w = bmp.width; h = bmp.height;
  } catch {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const u = URL.createObjectURL(file);
      const i = new Image();
      i.onload = () => { URL.revokeObjectURL(u); res(i); };
      i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); };
      i.src = u;
    });
    src = img; w = img.naturalWidth; h = img.naturalHeight;
  }
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = mkCanvas(w * k, h * k);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function applyFilter(src: HTMLCanvasElement, f: Filter, dst: HTMLCanvasElement) {
  const ctx = dst.getContext("2d")!;
  ctx.clearRect(0, 0, dst.width, dst.height);
  ctx.drawImage(src, 0, 0);
  if (f.b === 1 && f.c === 1 && f.s === 1 && f.g === 0 && f.p === 0) return;
  const img = ctx.getImageData(0, 0, dst.width, dst.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * f.b, g = d[i + 1] * f.b, b = d[i + 2] * f.b;
    r = (r - 128) * f.c + 128; g = (g - 128) * f.c + 128; b = (b - 128) * f.c + 128;
    let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * f.s; g = l + (g - l) * f.s; b = l + (b - l) * f.s;
    if (f.g) { l = 0.2126 * r + 0.7152 * g + 0.0722 * b; r += (l - r) * f.g; g += (l - g) * f.g; b += (l - b) * f.g; }
    if (f.p) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * f.p; g += (sg - g) * f.p; b += (sb - b) * f.p;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}

function makePix(shown: HTMLCanvasElement): HTMLCanvasElement {
  const block = Math.max(8, Math.round(shown.width / 48));
  const small = mkCanvas(shown.width / block, shown.height / block);
  small.getContext("2d")!.drawImage(shown, 0, 0, small.width, small.height);
  const pix = mkCanvas(shown.width, shown.height);
  const px = pix.getContext("2d")!;
  px.imageSmoothingEnabled = false;
  px.drawImage(small, 0, 0, pix.width, pix.height);
  return pix;
}

function strokePath(ctx: CanvasRenderingContext2D, s: Stroke, ox = 0, oy = 0) {
  ctx.lineWidth = s.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  if (s.pts.length === 1) { ctx.arc(s.pts[0][0] - ox, s.pts[0][1] - oy, s.size / 2, 0, Math.PI * 2); return; }
  s.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x - ox, y - oy) : ctx.lineTo(x - ox, y - oy)));
}

/** Рисует поверх картинки: кисть, «замазать» (кусок пикселизованной копии по маске мазка) и текст. */
function drawAnn(ctx: CanvasRenderingContext2D, W: number, H: number, pix: HTMLCanvasElement | null, strokes: Stroke[], texts: TextItem[]) {
  for (const s of strokes) {
    if (s.kind === "pen") {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
      strokePath(ctx, s);
      if (s.pts.length === 1) ctx.fill(); else ctx.stroke();
    } else if (pix) {
      const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
      const bx = Math.floor(clamp(Math.min(...xs) - s.size, 0, W)), by = Math.floor(clamp(Math.min(...ys) - s.size, 0, H));
      const bw = Math.ceil(clamp(Math.max(...xs) + s.size, 0, W)) - bx, bh = Math.ceil(clamp(Math.max(...ys) + s.size, 0, H)) - by;
      if (bw < 1 || bh < 1) continue;
      const tmp = mkCanvas(bw, bh), t = tmp.getContext("2d")!;
      t.drawImage(pix, bx, by, bw, bh, 0, 0, bw, bh);
      const mask = mkCanvas(bw, bh), m = mask.getContext("2d")!;
      m.strokeStyle = "#000"; m.fillStyle = "#000";
      strokePath(m, s, bx, by);
      if (s.pts.length === 1) m.fill(); else m.stroke();
      t.globalCompositeOperation = "destination-in";
      t.drawImage(mask, 0, 0);
      ctx.drawImage(tmp, bx, by);
    }
  }
  for (const t of texts) {
    ctx.font = `800 ${t.size}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = t.size / 7; ctx.lineJoin = "round";
    ctx.strokeStyle = t.color === "#000000" ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.55)";
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
}

export function PhotoEditor({ files, caption, onDone, onCancel }: { files: File[]; caption: string; onDone: (files: File[], caption: string) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<Tool>("draw");
  const [, force] = useState(0);
  const [cap, setCap] = useState(caption);
  const [color, setColor] = useState(COLORS[2]);
  const [sizeI, setSizeI] = useState(1);
  const [fi, setFi] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [box, setBox] = useState({ w: 0, h: 0 });

  const rawRef = useRef<HTMLCanvasElement | null>(null);
  const origRef = useRef<HTMLCanvasElement | null>(null);
  const baseCv = useRef<HTMLCanvasElement>(null);
  const overCv = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const pixRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const texts = useRef<TextItem[]>([]);
  const order = useRef<("s" | "t")[]>([]);
  const cur = useRef<Stroke | null>(null);
  const dirty = useRef(false);
  const results = useRef<File[]>([]);
  const crop = useRef<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const cdrag = useRef<{ mode: string; sx: number; sy: number; start: Rect } | null>(null);
  const tdrag = useRef<{ i: number; dx: number; dy: number } | null>(null);
  const raf = useRef(0);
  const fiRef = useRef(0);

  useEffect(() => { setTarget(document.getElementById("mx-root") ?? document.body); }, []);

  // размер области показа
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [target]);

  const renderOver = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const c = overCv.current, raw = rawRef.current;
      if (!c || !raw) return;
      if (c.width !== raw.width || c.height !== raw.height) { c.width = raw.width; c.height = raw.height; }
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      drawAnn(ctx, c.width, c.height, pixRef.current, cur.current ? [...strokes.current, cur.current] : strokes.current, texts.current);
    });
  };

  /** Пересобирает показанную картинку (с фильтром) из рабочей. */
  const refreshShown = () => {
    const raw = rawRef.current, cv = baseCv.current;
    if (!raw || !cv) return;
    cv.width = raw.width; cv.height = raw.height;
    applyFilter(raw, FILTERS[fiRef.current], cv);
    pixRef.current = makePix(cv);
    crop.current = { x: 0, y: 0, w: raw.width, h: raw.height };
    renderOver();
    force((n) => n + 1);
  };

  // загрузка очередного фото
  useEffect(() => {
    let dead = false;
    setLoading(true);
    loadBase(files[idx]).then((c) => {
      if (dead) return;
      origRef.current = c;
      rawRef.current = mkCanvas(c.width, c.height);
      rawRef.current.getContext("2d")!.drawImage(c, 0, 0);
      strokes.current = []; texts.current = []; order.current = []; cur.current = null; dirty.current = false;
      fiRef.current = 0; setFi(0); setTool("draw"); setRatio(null);
      setLoading(false);
      requestAnimationFrame(refreshShown);
    }).catch(() => { toast("error", "Не удалось открыть фото"); onCancel(); });
    return () => { dead = true; };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Вшивает фильтр, рисунки и текст в рабочую картинку (нужно перед обрезкой/поворотом). */
  const bake = () => {
    const raw = rawRef.current, cv = baseCv.current;
    if (!raw || !cv) return;
    if (!strokes.current.length && !texts.current.length && fiRef.current === 0) return;
    const out = mkCanvas(raw.width, raw.height), o = out.getContext("2d")!;
    o.drawImage(cv, 0, 0);
    drawAnn(o, out.width, out.height, pixRef.current, strokes.current, texts.current);
    rawRef.current = out;
    strokes.current = []; texts.current = []; order.current = [];
    fiRef.current = 0; setFi(0);
    refreshShown();
  };

  const pickTool = (t: Tool) => {
    if (t === "crop") bake();
    setTool(t);
  };

  const transform = (kind: "cw" | "ccw" | "flip") => {
    bake();
    const raw = rawRef.current;
    if (!raw) return;
    const out = kind === "flip" ? mkCanvas(raw.width, raw.height) : mkCanvas(raw.height, raw.width), o = out.getContext("2d")!;
    if (kind === "flip") { o.translate(out.width, 0); o.scale(-1, 1); }
    else { o.translate(out.width / 2, out.height / 2); o.rotate(kind === "cw" ? Math.PI / 2 : -Math.PI / 2); o.translate(-raw.width / 2, -raw.height / 2); }
    o.drawImage(raw, 0, 0);
    rawRef.current = out; dirty.current = true;
    refreshShown();
  };

  const applyCrop = () => {
    const raw = rawRef.current;
    if (!raw) return;
    const r = crop.current;
    if (r.w >= raw.width - 1 && r.h >= raw.height - 1) { toast("info", "Рамка по краям — обрезать нечего"); return; }
    const out = mkCanvas(r.w, r.h);
    out.getContext("2d")!.drawImage(raw, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
    rawRef.current = out; dirty.current = true;
    refreshShown();
  };

  const setRatioFor = (rt: number | null) => {
    setRatio(rt);
    const raw = rawRef.current;
    if (!raw || !rt) return;
    const r = crop.current;
    let w = r.w, h = w / rt;
    if (h > r.h) { h = r.h; w = h * rt; }
    crop.current = { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
    force((n) => n + 1);
  };

  const resetAll = () => {
    const o = origRef.current;
    if (!o) return;
    rawRef.current = mkCanvas(o.width, o.height);
    rawRef.current.getContext("2d")!.drawImage(o, 0, 0);
    strokes.current = []; texts.current = []; order.current = []; dirty.current = false;
    fiRef.current = 0; setFi(0); setRatio(null);
    refreshShown();
  };

  const undo = () => {
    const last = order.current.pop();
    if (last === "s") strokes.current.pop(); else if (last === "t") texts.current.pop(); else { toast("info", "Нечего отменять"); return; }
    renderOver();
    force((n) => n + 1);
  };

  const chooseFilter = (i: number) => {
    // фильтр применяется к картинке под рисунками: уже нарисованное остаётся как есть
    fiRef.current = i; setFi(i); dirty.current = true;
    const raw = rawRef.current, cv = baseCv.current;
    if (!raw || !cv) return;
    applyFilter(raw, FILTERS[i], cv);
    pixRef.current = makePix(cv);
    renderOver();
  };

  // ---- координаты ----
  const toImg = (e: React.PointerEvent): [number, number] => {
    const c = overCv.current!;
    const r = c.getBoundingClientRect();
    return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)];
  };

  const onDown = (e: React.PointerEvent) => {
    const raw = rawRef.current;
    if (!raw) return;
    const [x, y] = toImg(e);
    if (tool === "draw" || tool === "blur") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const base = SIZES[sizeI][1] * raw.width;
      cur.current = { kind: tool === "draw" ? "pen" : "blur", color, size: tool === "draw" ? base : base * 2.4, pts: [[x, y]] };
      renderOver();
    } else if (tool === "text") {
      let best = -1, bd = Infinity;
      texts.current.forEach((t, i) => { const d = Math.hypot(t.x - x, t.y - y); if (d < bd && d < Math.max(t.size * 3, raw.width * 0.12)) { bd = d; best = i; } });
      if (best >= 0) { e.currentTarget.setPointerCapture(e.pointerId); tdrag.current = { i: best, dx: texts.current[best].x - x, dy: texts.current[best].y - y }; }
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const [x, y] = toImg(e);
    if (cur.current) { cur.current.pts.push([x, y]); renderOver(); }
    else if (tdrag.current) { const t = texts.current[tdrag.current.i]; t.x = x + tdrag.current.dx; t.y = y + tdrag.current.dy; renderOver(); }
  };
  const onUp = () => {
    if (cur.current) { strokes.current.push(cur.current); order.current.push("s"); cur.current = null; dirty.current = true; renderOver(); force((n) => n + 1); }
    tdrag.current = null;
  };

  const addText = () => {
    const raw = rawRef.current;
    const v = textDraft.trim();
    if (!raw || !v) return;
    texts.current.push({ text: v.slice(0, 80), x: raw.width / 2, y: raw.height / 2, color, size: Math.round(raw.width * 0.06 * (0.7 + sizeI * 0.45)) });
    order.current.push("t"); dirty.current = true;
    setTextDraft("");
    renderOver(); force((n) => n + 1);
  };

  // ---- рамка обрезки ----
  const fit = (() => {
    const raw = rawRef.current;
    if (!raw || !box.w || !box.h) return 1;
    return Math.min(box.w / raw.width, box.h / raw.height);
  })();
  const dispW = (rawRef.current?.width ?? 1) * fit, dispH = (rawRef.current?.height ?? 1) * fit;

  const cDown = (mode: string) => (e: React.PointerEvent) => {
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    cdrag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...crop.current } };
  };
  const cMove = (e: React.PointerEvent) => {
    const d = cdrag.current, raw = rawRef.current;
    if (!d || !raw) return;
    const dx = (e.clientX - d.sx) / fit, dy = (e.clientY - d.sy) / fit;
    const W = raw.width, H = raw.height, s = d.start;
    if (d.mode === "move") { crop.current = { ...s, x: clamp(s.x + dx, 0, W - s.w), y: clamp(s.y + dy, 0, H - s.h) }; force((n) => n + 1); return; }
    let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
    if (d.mode.includes("l")) x1 = clamp(s.x + dx, 0, x2 - MIN_CROP);
    if (d.mode.includes("r")) x2 = clamp(x2 + dx, x1 + MIN_CROP, W);
    if (d.mode.includes("t")) y1 = clamp(s.y + dy, 0, y2 - MIN_CROP);
    if (d.mode.includes("b")) y2 = clamp(y2 + dy, y1 + MIN_CROP, H);
    if (ratio) {
      let w = x2 - x1, h = w / ratio;
      const top = d.mode.includes("t");
      const maxH = top ? y2 : H - y1;
      if (h > maxH) { h = maxH; w = h * ratio; if (d.mode.includes("l")) x1 = x2 - w; else x2 = x1 + w; }
      if (top) y1 = y2 - h; else y2 = y1 + h;
    }
    crop.current = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    force((n) => n + 1);
  };
  const cUp = () => { cdrag.current = null; };

  // ---- готово ----
  const finishOne = async () => {
    const raw = rawRef.current, cv = baseCv.current;
    if (!raw || !cv) return;
    let file = files[idx];
    if (dirty.current) {
      const out = mkCanvas(raw.width, raw.height), o = out.getContext("2d")!;
      o.drawImage(cv, 0, 0);
      drawAnn(o, out.width, out.height, pixRef.current, strokes.current, texts.current);
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/jpeg", 0.9));
      if (!blob) { toast("error", "Не удалось сохранить фото"); return; }
      file = new File([blob], files[idx].name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    results.current[idx] = file;
    if (idx < files.length - 1) setIdx(idx + 1);
    else onDone(results.current.slice(0, files.length), cap.trim());
  };

  const last = idx >= files.length - 1;
  const raw = rawRef.current;
  const hasAnn = strokes.current.length + texts.current.length > 0;
  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button key={t} onClick={() => pickTool(t)} className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[11.5px]" style={{ color: tool === t ? "var(--mx-accent, #7466f5)" : "#d0d0d6", background: tool === t ? "rgba(255,255,255,0.09)" : "transparent" }}>
      {icon}{label}
    </button>
  );

  if (!target) return null;
  const cr = crop.current;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: "#000", color: "#fff", paddingTop: "env(safe-area-inset-top)", touchAction: "none" }}>
      {/* верх */}
      <div className="flex items-center justify-between px-3 h-[52px] shrink-0">
        <button onClick={onCancel} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }} aria-label="Закрыть"><X size={20} /></button>
        {files.length > 1 && <span className="text-[14px] opacity-80">{idx + 1} / {files.length}</span>}
        <div className="flex items-center gap-2">
          {tool === "crop" && <button onClick={resetAll} className="px-3 h-10 rounded-full text-[14px]" style={{ background: "rgba(255,255,255,0.12)" }}>Сбросить</button>}
          <button onClick={undo} disabled={!hasAnn} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)", opacity: hasAnn ? 1 : 0.4 }} aria-label="Отменить"><Undo2 size={19} /></button>
        </div>
      </div>

      {/* холст */}
      <div ref={areaRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden relative">
        {loading && <p className="absolute opacity-70 text-[14px]">Загрузка…</p>}
        <div className="relative" style={{ width: dispW, height: dispH, visibility: loading ? "hidden" : "visible", overflow: "hidden" }}>
          <canvas ref={baseCv} className="absolute inset-0 w-full h-full" />
          <canvas ref={overCv} className="absolute inset-0 w-full h-full" style={{ touchAction: "none", cursor: tool === "draw" || tool === "blur" ? "crosshair" : "default" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
          {tool === "crop" && raw && (
            <div className="absolute inset-0" style={{ touchAction: "none" }} onPointerMove={cMove} onPointerUp={cUp} onPointerCancel={cUp}>
              <div className="absolute" onPointerDown={cDown("move")} style={{ left: cr.x * fit, top: cr.y * fit, width: cr.w * fit, height: cr.h * fit, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)", border: "1.5px solid #fff", touchAction: "none" }}>
                {[1 / 3, 2 / 3].map((p) => <span key={p} className="absolute inset-x-0 pointer-events-none" style={{ top: `${p * 100}%`, borderTop: "1px solid rgba(255,255,255,.35)" }} />)}
                {[1 / 3, 2 / 3].map((p) => <span key={p} className="absolute inset-y-0 pointer-events-none" style={{ left: `${p * 100}%`, borderLeft: "1px solid rgba(255,255,255,.35)" }} />)}
                {(["tl", "tr", "bl", "br"] as const).map((m) => (
                  <span key={m} onPointerDown={cDown(m)} className="absolute w-9 h-9 flex items-center justify-center" style={{ touchAction: "none", left: m.includes("l") ? -18 : undefined, right: m.includes("r") ? -18 : undefined, top: m.includes("t") ? -18 : undefined, bottom: m.includes("b") ? -18 : undefined }}>
                    <span className="w-4 h-4 rounded-[4px]" style={{ background: "#fff" }} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* настройки инструмента */}
      <div className="shrink-0 px-3 pt-2 min-h-[58px] flex items-center">
        {(tool === "draw" || tool === "blur") && (
          <div className="flex items-center gap-2.5 w-full overflow-x-auto">
            {tool === "draw" && COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label={c} className="w-7 h-7 rounded-full shrink-0" style={{ background: c, outline: color === c ? "2px solid #fff" : "1.5px solid rgba(255,255,255,.35)", outlineOffset: 2 }} />)}
            <span className="flex-1" />
            {SIZES.map(([l], i) => <button key={l} onClick={() => setSizeI(i)} className="w-9 h-9 rounded-full shrink-0 text-[13px] font-semibold" style={{ background: sizeI === i ? "#fff" : "rgba(255,255,255,0.14)", color: sizeI === i ? "#000" : "#fff" }}>{l}</button>)}
          </div>
        )}
        {tool === "text" && (
          <div className="flex items-center gap-2 w-full">
            <input value={textDraft} onChange={(e) => setTextDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addText(); }} maxLength={80} placeholder="Текст на фото" className="flex-1 min-w-0 h-10 rounded-full px-4 text-[15px] outline-none" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }} />
            <button onClick={addText} className="h-10 px-4 rounded-full text-[14px] font-semibold" style={{ background: "#fff", color: "#000" }}>Добавить</button>
          </div>
        )}
        {tool === "text" && <div className="hidden" />}
        {tool === "crop" && (
          <div className="flex items-center gap-2 w-full overflow-x-auto">
            <button onClick={() => transform("ccw")} className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.14)" }} aria-label="Повернуть влево"><RotateCcw size={19} /></button>
            <button onClick={() => transform("cw")} className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.14)" }} aria-label="Повернуть вправо"><RotateCw size={19} /></button>
            <button onClick={() => transform("flip")} className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.14)" }} aria-label="Зеркало"><ArrowLeftRight size={19} /></button>
            <span className="w-px h-6 shrink-0" style={{ background: "rgba(255,255,255,.2)" }} />
            {RATIOS.map(([l, r]) => <button key={l} onClick={() => setRatioFor(r)} className="px-3 h-9 rounded-full shrink-0 text-[13px] font-medium" style={{ background: ratio === r ? "#fff" : "rgba(255,255,255,0.14)", color: ratio === r ? "#000" : "#fff" }}>{l}</button>)}
            <button onClick={applyCrop} className="px-4 h-9 rounded-full shrink-0 text-[13px] font-semibold flex items-center gap-1" style={{ background: "var(--mx-accent, #7466f5)", color: "#fff" }}><Check size={15} /> Обрезать</button>
          </div>
        )}
        {tool === "filter" && (
          <div className="flex items-center gap-2 w-full overflow-x-auto">
            {FILTERS.map((f, i) => <button key={f.name} onClick={() => chooseFilter(i)} className="px-3.5 h-9 rounded-full shrink-0 text-[13px] font-medium" style={{ background: fi === i ? "#fff" : "rgba(255,255,255,0.14)", color: fi === i ? "#000" : "#fff" }}>{f.name}</button>)}
          </div>
        )}
      </div>

      {/* инструменты */}
      <div className="shrink-0 flex gap-1 px-2 pt-1">
        {toolBtn("crop", <Crop size={20} />, "Обрезка")}
        {toolBtn("draw", <Pencil size={20} />, "Рисунок")}
        {toolBtn("blur", <EyeOff size={20} />, "Замазать")}
        {toolBtn("text", <Type size={20} />, "Текст")}
        {toolBtn("filter", <Sparkles size={20} />, "Фильтры")}
      </div>

      {/* подпись и отправка */}
      <div className="shrink-0 flex items-center gap-2 px-3 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
        <input value={cap} onChange={(e) => setCap(e.target.value)} maxLength={1000} placeholder="Добавить подпись…" className="flex-1 min-w-0 h-11 rounded-full px-4 text-[15.5px] outline-none" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }} />
        <button onClick={finishOne} disabled={loading} className="h-11 px-5 rounded-full flex items-center gap-1.5 text-[15px] font-semibold shrink-0" style={{ background: "var(--mx-accent, #7466f5)", color: "#fff", opacity: loading ? 0.6 : 1 }}>
          {last ? <><Send size={17} /> Отправить</> : "Далее"}
        </button>
      </div>
    </div>,
    target,
  );
}
