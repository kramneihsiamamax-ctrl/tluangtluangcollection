"use client";

import { ChevronLeft, Download, FileImage, Images, Plus, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePhotoPicker } from "@/components/AppProviders";
import { Button, IconButton, Segmented, Spinner, Switch, toast } from "@/components/ui";
import { EXPORT_SIZES } from "@/lib/constants";
import { uploadCreation } from "@/lib/creations";
import { markExported, restoreJobs, updateComp, useJobs, type Job } from "@/lib/jobs";
import { renderComposite } from "@/lib/render";
import { exportFilename, saveFiles, shareFiles, toJpegFile } from "@/lib/save";
import { settingsStore, useSettings } from "@/lib/settings";
import { getTemplate, loadFullTemplate } from "@/lib/templates";
import type { ExportQuality } from "@/lib/types";

interface Rendered {
  key: string;
  file: File;
  url: string;
  width: number;
  height: number;
}

function renderKey(j: Job, q: ExportQuality) {
  const wm = settingsStore.get().watermark;
  return JSON.stringify([j.id, j.comp, q, wm]);
}

async function renderJob(j: Job, q: ExportQuality, suffix = ""): Promise<Rendered> {
  if (!j.full) throw new Error("Photo not ready");
  const st = settingsStore.get();
  const t = getTemplate(j.comp.templateId);
  const template = t ? await loadFullTemplate(t) : null;
  const { blob, width, height } = await renderComposite({
    template,
    cutout: j.full,
    comp: j.comp,
    quality: q,
    watermark: st.watermark,
    showWatermark: j.comp.watermark && st.watermark.enabled,
    jpegQuality: st.watermark.jpegQuality,
  });
  const file = toJpegFile(blob, exportFilename(new Date(), suffix));
  return { key: renderKey(j, q), file, url: URL.createObjectURL(file), width, height };
}

export default function ExportScreen() {
  const router = useRouter();
  const openPicker = usePhotoPicker();
  const { jobs, activeId } = useJobs();
  const job = jobs.find((j) => j.id === activeId) ?? jobs[0];
  const settings = useSettings();
  const [quality, setQuality] = useState<ExportQuality>("standard");
  const [current, setCurrent] = useState<Rendered | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const batch = useRef(new Map<string, Rendered>());
  const [batchMap, setBatchMap] = useState<Record<string, Rendered>>({});

  useEffect(() => {
    void restoreJobs().then(() => setRestored(true));
  }, []);

  // Re-render whenever the composition, quality or brand settings change.
  const key = job && job.status === "ready" ? renderKey(job, quality) + JSON.stringify(settings.watermark) : null;

  // Pre-render so Share/Save can call navigator.share synchronously within the tap (iOS needs that).
  useEffect(() => {
    if (!job || !key) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before an async render
    setError(null);
    renderJob(job, quality)
      .then((r) => {
        if (cancelled) {
          URL.revokeObjectURL(r.url);
          return;
        }
        setCurrent((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return r;
        });
        batch.current.set(job.id, r);
        setBatchMap((m) => ({ ...m, [job.id]: r }));
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Batch: render the other ready photos in the background for "Save all".
  const readyJobs = jobs.filter((j) => j.status === "ready" && j.full);
  const readySig = readyJobs.map((j) => renderKey(j, quality)).join("|");
  useEffect(() => {
    if (readyJobs.length < 2) return;
    let cancelled = false;
    (async () => {
      let i = 0;
      for (const j of readyJobs) {
        i++;
        const k = renderKey(j, quality);
        if (batch.current.get(j.id)?.key === k) continue;
        try {
          const r = await renderJob(j, quality, `-${i}`);
          if (cancelled) return;
          batch.current.set(j.id, r);
          setBatchMap((m) => ({ ...m, [j.id]: r }));
        } catch {
          /* skip */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readySig]);

  const ready = !!current && !!job && current.key === renderKey(job, quality);

  const recordExport = (j: Job, r: Rendered) => {
    if (j.exported?.key === r.key && j.exported.uploaded) return;
    markExported(j.id, r.key, false);
    void uploadCreation(r.file, "export", j.comp.ratio, j.comp.templateId)
      .then(() => markExported(j.id, r.key, true))
      .catch((e) => console.warn("export upload failed", e));
  };

  const act = async (mode: "share" | "save") => {
    if (!ready || !job || !current) return;
    setBusy(true);
    try {
      const res = mode === "share" ? await shareFiles([current.file]) : await saveFiles([current.file]);
      if (res !== "cancelled") {
        recordExport(job, current);
        if (res === "downloaded") toast("Saved to Downloads");
      }
    } finally {
      setBusy(false);
    }
  };
  const allFiles = readyJobs
    .map((j) => batchMap[j.id])
    .filter((r): r is Rendered => !!r && readyJobs.some((j) => r.key === renderKey(j, quality)));

  const allReady = readyJobs.length > 1 && allFiles.length === readyJobs.length;

  const saveAll = async () => {
    if (!allReady) return;
    setBusy(true);
    try {
      const res = await shareFiles(allFiles.map((r) => r.file));
      if (res !== "cancelled") {
        readyJobs.forEach((j) => {
          const r = batchMap[j.id];
          if (r) recordExport(j, r);
        });
        if (res === "downloaded") toast(`Saved ${allFiles.length} photos`);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!job) {
    return (
      <main className="pt-safe mx-auto flex min-h-dvh max-w-[520px] flex-col items-center justify-center px-6 text-center">
        {restored ? (
          <>
            <p className="text-[16px] text-sub">Nothing to export yet.</p>
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

  const [ew, eh] = EXPORT_SIZES[job.comp.ratio][quality];

  return (
    <main className="mx-auto flex h-dvh max-w-[560px] flex-col overflow-hidden bg-[#111111]">
      <header className="pt-safe flex shrink-0 items-center justify-between px-4 pb-2 text-white">
        <IconButton
          aria-label="Back to editor"
          onClick={() => router.back()}
          className="border-white/15 bg-white/10 text-white"
        >
          <ChevronLeft size={22} strokeWidth={1.8} />
        </IconButton>
        <h1 className="text-[17px] font-semibold">Export</h1>
        <span className="w-11" />
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6 py-3">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt="Export preview"
            className="max-h-full max-w-full rounded-[6px] object-contain shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
            data-testid="export-preview"
            data-width={current.width}
            data-height={current.height}
          />
        ) : null}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-[14px] font-semibold text-white">
              <Spinner light className="h-4 w-4" /> Rendering full quality…
            </span>
          </div>
        )}
        {error && <p className="px-6 text-center text-[14px] text-white/80">{error}</p>}
      </div>

      <section className="sheet-in pb-safe shrink-0 rounded-t-[28px] bg-white px-5 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-sub">Size</p>
            <p className="text-[18px] font-bold" data-testid="export-size">
              {ew} × {eh} px
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-g2 px-3 py-2 text-[13px] font-semibold text-sub">
            <FileImage size={16} strokeWidth={1.8} /> JPG · {job.comp.ratio}
          </div>
        </div>

        <div className="mt-4">
          <Segmented
            label="Quality"
            value={quality}
            onChange={setQuality}
            options={[
              { value: "standard", label: "Standard" },
              { value: "high", label: "High" },
            ]}
          />
        </div>

        <div className="mt-2 flex h-14 items-center justify-between">
          <span className="text-[15px] font-semibold">Watermark</span>
          <Switch
            label="Watermark"
            checked={job.comp.watermark && settings.watermark.enabled}
            onChange={(v) => {
              if (!settings.watermark.enabled) {
                router.push("/brand");
                return;
              }
              updateComp(job.id, { watermark: v });
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" disabled={!ready || busy} onClick={() => act("share")}>
            <Share2 size={20} strokeWidth={1.8} /> Share
          </Button>
          <Button disabled={!ready || busy} onClick={() => act("save")}>
            <Download size={20} strokeWidth={1.8} /> Save
          </Button>
        </div>

        {readyJobs.length > 1 && (
          <Button variant="secondary" block className="mt-3" disabled={!allReady || busy} onClick={saveAll}>
            {allReady ? <Images size={20} strokeWidth={1.8} /> : <Spinner className="h-4 w-4" />}
            Save all ({readyJobs.length})
          </Button>
        )}

        <button
          type="button"
          onClick={openPicker}
          className="press mx-auto mt-2 flex h-12 items-center gap-1.5 text-[15px] font-semibold text-sub"
        >
          <Plus size={18} /> Create another
        </button>
      </section>
    </main>
  );
}
