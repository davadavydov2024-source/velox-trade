"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Undo2, X } from "lucide-react";

const COLORS = ["#ffffff", "#000000", "#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#0a84ff", "#bf5af2"];
const SIZES = [4, 9, 16];

type Stroke = { color: string; size: number; pts: [number, number][] };

/**
 * Рисование поверх картинки истории: кисть (8 цветов, 3 толщины), отмена шага, «Готово» → JPEG.
 * Картинка с сервера сначала скачивается как blob — иначе холст «загрязняется» чужим доменом и не экспортируется.
 */
export function DrawEditor({ src, onDone, onCancel }: { src: string; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[2]);
  const [size, setSize] = useState(SIZES[1]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [count, setCount] = useState(0);

  useEffect(() => {
    setTarget(document.getElementById("mx-root") ?? document.body);
  }, []);

  function paint(ctx: CanvasRenderingContext2D, s: Stroke) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.pts.length === 1) {
      ctx.beginPath();
      ctx.arc(s.pts[0][0], s.pts[0][1], s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  function redraw() {
    const c = canvasRef.current;
    const img = imgRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    strokes.current.forEach((s) => paint(ctx, s));
    if (current.current) paint(ctx, current.current);
  }

  useEffect(() => {
    let cancelled = false;
    let objUrl = "";
    (async () => {
      try {
        let url = src;
        if (!src.startsWith("blob:") && !src.startsWith("data:")) {
          const r = await fetch(src);
          if (!r.ok) throw new Error("fetch");
          objUrl = URL.createObjectURL(await r.blob());
          url = objUrl;
        }
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          imgRef.current = img;
          const sc = Math.min(1, 1280 / Math.max(img.width, img.height));
          const c = canvasRef.current!;
          c.width = Math.round(img.width * sc);
          c.height = Math.round(img.height * sc);
          setReady(true);
          redraw();
        };
        img.onerror = () => !cancelled && setErr("Не удалось открыть картинку");
        img.src = url;
      } catch {
        if (!cancelled) setErr("Не удалось загрузить картинку для рисования");
      }
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height];
  }
  const scaleK = () => {
    const c = canvasRef.current!;
    return c.width / c.getBoundingClientRect().width;
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { color, size: size * scaleK(), pts: [pos(e)] };
    redraw();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!current.current) return;
    current.current.pts.push(pos(e));
    redraw();
  }
  function up() {
    if (!current.current) return;
    strokes.current.push(current.current);
    current.current = null;
    setCount(strokes.current.length);
    redraw();
  }
  function undo() {
    strokes.current.pop();
    setCount(strokes.current.length);
    redraw();
  }
  function done() {
    canvasRef.current?.toBlob((b) => (b ? onDone(b) : setErr("Не удалось сохранить рисунок")), "image/jpeg", 0.9);
  }

  const node = (
    <div className="absolute inset-0 flex flex-col" style={{ zIndex: 120, background: "#000" }}>
      <div className="flex items-center gap-2 px-3 text-white" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)", paddingBottom: 8 }}>
        <button onClick={onCancel} className="p-2" aria-label="Отмена"><X size={24} /></button>
        <div className="flex-1" />
        <button onClick={undo} disabled={count === 0} className="p-2 disabled:opacity-30" aria-label="Отменить шаг"><Undo2 size={22} /></button>
        <button onClick={done} disabled={!ready} className="h-10 px-4 rounded-full font-semibold flex items-center gap-1.5 disabled:opacity-40" style={{ background: "var(--mx-accent)", color: "var(--mx-accent-text)" }}>
          <Check size={18} /> Готово
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-2">
        {err ? (
          <p className="text-white/70 text-center px-6">{err}</p>
        ) : (
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{ maxWidth: "100%", maxHeight: "100%", touchAction: "none", borderRadius: 12, opacity: ready ? 1 : 0, transition: "opacity .2s" }}
          />
        )}
      </div>
      <div className="px-4 pt-3 mx-safe-bottom" style={{ paddingBottom: 12 }}>
        <div className="flex items-center justify-center gap-2.5 mb-3">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={c} className="rounded-full transition-transform" style={{ width: 28, height: 28, background: c, border: color === c ? "3px solid var(--mx-accent)" : "2px solid rgba(255,255,255,0.35)", transform: color === c ? "scale(1.18)" : "none" }} />
          ))}
        </div>
        <div className="flex items-center justify-center gap-5">
          {SIZES.map((s) => (
            <button key={s} onClick={() => setSize(s)} aria-label={`Толщина ${s}`} className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: size === s ? "rgba(255,255,255,0.18)" : "transparent" }}>
              <span className="rounded-full" style={{ width: s + 4, height: s + 4, background: color, border: "1px solid rgba(255,255,255,0.4)" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
  return target ? createPortal(node, target) : null;
}
