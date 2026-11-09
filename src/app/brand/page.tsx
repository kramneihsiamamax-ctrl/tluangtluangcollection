"use client";

import { useEffect, useRef, useState } from "react";
import { AboutSheet } from "@/components/AboutSheet";
import { LogoTile } from "@/components/Decor";
import { TabPage } from "@/components/TabBar";
import { Card, Segmented, Switch, cx } from "@/components/ui";
import { WATERMARK_SRC } from "@/lib/constants";
import { watermarkRect } from "@/lib/render";
import { updateWatermark, useSettings } from "@/lib/settings";
import { resolveTemplateId, thumbUrl, useTemplates } from "@/lib/templates";
import type { JpegQuality, WatermarkSize, WatermarkVariant } from "@/lib/types";

const WM_ASPECT = 885 / 705;
const POSITIONS = ["Top left", "Top centre", "Top right", "Middle left", "Centre", "Middle right", "Bottom left", "Bottom centre", "Bottom right"];

export default function BrandScreen() {
  const settings = useSettings();
  const wm = settings.watermark;
  const { list } = useTemplates();
  const [about, setAbout] = useState(false);
  const tId = resolveTemplateId(settings.defaultTemplateId);
  const template = list.find((t) => t.id === tId);

  // Measure the preview box for an exact (pixel) watermark preview.
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const r = box.w ? watermarkRect(box.w, box.h, WM_ASPECT, wm) : null;

  // Opacity slider: uncontrolled while dragging, commit on release.
  const opRef = useRef<HTMLInputElement>(null);
  const [opLabel, setOpLabel] = useState(Math.round(wm.opacity * 100));
  useEffect(() => {
    if (opRef.current) opRef.current.value = String(Math.round(wm.opacity * 100));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the label in sync with remote settings
    setOpLabel(Math.round(wm.opacity * 100));
  }, [wm.opacity]);

  return (
    <TabPage>
      <header className="pb-3 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight">Brand</h1>
      </header>

      <Card className="flex items-center gap-4 p-4">
        <LogoTile size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">TluangTluang Collection</p>
          <p className="text-[13px] text-sub">Your watermark logo</p>
        </div>
        <button
          type="button"
          onClick={() => setAbout(true)}
          className="press h-11 rounded-[14px] border border-line px-3 text-[14px] font-semibold"
        >
          About
        </button>
      </Card>

      {/* Live preview */}
      <div
        ref={boxRef}
        className="relative mx-auto mt-3 w-[62%] max-w-[300px] overflow-hidden rounded-[22px] border border-line bg-g2 shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
        style={{ aspectRatio: "3 / 4" }}
        aria-label="Watermark preview"
      >
        {template && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl(template)} alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" />
        )}
        {wm.enabled && r && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={WATERMARK_SRC[wm.variant]}
            alt=""
            className="absolute transition-[left,top,width,height,opacity] duration-150"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, opacity: wm.opacity }}
          />
        )}
        {!wm.enabled && (
          <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-white/90 px-3 py-1 text-[13px] font-semibold">
            Watermark off
          </span>
        )}
      </div>

      <Card className="mt-3 divide-y divide-line">
        <Row label="Watermark" sub="Show your logo on photos">
          <Switch label="Watermark enabled" checked={wm.enabled} onChange={(v) => updateWatermark({ enabled: v })} />
        </Row>
        <Row label="Apply to every photo" sub="New photos start with the watermark on">
          <Switch label="Apply to every photo" checked={wm.applyAll} onChange={(v) => updateWatermark({ applyAll: v })} />
        </Row>
      </Card>

      <Card className="mt-3 p-4">
        <p className="text-[15px] font-semibold">Position</p>
        <div className="mx-auto mt-3 grid w-full max-w-[240px] grid-cols-3 gap-2" role="radiogroup" aria-label="Position">
          {POSITIONS.map((name, i) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={wm.position === i}
              aria-label={name}
              onClick={() => updateWatermark({ position: i })}
              className={cx(
                "press flex aspect-square items-center justify-center rounded-xl border",
                wm.position === i ? "border-ink bg-ink" : "border-line bg-g2",
              )}
            >
              <span className={cx("h-2.5 w-2.5 rounded-full", wm.position === i ? "bg-white" : "bg-g5")} />
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-[15px] font-semibold">Opacity</p>
          <span className="text-[14px] font-semibold text-sub">{opLabel}%</span>
        </div>
        <input
          ref={opRef}
          type="range"
          className="slider"
          min={10}
          max={100}
          step={1}
          defaultValue={Math.round(wm.opacity * 100)}
          aria-label="Opacity"
          onInput={(e) => setOpLabel(parseInt((e.target as HTMLInputElement).value, 10))}
          onPointerUp={(e) => updateWatermark({ opacity: parseInt((e.target as HTMLInputElement).value, 10) / 100 })}
          onKeyUp={(e) => updateWatermark({ opacity: parseInt((e.target as HTMLInputElement).value, 10) / 100 })}
        />

        <p className="mt-3 text-[15px] font-semibold">Size</p>
        <div className="mt-2">
          <Segmented<WatermarkSize>
            label="Size"
            value={wm.size}
            onChange={(v) => updateWatermark({ size: v })}
            options={[
              { value: "S", label: "S" },
              { value: "M", label: "M" },
              { value: "L", label: "L" },
            ]}
          />
        </div>

        <p className="mt-5 text-[15px] font-semibold">Colour</p>
        <div className="mt-2">
          <Segmented<WatermarkVariant>
            label="Colour variant"
            value={wm.variant}
            onChange={(v) => updateWatermark({ variant: v })}
            options={[
              { value: "dark", label: <><Swatch className="bg-ink" /> Dark</> },
              { value: "light", label: <><Swatch className="border border-g4 bg-white" /> Light</> },
              {
                value: "color",
                label: (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/watermark-color.png" alt="" className="h-4 w-5 object-contain" /> Colour
                  </>
                ),
              },
            ]}
          />
        </div>
      </Card>

      <Card className="mt-3 p-4">
        <p className="text-[15px] font-semibold">JPEG quality</p>
        <p className="text-[13px] text-sub">Higher means larger files. 95% is recommended.</p>
        <div className="mt-3">
          <Segmented<JpegQuality>
            label="JPEG quality"
            value={wm.jpegQuality}
            onChange={(v) => updateWatermark({ jpegQuality: v })}
            options={[
              { value: 0.92, label: "92%" },
              { value: 0.95, label: "95%" },
              { value: 1, label: "100%" },
            ]}
          />
        </div>
      </Card>

      <AboutSheet open={about} onClose={() => setAbout(false)} />
    </TabPage>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-2">
      <div>
        <p className="text-[15px] font-semibold">{label}</p>
        <p className="text-[13px] text-sub">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Swatch({ className }: { className: string }) {
  return <span className={cx("inline-block h-3.5 w-3.5 rounded-full", className)} />;
}
