"use client";

import { SerwistProvider } from "@serwist/next/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { preloadModel } from "@/lib/bg";
import { startBatch } from "@/lib/jobs";
import { initSettings } from "@/lib/settings";
import { initTemplates } from "@/lib/templates";
import { ToastHost } from "./ui";

const PickerContext = createContext<() => void>(() => {});
/** Opens the system photo picker (camera or gallery, multi-select). */
export const usePhotoPicker = () => useContext(PickerContext);

function afterFirstPaint(fn: () => void) {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  requestAnimationFrame(() => setTimeout(() => (ric ? ric(fn, { timeout: 2500 }) : fn()), 0));
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initSettings();
    initTemplates();
    // Warm up the background-removal model once the first frame is on screen.
    afterFirstPaint(preloadModel);
  }, []);

  const open = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.value = "";
    el.click();
  }, []);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(
      (f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name),
    );
    if (!files.length) return;
    startBatch(files);
    router.push("/process");
  };

  return (
    <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV !== "production"}>
      <PickerContext.Provider value={open}>
        {children}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={onFiles}
          data-testid="photo-input"
        />
        <ToastHost />
      </PickerContext.Provider>
    </SerwistProvider>
  );
}
