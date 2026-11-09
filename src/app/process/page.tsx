"use client";

import { Check, ChevronLeft, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePhotoPicker } from "@/components/AppProviders";
import { Button, IconButton, Spinner, cx } from "@/components/ui";
import { useModel } from "@/lib/bg";
import { retryJob, restoreJobs, useJobs, type Job } from "@/lib/jobs";

const STEPS = ["Upload", "Remove background", "Place on template"] as const;

function stepIndex(j: Job) {
  if (j.status === "ready") return 3;
  if (j.stage === "upload") return 0;
  if (j.stage === "place") return 2;
  return 1;
}

export default function Processing() {
  const router = useRouter();
  const openPicker = usePhotoPicker();
  const { jobs, activeId } = useJobs();
  const model = useModel();
  const job = jobs.find((j) => j.id === activeId) ?? jobs[0];

  useEffect(() => {
    void restoreJobs();
  }, []);

  // Auto-advance to the editor as soon as the first photo is ready (others continue in the background).
  useEffect(() => {
    if (job?.status === "ready") {
      const t = setTimeout(() => router.replace("/editor"), 350);
      return () => clearTimeout(t);
    }
  }, [job?.status, router]);

  if (!job) {
    return (
      <main className="pt-safe mx-auto flex min-h-dvh max-w-[520px] flex-col items-center justify-center px-6 text-center">
        <p className="text-[16px] text-sub">No photo selected.</p>
        <Button className="mt-6" onClick={openPicker}>
          Choose a photo
        </Button>
      </main>
    );
  }

  const idx = stepIndex(job);
  const pct = Math.round(job.progress * 100);
  const label =
    job.status === "error"
      ? "Something went wrong"
      : job.stage === "download"
        ? "Downloading AI model (first time only)…"
        : idx >= 2
          ? "Placing on template…"
          : "Removing background…";

  return (
    <main className="page-in pt-safe pb-safe mx-auto flex min-h-dvh max-w-[520px] flex-col px-4">
      <header className="flex h-14 items-center gap-3">
        <IconButton aria-label="Back" onClick={() => router.replace("/home")}>
          <ChevronLeft size={22} strokeWidth={1.8} />
        </IconButton>
        <h1 className="text-[17px] font-semibold">
          Processing{jobs.length > 1 ? ` · ${jobs.indexOf(job) + 1} of ${jobs.length}` : ""}
        </h1>
      </header>

      <div className="relative mt-2 overflow-hidden rounded-[28px] border border-line bg-g2" style={{ aspectRatio: "3 / 4" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={job.sourceUrl} alt="Your product photo" className="h-full w-full object-contain" decoding="async" />
        <div className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-5">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-white" aria-live="polite">
            {job.status === "processing" && <Spinner light className="h-4 w-4" />}
            {label}
          </div>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full w-full origin-left rounded-full bg-white"
              style={{
                transform: `scaleX(${job.progress})`,
                // While the model runs (no progress events), creep forward slowly.
                transition:
                  job.stage === "remove" && job.progress >= 0.5
                    ? "transform 7s cubic-bezier(0.1, 0.6, 0.3, 1)"
                    : "transform 300ms ease-out",
              }}
            />
          </div>
          {job.stage === "download" && (
            <p className="mt-2 text-[12px] text-white/80">
              {model.total ? `${(model.loaded / 1e6).toFixed(0)} / ${(model.total / 1e6).toFixed(0)} MB` : ""} · cached
              for offline use
            </p>
          )}
        </div>
      </div>

      <ol className="mt-5 space-y-2">
        {STEPS.map((s, i) => {
          const done = i < idx || (i === 0 && idx >= 1);
          const active = i === idx && job.status === "processing";
          return (
            <li key={s} className="flex h-12 items-center gap-3 rounded-2xl border border-line bg-white px-4">
              <span
                className={cx(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold",
                  done ? "bg-ink text-white" : active ? "border-2 border-ink" : "border border-g4 text-sub",
                )}
              >
                {done ? <Check size={16} strokeWidth={2.4} /> : active ? <Spinner className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cx("text-[15px]", done || active ? "font-semibold text-ink" : "text-sub")}>{s}</span>
            </li>
          );
        })}
      </ol>

      {job.status === "error" && (
        <div className="mt-4 rounded-2xl border border-line bg-white p-4">
          <p className="text-[14px] text-sub">{job.error}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={openPicker}>
              Pick another
            </Button>
            <Button onClick={() => retryJob(job.id)}>
              <RotateCcw size={18} /> Retry
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
