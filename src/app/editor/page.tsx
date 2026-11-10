"use client";

import { useGesture } from "@use-gesture/react";
import { Check, ChevronLeft, Crosshair, ImagePlus, Paintbrush, Stamp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePhotoPicker } from "@/components/AppProviders";
import { TouchUp } from "@/components/TouchUp";
import { Button, IconButton, Pill, Sheet, Spinner, Switch, cx, toast } from "@/components/ui";
import { LS, MAX_SCALE, MIN_SCALE, RATIOS, RATIO_VALUE, WATERMARK_SRC } from "@/lib/constants";
import { removeJob, restoreJobs, setActiveJob, updateComp, updateCompAll, useJobs } from "@/lib/jobs";
import { openImageInput } from "@/lib/image";
import { watermarkRect } from "@/lib/render";
import { setDefaultTemplate, useSettings } from "@/lib/settings";
import { lsSet } from "@/lib/store";
import { fullUrl, loadFullTemplate, thumbUrl, uploadTemplate, useTemplates } from "@/lib/templates";
import type { Ratio } from "@/lib/types";

const SNAP_PX = 8;
const WM_ASPECT = 885 / 705;

export default function Editor() {
  const router = useRouter();
  const openPicker = usePhotoPicker();
  const { jobs, activeId } = useJobs();
  const job = jobs.find((j) => j.id === activeId) ?? jobs[0];
  const settings = useSettings();
  const { list: templates } = useTemplates();
  const [restored, setRestored] = useState(false);
  const [armDel, setArmDel] = useState(false);
  const [touchUp, setTouchUp] = useState(false);

  useEffect(() => {
    void restoreJobs().then(() => setRestored(true));
  }, []);

  // ---------------------------------------------------------------- frame sizing
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setStage((s) => (Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [job?.id]);

  const ratio: Ratio = job?.comp.ratio ?? "3:4";
  const r = RATIO_VALUE[ratio];
  const W = stage.w && stage.h ? Math.floor(Math.min(stage.w, stage.h * r)) : 0;
  const H = W ? Math.floor(W / r) : 0;
  const aspect = job?.aspect ?? 1;
  const minSide = Math.min(W, H);
  const baseW = aspect >= 1 ? minSide : minSide * aspect;
  const baseH = aspect >= 1 ? minSide / aspect : minSide;

  // ---------------------------------------------------------------- live transform (refs + rAF only)
  const productRef = useRef<HTMLCanvasElement>(null);
  const guideVRef = useRef<HTMLDivElement>(null);
  const guideHRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const pos = useRef({ x: 0.5, y: 0.5, s: 0.7 });
  const geom = useRef({ W: 0, H: 0, baseW: 0, baseH: 0 });
  const raf = useRef(0);
  useLayoutEffect(() => {
    geom.current = { W, H, baseW, baseH };
  }, [W, H, baseW, baseH]);

  const apply = useCallback(() => {
    raf.current = 0;
    const el = productRef.current;
    if (!el) return;
    const { W: fw, H: fh, baseW: bw, baseH: bh } = geom.current;
    const { x, y, s } = pos.current;
    el.style.transform = `translate3d(${x * fw - bw / 2}px, ${y * fh - bh / 2}px, 0) scale(${s})`;
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(apply);
  }, [apply]);

  const setGuides = (v: boolean, h: boolean) => {
    if (guideVRef.current) guideVRef.current.style.opacity = v ? "1" : "0";
    if (guideHRef.current) guideHRef.current.style.opacity = h ? "1" : "0";
  };

  // Sync refs from committed state when the job / ratio / frame changes.
  const jobId = job?.id;
  const cx_ = job?.comp.x;
  const cy_ = job?.comp.y;
  const cs_ = job?.comp.s;
  useLayoutEffect(() => {
    if (cx_ === undefined || cy_ === undefined || cs_ === undefined) return;
    pos.current = { x: cx_, y: cy_, s: cs_ };
    if (sliderRef.current) sliderRef.current.value = String(cs_);
    apply();
  }, [jobId, cx_, cy_, cs_, W, H, baseW, baseH, apply]);

  // Draw the downscaled preview bitmap once per job.
  const preview = job?.preview;
  useEffect(() => {
    const c = productRef.current;
    if (!c || !preview) return;
    c.width = preview.width;
    c.height = preview.height;
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, c.width, c.height);
    ctx?.drawImage(preview, 0, 0);
  }, [preview]);

  useEffect(() => {
    if (job?.status === "ready" && job.empty) toast("No product found — try a photo with a clearer subject.");
  }, [job?.id, job?.status, job?.empty]);

  const commit = useCallback(() => {
    if (!jobId) return;
    const { x, y, s } = pos.current;
    updateComp(jobId, { x, y, s });
  }, [jobId]);

  // ---------------------------------------------------------------- gestures
  const frameRef = useRef<HTMLDivElement>(null);
  useGesture(
    {
      onDrag: ({ offset: [ox, oy], pinching, cancel, last, tap }) => {
        if (pinching) return cancel();
        if (tap) return;
        const { W: fw, H: fh } = geom.current;
        if (!fw) return;
        const snapV = Math.abs(ox - fw / 2) <= SNAP_PX;
        const snapH = Math.abs(oy - fh / 2) <= SNAP_PX;
        pos.current.x = snapV ? 0.5 : ox / fw;
        pos.current.y = snapH ? 0.5 : oy / fh;
        setGuides(!last && snapV, !last && snapH);
        schedule();
        if (last) commit();
      },
      onPinch: ({ offset: [s], last }) => {
        pos.current.s = s;
        if (sliderRef.current) sliderRef.current.value = String(s);
        schedule();
        if (last) commit();
      },
    },
    {
      target: frameRef,
      eventOptions: { passive: false },
      drag: {
        from: () => [pos.current.x * geom.current.W, pos.current.y * geom.current.H],
        bounds: () => ({
          left: -geom.current.W * 0.25,
          right: geom.current.W * 1.25,
          top: -geom.current.H * 0.25,
          bottom: geom.current.H * 1.25,
        }),
        rubberband: true,
        filterTaps: true,
      },
      pinch: {
        from: () => [pos.current.s, 0],
        scaleBounds: { min: MIN_SCALE, max: MAX_SCALE },
        rubberband: true,
      },
    },
  );

  // Slider: live via `input`, commit on `change` (release).
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const onInput = () => {
      pos.current.s = parseFloat(el.value);
      schedule();
    };
    el.addEventListener("input", onInput);
    el.addEventListener("change", commit);
    return () => {
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", commit);
    };
  }, [schedule, commit, jobId]);

  const centre = () => {
    pos.current.x = 0.5;
    pos.current.y = 0.5;
    schedule();
    commit();
  };

  // ---------------------------------------------------------------- template / ratio / watermark
  const template = templates.find((t) => t.id === job?.comp.templateId) ?? null;
  const [fullLoaded, setFullLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (template) void loadFullTemplate(template).catch(() => {}); // warm the export cache
  }, [template]);

  const pickTemplate = (id: string) => {
    updateCompAll({ templateId: id });
    setDefaultTemplate(id); // last-used template becomes the default
  };

  const pickRatio = (ra: Ratio) => {
    updateCompAll({ ratio: ra });
    lsSet(LS.ratio, ra);
  };

  const uploadInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const onUploadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const t = await uploadTemplate(f);
      pickTemplate(t.id);
      toast("Template saved");
    } catch (err) {
      toast(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const wmMaster = settings.watermark.enabled;
  const showWm = !!job?.comp.watermark && wmMaster;
  const wm = W ? watermarkRect(W, H, WM_ASPECT, settings.watermark) : null;

  // ---------------------------------------------------------------- render
  if (!job) {
    return (
      <main className="pt-safe mx-auto flex min-h-dvh max-w-[520px] flex-col items-center justify-center px-6 text-center">
        {restored ? (
          <>
            <p className="text-[16px] text-sub">Nothing to edit yet.</p>
            <Button className="mt-6" onClick={openPicker}>
              Choose a photo
            </Button>
          </>
        ) : (
          <Spinner />
        )}
      </main>
    );
  }

  const ready = job.status === "ready";

  return (
    <main className="pt-safe mx-auto flex h-dvh max-w-[560px] flex-col overflow-hidden bg-app">
      <header className="flex h-14 shrink-0 items-center justify-between px-4">
        <div className="flex w-[100px] gap-2">
          <IconButton aria-label="Back" onClick={() => router.push("/home")}>
            <ChevronLeft size={22} strokeWidth={1.8} />
          </IconButton>
          <IconButton aria-label="Delete this photo" onClick={() => setArmDel(true)} style={{ color: "#c62828" }}>
            <Trash2 size={20} strokeWidth={1.8} />
          </IconButton>
        </div>
        <h1 className="text-[17px] font-semibold">Edit</h1>
        <button
          type="button"
          disabled={!ready}
          onClick={() => router.push("/export")}
          className="press h-11 w-[100px] rounded-[14px] bg-ink text-[15px] font-semibold text-white disabled:opacity-40"
        >
          Export
        </button>
      </header>

      {jobs.length > 1 && (
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-2" aria-label="Photos in this batch">
          {jobs.map((j, i) => (
            <button
              key={j.id}
              type="button"
              onClick={() => setActiveJob(j.id)}
              aria-label={`Photo ${i + 1}`}
              aria-current={j.id === job.id}
              className={cx(
                "press relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 bg-white",
                j.id === job.id ? "border-ink" : "border-transparent",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={j.sourceUrl} alt="" className="h-full w-full object-cover" />
              {j.status === "processing" && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Spinner className="h-4 w-4" />
                </span>
              )}
              {j.status === "error" && <span className="absolute inset-0 bg-white/70 text-[10px] leading-[44px]">Error</span>}
            </button>
          ))}
        </div>
      )}

      {/* Stage */}
      <div ref={stageRef} className="relative min-h-0 flex-1 px-4">
        <div className="flex h-full w-full items-center justify-center">
          <div
            ref={frameRef}
            className="relative overflow-hidden rounded-[6px] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.10)]"
            style={{ width: W, height: H, touchAction: "none", contain: "layout paint" }}
            data-testid="editor-frame"
          >
            {template && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(template)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={template.id}
                  src={fullUrl(template)}
                  alt=""
                  crossOrigin="anonymous"
                  decoding="async"
                  onLoad={() => setFullLoaded(template.id)}
                  className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
                  style={{ opacity: fullLoaded === template.id ? 1 : 0 }}
                  draggable={false}
                />
              </>
            )}

            <canvas
              ref={productRef}
              aria-label="Product"
              className="absolute left-0 top-0"
              style={{
                width: baseW,
                height: baseH,
                transformOrigin: "50% 50%",
                willChange: "transform",
                opacity: ready ? 1 : 0,
              }}
            />

            {showWm && wm && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={WATERMARK_SRC[settings.watermark.variant]}
                alt=""
                className="pointer-events-none absolute"
                style={{ left: wm.x, top: wm.y, width: wm.w, height: wm.h, opacity: settings.watermark.opacity }}
                draggable={false}
              />
            )}

            {/* Centre snap guides */}
            <div
              ref={guideVRef}
              className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink/70 opacity-0 transition-opacity duration-100"
            />
            <div
              ref={guideHRef}
              className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink/70 opacity-0 transition-opacity duration-100"
            />

            {!ready && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70">
                {job.status === "error" ? (
                  <p className="px-6 text-center text-[14px] text-sub">{job.error}</p>
                ) : (
                  <>
                    <Spinner />
                    <p className="text-[14px] font-semibold">Removing background…</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ratio pills */}
      <div className="flex shrink-0 justify-center gap-2 px-4 py-3" role="radiogroup" aria-label="Aspect ratio">
        {RATIOS.map((ra) => (
          <Pill key={ra} active={ra === ratio} onClick={() => pickRatio(ra)} role="radio" aria-checked={ra === ratio}>
            {ra}
          </Pill>
        ))}
      </div>

      {/* Bottom sheet */}
      <section className="pb-safe shrink-0 rounded-t-[28px] border-t border-line bg-white px-4 pt-4">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Templates">
          <button
            type="button"
            onClick={() => openImageInput(uploadInput.current)}
            disabled={uploading}
            className="press flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-dashed border-g5 text-[11px] font-semibold text-sub"
            aria-label="Upload template"
          >
            {uploading ? <Spinner className="h-4 w-4" /> : <ImagePlus size={20} strokeWidth={1.8} />}
            Upload
          </button>
          {templates.map((t) => {
            const sel = t.id === template?.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t.id)}
                aria-label={t.name ?? "Template"}
                aria-pressed={sel}
                className={cx(
                  "press relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 bg-g2",
                  sel ? "border-ink" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbUrl(t)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                {sel && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
          {!templates.length && (
            <div className="flex h-16 items-center px-2 text-[13px] text-sub">No templates yet — upload one.</div>
          )}
        </div>
        <input ref={uploadInput} type="file" accept="image/*" className="hidden" onChange={onUploadTemplate} />

        <div className="mt-3 flex items-center gap-3">
          <span className="w-10 text-[14px] font-semibold">Size</span>
          <input
            ref={sliderRef}
            type="range"
            className="slider flex-1"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.01}
            defaultValue={job.comp.s}
            aria-label="Product size"
          />
          <button
            type="button"
            onClick={centre}
            aria-label="Centre"
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-line"
          >
            <Crosshair size={18} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => setTouchUp(true)}
            disabled={!ready || !job.full}
            className="press flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-ink px-3 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            <Paintbrush size={18} strokeWidth={1.8} /> Touch up
          </button>
        </div>

        <div className="mb-1 flex h-14 items-center justify-between border-t border-line">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <Stamp size={20} strokeWidth={1.8} className="text-icon" /> Watermark
            {!wmMaster && (
              <Link href="/brand" className="text-[13px] font-medium text-sub underline">
                (off in Brand)
              </Link>
            )}
          </span>
          <Switch
            label="Watermark"
            checked={showWm}
            onChange={(v) => {
              if (!wmMaster) {
                router.push("/brand");
                return;
              }
              updateComp(job.id, { watermark: v });
            }}
          />
        </div>
      </section>

      {touchUp && job.full && <TouchUp key={job.id} job={job} onClose={() => setTouchUp(false)} />}

      <Sheet open={armDel} onClose={() => setArmDel(false)} label="Delete photo">
        <div className="pb-3">
          <h2 className="text-[20px] font-bold">Delete this photo?</h2>
          <p className="mt-1 text-[14px] text-sub">
            {jobs.length > 1 ? "It's removed from this batch and its saved draft." : "Its saved draft is removed."}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setArmDel(false)}>
              Cancel
            </Button>
            <Button
              style={{ background: "#c62828" }}
              onClick={() => {
                setArmDel(false);
                removeJob(job.id);
                toast("Photo deleted");
              }}
            >
              <Trash2 size={18} strokeWidth={1.8} /> Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
