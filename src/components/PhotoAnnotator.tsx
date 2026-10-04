"use client";

import { useEffect, useRef, useState } from "react";
import { X, Undo2, Eraser, Send, Loader2 } from "lucide-react";

const COLORS = ["#ffffff", "#ff3b30", "#ffd60a", "#34c759", "#ff9800"];
const WIDTHS = [3, 6, 10];
const MAX_SIDE = 1600; // ресайзим большие фото перед рисованием — быстрее и легче для отправки

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };

/**
 * Рисование поверх фото перед отправкой в чат (как в Telegram/WhatsApp) — лёгкая разметка
 * (обвести, стрелка от руки, подпись линией), а не полноценный редактор. Всё рисуется на canvas
 * того же размера, что и фото (с разумным ограничением стороны), поэтому разметка всегда ложится
 * туда, где её провели, независимо от того, как картинка вписана в модалку на экране.
 */
export function PhotoAnnotator({
  file,
  onCancel,
  onSend,
  sending = false,
}: {
  file: File | null;
  onCancel: () => void;
  onSend: (file: File) => void;
  sending?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [ready, setReady] = useState(false);

  // Грузим фото в <img>, подгоняем canvas под его реальные пропорции (с кап-ограничением), рисуем
  // базовую картинку — дальше штрихи просто дорисовываются поверх того же canvas.
  useEffect(() => {
    if (!file) return;
    setReady(false);
    setStrokes([]);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_SIDE || h > MAX_SIDE) {
        const scale = MAX_SIDE / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff"; // подложка: у прозрачных PNG в JPEG иначе будет чёрный фон
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      }
      imgRef.current = img;
      setReady(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Перерисовывает всё с нуля: базовое фото + все сохранённые штрихи — так undo/clear остаются
  // надёжными (не нужно хранить промежуточные снимки canvas).
  function redraw(list: Stroke[]) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const s of list) {
      if (s.points.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    }
  }

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const stroke: Stroke = { color, width, points: [canvasPoint(e)] };
    drawingRef.current = stroke;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(canvasPoint(e));
    redraw([...strokes, drawingRef.current]);
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    const finished = drawingRef.current;
    drawingRef.current = null;
    if (finished.points.length > 1) setStrokes((list) => [...list, finished]);
  }

  function handleUndo() {
    setStrokes((list) => {
      const next = list.slice(0, -1);
      redraw(next);
      return next;
    });
  }

  function handleClear() {
    setStrokes([]);
    redraw([]);
  }

  async function handleSendDrawn() {
    const canvas = canvasRef.current;
    if (!canvas || !file) return;
    // JPEG, а не PNG: фото в PNG легко весит 4+ МБ (лимит загрузки в uploadImage), а в JPEG с
    // качеством 0.85 то же самое с разметкой — в разы легче и визуально неотличимо.
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onSend(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85
    );
  }

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button onClick={onCancel} className="text-white/70 hover:text-white p-1" disabled={sending}>
          <X size={22} />
        </button>
        <p className="text-sm text-white/50">Разметка фото</p>
        <div className="w-7" />
      </div>

      <div ref={wrapRef} className="flex-1 min-h-0 flex items-center justify-center px-3 overflow-hidden">
        {!ready && <Loader2 className="animate-spin text-white/40" size={28} />}
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full rounded-lg touch-none"
          style={{ display: ready ? "block" : "none", cursor: "crosshair" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      <div className="shrink-0 px-4 pt-3 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? "scale-110 border-white" : "border-white/20"}`}
                style={{ background: c }}
                aria-label={`Цвет ${c}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => setWidth(w)}
                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${
                  width === w ? "bg-white/15 border-white/40" : "border-white/15 hover:bg-white/5"
                }`}
                aria-label={`Толщина ${w}`}
              >
                <span className="rounded-full bg-white" style={{ width: w, height: w }} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handleUndo} disabled={strokes.length === 0} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 disabled:opacity-30" title="Отменить штрих">
              <Undo2 size={16} />
            </button>
            <button onClick={handleClear} disabled={strokes.length === 0} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10 disabled:opacity-30" title="Очистить разметку">
              <Eraser size={16} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => file && onSend(file)} disabled={sending} className="btn-secondary flex-1 py-2.5 text-sm disabled:opacity-50">
            Без разметки
          </button>
          <button onClick={handleSendDrawn} disabled={sending || !ready} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
