import type { Profile, WorkerIn, WorkerOut } from "@/workers/bg-removal.worker";
import { createStore, useStore } from "./store";

export interface ModelState {
  status: "idle" | "loading" | "ready" | "error";
  loaded: number;
  total: number;
  error?: string;
}

export const modelStore = createStore<ModelState>({ status: "idle", loaded: 0, total: 0 });
export const useModel = () => useStore(modelStore);

type Handler = (msg: WorkerOut) => void;

function isPhone(): boolean {
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** GB of RAM (Chrome only; other browsers report nothing). */
function deviceMemory(): number | undefined {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}

/** Phones and low-RAM devices: smaller model on CPU, smaller working size — avoids tab crashes. */
export function deviceProfile(): Profile & { maxSide: number } {
  const mem = deviceMemory();
  const lowMemory = isPhone() || (mem !== undefined && mem <= 4);
  const maxSide = !lowMemory ? 4096 : mem !== undefined && mem >= 8 ? 3072 : 2048;
  return { lowMemory, maxSide };
}

let worker: Worker | null = null;
const handlers = new Map<string, Handler>();

function getWorker(): Worker {
  if (worker) return worker;
  // Bundled separately by scripts/build-worker.mjs (see there for why).
  worker = new Worker("/workers/bg-removal.js", { type: "module", name: "bg-removal" });
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    switch (msg.type) {
      case "preload-progress":
        modelStore.set({ status: "loading", loaded: msg.loaded, total: msg.total });
        return;
      case "preloaded":
        modelStore.set((s) => ({ ...s, status: "ready" }));
        return;
      case "preload-error":
        modelStore.set((s) => ({ ...s, status: "error", error: msg.message }));
        return;
      default:
        if ("id" in msg) {
          if (msg.type === "progress" && msg.stage === "download") {
            modelStore.set((s) => ({ ...s, status: "loading" }));
          }
          if (msg.type === "done") modelStore.set((s) => ({ ...s, status: "ready" }));
          handlers.get(msg.id)?.(msg);
        }
    }
  };
  worker.onerror = (e) => {
    console.error("bg worker error", e.message);
  };
  return worker;
}

function send(msg: WorkerIn) {
  getWorker().postMessage(msg);
}

/** Warm up the model (download + compile) after first paint. Cached by the service worker afterwards. */
export function preloadModel() {
  if (typeof window === "undefined") return;
  const s = modelStore.get().status;
  if (s === "loading" || s === "ready") return;
  modelStore.set((st) => ({ ...st, status: "loading" }));
  send({ type: "preload", profile: deviceProfile() });
}

export function processInWorker(id: string, file: Blob, previewMax: number, onMessage: Handler) {
  handlers.set(id, onMessage);
  const profile = deviceProfile();
  send({ type: "process", id, file, maxSide: profile.maxSide, previewMax, profile });
}

export function releaseHandler(id: string) {
  handlers.delete(id);
}
