import type { WorkerIn, WorkerOut } from "@/workers/bg-removal.worker";
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
  send({ type: "preload" });
}

export function processInWorker(id: string, file: Blob, maxSide: number, previewMax: number, onMessage: Handler) {
  handlers.set(id, onMessage);
  send({ type: "process", id, file, maxSide, previewMax });
}

export function releaseHandler(id: string) {
  handlers.delete(id);
}
