"use client";

import { Eraser, Paintbrush, RotateCcw, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PREVIEW_MAX } from "@/lib/constants";
import { downscale } from "@/lib/image";
import { applyTouchUp, type Job } from "@/lib/jobs";
import { Spinner, cx, toast } from "./ui";

type Mode = "erase" | "restore";
interface Stroke {
  mode: Mode;
  /** Radius in image pixels. */
  r: number;
  pts: number[]; // x0,y0,x1,y1,…
}
type Backdrop = "checker" | "white" | "black";

const BACKDROP: Record<Backdrop, string> = {
  checker: "repeating-conic-gradient(#d9d9d9 0 25%, #ffffff 0 50%) 50% / 20px 20px",
  white: "#ffffff",
  black: "#111111",
};

/**
 * Full-screen touch-up: one finger paints (Erase removes, Restore brings the original photo back),
 * two fingers pinch/pan. Works on the full-resolution cutout placed inside the original frame,
 * so Restore can bring back parts the AI cut off — even outside the old trim box.
 */
export function TouchUp({ job, onClose }: { job: Job; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const orig = useRef<ImageBitmap | null>(null);
  const pattern = useRef<CanvasPattern | null>(null);
  const base = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const strokes = useRef<Stroke[]>([]);
  const view = useRef({ k: 1, tx: 0, ty: 0, fit: 1 });

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("erase");
  const [size, setSize] = useState(32); // screen px (diameter)
  const [bg, setBg] = useState<Backdrop>("checker");
  const [count, setCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const canRestore = !!job.crop && !!job.originalBlob;

  // ---------------------------------------------------------------- setup
  const applyView = useCallback(() => {
    const c = work.current;
    if (!c) return;
    const { k, tx, ty } = view.current;
    c.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
  }, []);

  const fitView = useCallback(() => {
    const box = boxRef.current;
    const c = work.current;
    if (!box || !c) return;
    const { width: bw, height: bh } = box.getBoundingClientRect();
    const fit = Math.min(bw / c.width, bh / c.height) * 0.94;
    view.current = { k: fit, fit, tx: (bw - c.width * fit) / 2, ty: (bh - c.height * fit) / 2 };
    applyView();
  }, [applyView]);

  const replay = useCallback(() => {
    const ctx = ctxRef.current;
    const c = work.current;
    if (!ctx || !c || !job.full) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(job.full, base.current.x, base.current.y);
    for (const s of strokes.current) drawStroke(s, 0);
  }, [job.full]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!job.full) return;
      let W = job.full.width;
      let H = job.full.height;
      if (canRestore) {
        const o = await createImageBitmap(job.originalBlob!);
        if (cancelled) return o.close();
        orig.current = o;
        W = o.width;
        H = o.height;
        base.current = { x: job.crop!.x, y: job.crop!.y };
      }
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      c.style.position = "absolute";
      c.style.left = "0";
      c.style.top = "0";
      c.style.transformOrigin = "0 0";
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
      const ctx = c.getContext("2d", { willReadFrequently: false })!;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (orig.current) pattern.current = ctx.createPattern(orig.current, "no-repeat");
      work.current = c;
      ctxRef.current = ctx;
      holder.current?.appendChild(c);
      replay();
      fitView();
      setReady(true);
    })().catch(() => toast("Couldn't open touch-up"));
    return () => {
      cancelled = true;
      work.current?.remove();
      if (work.current) work.current.width = work.current.height = 1;
      orig.current?.close();
    };
  }, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const onResize = () => fitView();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitView]);

  // ---------------------------------------------------------------- drawing
  function drawStroke(s: Stroke, from: number) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (s.mode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000";
      ctx.fillStyle = "#000";
    } else {
      if (!pattern.current) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = pattern.current;
      ctx.fillStyle = pattern.current;
    }
    ctx.lineWidth = s.r * 2;
    const p = s.pts;
    if (p.length === 2) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], s.r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    const start = Math.max(0, from - 2);
    ctx.moveTo(p[start], p[start + 1]);
    for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }

  const toImage = (cx_: number, cy_: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    const { k, tx, ty } = view.current;
    return [(cx_ - r.left - tx) / k, (cy_ - r.top - ty) / k] as const;
  };

  const showRing = (x: number, y: number, on: boolean) => {
    const el = ringRef.current;
    const box = boxRef.current;
    if (!el || !box) return;
    const r = box.getBoundingClientRect();
    el.style.opacity = on ? "1" : "0";
    el.style.width = el.style.height = `${size}px`;
    el.style.transform = `translate(${x - r.left - size / 2}px, ${y - r.top - size / 2}px)`;
  };

  // Pointer state: one finger paints, two fingers pinch/pan.
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "none" }
    | { kind: "draw"; stroke: Stroke }
    | { kind: "pinch"; d0: number; mx: number; my: number; k0: number; ix: number; iy: number }
    | { kind: "wait" }
  >({ kind: "none" });

  const onDown = (e: React.PointerEvent) => {
    if (!ready || saving) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const n = ptrs.current.size;
    if (n === 1 && gesture.current.kind === "none") {
      if (mode === "restore" && !canRestore) return;
      const [x, y] = toImage(e.clientX, e.clientY);
      const s: Stroke = { mode, r: size / 2 / view.current.k, pts: [x, y] };
      strokes.current.push(s);
      gesture.current = { kind: "draw", stroke: s };
      drawStroke(s, 0);
      showRing(e.clientX, e.clientY, true);
    } else if (n === 2) {
      // Second finger: cancel the stroke just started and zoom instead.
      if (gesture.current.kind === "draw") {
        strokes.current.pop();
        replay();
      }
      showRing(0, 0, false);
      const [a, b] = [...ptrs.current.values()];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const [ix, iy] = toImage(mx, my);
      gesture.current = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx, my, k0: view.current.k, ix, iy };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === "draw") {
      const [x, y] = toImage(e.clientX, e.clientY);
      const p = g.stroke.pts;
      const lx = p[p.length - 2];
      const ly = p[p.length - 1];
      if (Math.hypot(x - lx, y - ly) < g.stroke.r * 0.15) return;
      p.push(x, y);
      drawStroke(g.stroke, p.length - 2);
      showRing(e.clientX, e.clientY, true);
    } else if (g.kind === "pinch" && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const v = view.current;
      const k = Math.min(v.fit * 12, Math.max(v.fit * 0.6, (g.k0 * d) / g.d0));
      const r = boxRef.current!.getBoundingClientRect();
      v.k = k;
      v.tx = mx - r.left - g.ix * k;
      v.ty = my - r.top - g.iy * k;
      applyView();
    }
  };

  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === "draw") {
      gesture.current = { kind: "none" };
      showRing(0, 0, false);
      setCount(strokes.current.length);
    } else if (g.kind === "pinch" || g.kind === "wait") {
      // Don't start painting with the finger left over from a pinch.
      gesture.current = ptrs.current.size ? { kind: "wait" } : { kind: "none" };
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const v = view.current;
    const r = boxRef.current!.getBoundingClientRect();
    const [ix, iy] = toImage(e.clientX, e.clientY);
    v.k = Math.min(v.fit * 12, Math.max(v.fit * 0.6, v.k * Math.exp(-e.deltaY * 0.0015)));
    v.tx = e.clientX - r.left - ix * v.k;
    v.ty = e.clientY - r.top - iy * v.k;
    applyView();
  };

  const undo = () => {
    strokes.current.pop();
    replay();
    setCount(strokes.current.length);
  };
  const reset = () => {
    strokes.current = [];
    replay();
    setCount(0);
  };

  // ---------------------------------------------------------------- save
  const done = async () => {
    const c = work.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    if (!strokes.current.length) return onClose();
    setSaving(true);
    try {
      const W = c.width;
      const H = c.height;
      const data = ctx.getImageData(0, 0, W, H).data;
      let minX = W;
      let minY = H;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < H; y++) {
        const row = y * W * 4;
        for (let x = 0; x < W; x++) {
          if (data[row + x * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const empty = maxX < 0;
      if (empty) {
        toast("Everything is erased — undo or restore some of it first.");
        return;
      }
      const crop = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      const full = await createImageBitmap(c, crop.x, crop.y, crop.w, crop.h);
      const preview = await downscale(full, PREVIEW_MAX);
      const pc = document.createElement("canvas");
      pc.width = crop.w;
      pc.height = crop.h;
      pc.getContext("2d")!.drawImage(full, 0, 0);
      const png = await new Promise<Blob | null>((res) => pc.toBlob(res, "image/png"));
      pc.width = pc.height = 1;
      // Without the original we worked in cutout space, so the new box isn't a photo crop.
      applyTouchUp(job.id, { full, preview, crop: canRestore ? crop : undefined, png, empty: false });
      toast("Touch-up saved");
      onClose();
    } catch (err) {
      toast(`Couldn't save: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------- UI
  return (
    <div className="pt-safe pb-safe fixed inset-0 z-50 mx-auto flex max-w-[560px] flex-col bg-app">
      <header className="flex h-14 shrink-0 items-center justify-between px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel touch-up"
          className="press flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white"
        >
          <X size={22} strokeWidth={1.8} />
        </button>
        <h2 className="text-[17px] font-semibold">Touch up</h2>
        <button
          type="button"
          onClick={done}
          disabled={!ready || saving}
          className="press flex h-11 items-center gap-2 rounded-[14px] bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {saving && <Spinner light className="h-4 w-4" />} Done
        </button>
      </header>

      <div
        ref={boxRef}
        className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-[20px] border border-line"
        style={{ background: BACKDROP[bg], touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        data-testid="touchup-stage"
      >
        <div ref={holder} className="absolute inset-0" />
        <div
          ref={ringRef}
          className="pointer-events-none absolute left-0 top-0 rounded-full border-2 border-white opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
      </div>

      <p className="px-6 pt-2 text-center text-[12px] text-sub">One finger paints · two fingers zoom and move</p>

      <section className="shrink-0 px-4 pb-3 pt-2">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Brush">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "erase"}
            onClick={() => setMode("erase")}
            className={cx(
              "press flex h-12 items-center justify-center gap-2 rounded-2xl border text-[15px] font-semibold",
              mode === "erase" ? "border-ink bg-ink text-white" : "border-line bg-white",
            )}
          >
            <Eraser size={18} strokeWidth={1.8} /> Erase
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "restore"}
            disabled={!canRestore}
            onClick={() => setMode("restore")}
            className={cx(
              "press flex h-12 items-center justify-center gap-2 rounded-2xl border text-[15px] font-semibold disabled:opacity-40",
              mode === "restore" ? "border-ink bg-ink text-white" : "border-line bg-white",
            )}
          >
            <Paintbrush size={18} strokeWidth={1.8} /> Restore
          </button>
        </div>
        {!canRestore && (
          <p className="mt-1 text-center text-[12px] text-sub">Restore works on photos added after this update.</p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <span className="w-10 text-[14px] font-semibold">Brush</span>
          <input
            type="range"
            className="slider flex-1"
            min={8}
            max={90}
            step={1}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Brush size"
          />
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-white"
            aria-hidden
          >
            <span className="rounded-full bg-ink" style={{ width: Math.max(4, size / 2.5), height: Math.max(4, size / 2.5) }} />
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {(["checker", "white", "black"] as Backdrop[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBg(b)}
              aria-label={`${b} background`}
              aria-pressed={bg === b}
              className={cx("press h-11 w-11 shrink-0 rounded-[14px] border-2", bg === b ? "border-ink" : "border-line")}
              style={{ background: BACKDROP[b] }}
            />
          ))}
          <div className="flex-1" />
          <button
            type="button"
            onClick={undo}
            disabled={!count}
            className="press flex h-11 items-center gap-1.5 rounded-[14px] border border-line bg-white px-3 text-[14px] font-semibold disabled:opacity-40"
          >
            <Undo2 size={18} strokeWidth={1.8} /> Undo
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!count}
            aria-label="Reset all"
            className="press flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white disabled:opacity-40"
          >
            <RotateCcw size={18} strokeWidth={1.8} />
          </button>
        </div>
      </section>
    </div>
  );
}
