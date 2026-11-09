import { del, get, set } from "idb-keyval";
import { processInWorker, releaseHandler } from "./bg";
import { DEFAULT_SCALE, LS, PREVIEW_MAX } from "./constants";
import { uploadCreation } from "./creations";
import { downscale, heicToJpeg, isHeic } from "./image";
import { settingsStore } from "./settings";
import { createStore, lsGet, useStore } from "./store";
import { resolveTemplateId } from "./templates";
import type { Composition, Ratio } from "./types";


export type JobStatus = "processing" | "ready" | "error";

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  /** 0..1 */
  progress: number;
  stage: "upload" | "download" | "remove" | "place" | "done";
  error?: string;
  /** Object URL of what the user picked (for the Processing screen). */
  sourceUrl: string;
  originalBlob?: Blob;
  /** Full-resolution, alpha-trimmed cutout (memory only). */
  full?: ImageBitmap;
  /** ≤1440px cutout for the editor preview. */
  preview?: ImageBitmap;
  /** width / height of the cutout. */
  aspect: number;
  empty?: boolean;
  comp: Composition;
  /** Last export of this job, if any. */
  exported?: { key: string; uploaded: boolean };
}

interface JobsState {
  jobs: Job[];
  activeId: string | null;
}

export const jobsStore = createStore<JobsState>({ jobs: [], activeId: null });
export const useJobs = () => useStore(jobsStore);

function patchJob(id: string, patch: Partial<Job> | ((j: Job) => Partial<Job>)) {
  jobsStore.set((s) => ({
    ...s,
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...(typeof patch === "function" ? patch(j) : patch) } : j)),
  }));
}

export function getJob(id: string | null | undefined) {
  return jobsStore.get().jobs.find((j) => j.id === id);
}

export function getActiveJob() {
  const s = jobsStore.get();
  return s.jobs.find((j) => j.id === s.activeId) ?? s.jobs[0];
}

export function setActiveJob(id: string) {
  jobsStore.set((s) => ({ ...s, activeId: id }));
  void persistIndex();
}

function defaultComp(): Composition {
  const st = settingsStore.get();
  return {
    templateId: resolveTemplateId(st.defaultTemplateId),
    ratio: lsGet<Ratio>(LS.ratio) ?? "3:4",
    x: 0.5,
    y: 0.5,
    s: DEFAULT_SCALE,
    watermark: st.watermark.enabled && st.watermark.applyAll,
  };
}

function disposeJob(j: Job) {
  j.full?.close();
  j.preview?.close();
  URL.revokeObjectURL(j.sourceUrl);
  releaseHandler(j.id);
}

// ---------------------------------------------------------------- IndexedDB persistence
interface StoredJob {
  id: string;
  name: string;
  comp: Composition;
  original?: Blob;
  png?: Blob;
}

const IDX = "tc.jobs.index";

// All IndexedDB writes go through one queue: they are read-modify-write and a new batch
// clears the previous one, so ordering matters.
let idbQueue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  idbQueue = idbQueue.then(async () => {
    try {
      await task();
    } catch {
      /* IndexedDB unavailable — editing still works in memory */
    }
  });
  return idbQueue;
}

function persistIndex(): Promise<void> {
  const s = jobsStore.get();
  const value = { ids: s.jobs.map((j) => j.id), activeId: s.activeId };
  return enqueue(() => set(IDX, value));
}

function clearPersisted(): Promise<void> {
  return enqueue(async () => {
    const idx = await get<{ ids: string[] }>(IDX);
    await Promise.all((idx?.ids ?? []).map((id) => del(`tc.job.${id}`)));
    await del(IDX);
  });
}

function persistJob(id: string, patch: Partial<StoredJob>): Promise<void> {
  idbQueue = idbQueue.then(async () => {
    try {
      const cur = (await get<StoredJob>(`tc.job.${id}`)) ?? { id, name: "", comp: defaultComp() };
      await set(`tc.job.${id}`, { ...cur, ...patch });
    } catch {
      /* IndexedDB unavailable — editing still works in memory */
    }
  });
  return idbQueue;
}


let restoring: Promise<void> | null = null;

/** After a reload, rebuild the jobs (cutouts are kept in IndexedDB as PNG — never uploaded). */
export function restoreJobs(): Promise<void> {
  if (jobsStore.get().jobs.length) return Promise.resolve();
  if (restoring) return restoring;
  restoring = (async () => {
    try {
      const idx = await get<{ ids: string[]; activeId: string | null }>(IDX);
      if (!idx?.ids?.length) return;
      const jobs: Job[] = [];
      for (const id of idx.ids) {
        const sj = await get<StoredJob>(`tc.job.${id}`);
        if (!sj?.png || !sj.original) continue;
        const full = await createImageBitmap(sj.png);
        const preview = await downscale(full, PREVIEW_MAX);
        jobs.push({
          id,
          name: sj.name,
          status: "ready",
          progress: 1,
          stage: "done",
          sourceUrl: URL.createObjectURL(sj.original),
          originalBlob: sj.original,
          full,
          preview,
          aspect: full.width / full.height,
          comp: { ...sj.comp, templateId: resolveTemplateId(sj.comp.templateId) },
        });
      }
      if (jobs.length && !jobsStore.get().jobs.length) {
        jobsStore.set({ jobs, activeId: jobs.some((j) => j.id === idx.activeId) ? idx.activeId : jobs[0].id });
      }
    } catch (e) {
      console.warn("restore failed", e);
    }
  })();
  return restoring;
}

// ---------------------------------------------------------------- processing
function runJob(id: string, file: Blob) {
  processInWorker(id, file, PREVIEW_MAX, async (msg) => {
    switch (msg.type) {
      case "decode-failed": {
        if (isHeic(file as File) && file.type !== "image/jpeg") {
          try {
            const jpeg = await heicToJpeg(file);
            runJob(id, jpeg);
            return;
          } catch {
            /* fall through */
          }
        }
        patchJob(id, { status: "error", error: "This photo format isn't supported. Try a JPEG or PNG." });
        return;
      }
      case "original": {
        patchJob(id, { originalBlob: msg.blob, progress: 0.12, stage: "remove" });
        void persistJob(id, { original: msg.blob });
        // Store the original product photo (JPEG). Auto-deleted after 24 h.
        void uploadCreation(msg.blob, "original", null, null).catch((e) =>
          console.warn("original upload failed", e),
        );
        return;
      }
      case "progress": {
        if (msg.stage === "download") patchJob(id, { stage: "download", progress: 0.12 + 0.3 * msg.value });
        else if (msg.stage === "decode") patchJob(id, { stage: "remove", progress: 0.45 });
        else if (msg.stage === "inference") patchJob(id, { stage: "remove", progress: 0.5 });
        else if (msg.stage === "mask") patchJob(id, { stage: "place", progress: 0.85 });
        else patchJob(id, { stage: "place", progress: 0.92 });
        return;
      }
      case "done": {
        patchJob(id, {
          status: "ready",
          stage: "done",
          progress: 1,
          full: msg.full,
          preview: msg.preview,
          aspect: msg.crop.w / msg.crop.h,
          empty: msg.empty,
        });
        return;
      }
      case "png": {
        void persistJob(id, { png: msg.blob });
        releaseHandler(id);
        return;
      }
      case "error": {
        patchJob(id, { status: "error", error: msg.message || "Background removal failed." });
        releaseHandler(id);
        return;
      }
    }
  });
}

/** Start a new batch: each picked photo becomes its own job. */
export function startBatch(files: File[]) {
  const old = jobsStore.get().jobs;
  old.forEach(disposeJob);
  void clearPersisted();

  const jobs: Job[] = files.map((f) => ({
    id: crypto.randomUUID(),
    name: f.name,
    status: "processing",
    progress: 0.04,
    stage: "upload",
    sourceUrl: URL.createObjectURL(f),
    aspect: 1,
    comp: defaultComp(),
  }));
  jobsStore.set({ jobs, activeId: jobs[0]?.id ?? null });
  void persistIndex();
  jobs.forEach((j, i) => {
    void persistJob(j.id, { id: j.id, name: j.name, comp: j.comp });
    runJob(j.id, files[i]);
  });
}

export function retryJob(id: string) {
  const j = getJob(id);
  if (!j) return;
  patchJob(id, { status: "processing", error: undefined, progress: 0.04, stage: "upload" });
  void fetch(j.sourceUrl)
    .then((r) => r.blob())
    .then((b) => runJob(id, b));
}

/** Commit a composition change (called on gesture end, not per frame). */
export function updateComp(id: string, patch: Partial<Composition>) {
  patchJob(id, (j) => ({ comp: { ...j.comp, ...patch }, exported: undefined }));
  const j = getJob(id);
  if (j) void persistJob(id, { comp: j.comp });
}

/** Apply a template/ratio/watermark choice to every job in the batch. */
export function updateCompAll(patch: Partial<Composition>) {
  jobsStore.get().jobs.forEach((j) => updateComp(j.id, patch));
}

export function markExported(id: string, key: string, uploaded: boolean) {
  patchJob(id, { exported: { key, uploaded } });
}
