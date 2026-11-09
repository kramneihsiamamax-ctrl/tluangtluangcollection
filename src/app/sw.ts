/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Background-removal model + ONNX WASM (served by IMG.LY's CDN). Immutable, versioned URLs.
    {
      matcher: ({ url }) => url.hostname === "staticimgly.com",
      handler: new CacheFirst({
        cacheName: "bg-removal-model",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    // Template thumbnails (~400px JPEG).
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/public/templates/thumbs/"),
      handler: new CacheFirst({
        cacheName: "template-thumbs",
        plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    // Full-resolution templates (only fetched when selected or exported).
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/public/templates/full/"),
      handler: new CacheFirst({
        cacheName: "template-full",
        plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
